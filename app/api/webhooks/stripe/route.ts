import {NextRequest,NextResponse} from 'next/server';
import {stripeClient,paymentDatabase,paymentEventStatus} from '@/lib/payments';
export async function POST(req:NextRequest){
 const secret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!secret)return NextResponse.json({error:'Webhook is not configured.'},{status:503});
 const raw=await req.text();
 if(raw.length>1000000)return new NextResponse(null,{status:413});
 let event;
 try{event=stripeClient().webhooks.constructEvent(raw,req.headers.get('stripe-signature')||'',secret)}catch{return NextResponse.json({error:'Invalid webhook signature.'},{status:400})}
 if(event.livemode)return NextResponse.json({error:'Live events are disabled.'},{status:400});
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return NextResponse.json({received:true});
 try{
 const session=event.data.object as import('stripe').Stripe.Checkout.Session;
 if(!session.metadata?.booking_id||!session.metadata?.attempt_id)return NextResponse.json({received:true});
 const status=paymentEventStatus(event.type,session);
 if(!status)return NextResponse.json({received:true});
 const db=paymentDatabase();
 const {data:p,error}=await db.from('journey_payments').select('*').eq('booking_id',session.metadata?.booking_id||'').single();
 if(error||!p)throw Error('Payment record not found');
 if(p.attempt_id!==session.metadata?.attempt_id)return NextResponse.json({received:true});
 if((p.session_id&&p.session_id!==session.id)||session.currency!=='usd'||session.amount_total!==p.amount_cents||session.client_reference_id!==p.booking_id) return NextResponse.json({error:'Payment does not match journey.'},{status:400});
 // Repeated and out-of-order events cannot downgrade a paid record.
 const update=await db.from('journey_payments').update({status,session_id:session.id,updated_at:new Date().toISOString()}).eq('booking_id',p.booking_id).eq('attempt_id',p.attempt_id).neq('status','paid');
 if(update.error)throw update.error;
 return NextResponse.json({received:true});
 }catch{return NextResponse.json({error:'Payment update failed; retry delivery.'},{status:500})}
}
