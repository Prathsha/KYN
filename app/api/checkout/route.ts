import {NextRequest} from 'next/server';
import {z} from 'zod';
import {client,body,json,fail,ApiError} from '@/lib/server';
import {paymentsConfigured,stripeClient,paymentDatabase} from '@/lib/payments';
export async function POST(req:NextRequest){try{
 const {db,user}=await client(req);
 const {id}=z.object({id:z.uuid()}).parse(await body(req));
 if(!paymentsConfigured())throw new ApiError('Test checkout is not configured yet.',503);
 const {data:journey}=await db.from('bookings').select('id,rider_id,status,service').eq('id',id).single();
 if(!journey||journey.rider_id!==user.id||journey.status!=='completed')throw new ApiError('Open a completed journey from your own account.',409);
 const admin=paymentDatabase();
 const {data:p,error}=await admin.rpc('reserve_test_payment',{p_booking:id,p_rider:user.id});
 if(error||!p)throw new ApiError('Unable to prepare test checkout.',500);
 if(p.status==='paid')throw new ApiError('This journey already has a successful test payment.',409);
 const stripe=stripeClient();
 let session;
 if(p.session_id) session=await stripe.checkout.sessions.retrieve(p.session_id);
 else {
 const origin=process.env.KYN_SITE_URL;
 if(!origin||new URL(origin).protocol!=='https:')throw new ApiError('Checkout return address is not configured.',503);
 session=await stripe.checkout.sessions.create({mode:'payment',integration_identifier:'kyn_test_journeys_qmrtzvpa',client_reference_id:id,metadata:{booking_id:id,attempt_id:p.attempt_id},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:p.amount_cents,product_data:{name:`KYN ${journey.service==='walk'?'Walk Home':'Subway Together'} — test payment`}}}],success_url:`${origin}/?journey=${id}&checkout=returned`,cancel_url:`${origin}/?journey=${id}&checkout=cancelled`,expires_at:Math.floor(Date.now()/1000)+1800},{idempotencyKey:`kyn-test-${p.attempt_id}`});
 const saved=await admin.from('journey_payments').update({session_id:session.id}).eq('booking_id',id).eq('attempt_id',p.attempt_id);
 if(saved.error)throw new ApiError('Unable to save checkout. Please retry.',500);
 }
 if(session.livemode||session.status!=='open'||!session.url)throw new ApiError('Checkout is processing or closed. Refresh your journey shortly.',409);
 return json({url:session.url});
}catch(e){return fail(e)}}
