import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import Stripe from 'stripe';
import {paymentEventStatus,paymentsConfigured,stripeClient} from '../lib/payments.ts';
test('signed Stripe events: reject tampering, ignore unpaid completion and block live events',()=>{
 const stripe=new Stripe('sk_test_fixture');
 const payload=JSON.stringify({id:'evt_fixture',type:'checkout.session.completed',livemode:false,data:{object:{payment_status:'paid',livemode:false}}});
 const secret='whsec_fixture';const header=stripe.webhooks.generateTestHeaderString({payload,secret});
 const event=stripe.webhooks.constructEvent(payload,header,secret);
 assert.equal(paymentEventStatus(event.type,event.data.object as any),'paid');
 assert.throws(()=>stripe.webhooks.constructEvent(payload+' ',header,secret));
 assert.throws(()=>stripe.webhooks.constructEvent(payload,header,'whsec_wrong'));
 assert.equal(paymentEventStatus('checkout.session.completed',{livemode:false,payment_status:'unpaid'}),null);
 assert.equal(paymentEventStatus('checkout.session.async_payment_succeeded',{livemode:false,payment_status:'paid'}),'paid');
 assert.equal(paymentEventStatus('checkout.session.async_payment_failed',{livemode:false,payment_status:'unpaid'}),'failed');
 assert.throws(()=>paymentEventStatus(event.type,{livemode:true,payment_status:'paid'}));
 const saved=process.env.STRIPE_SECRET_KEY;try{process.env.STRIPE_SECRET_KEY='sk_live_fixture';assert.equal(paymentsConfigured(),false);assert.throws(()=>stripeClient());}finally{if(saved===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=saved}
});
test('payment database: rider isolation, privileged writes and repeat/retry reservations',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;grant execute on function auth.uid() to authenticated;`);
 for(const f of ['001_kyn.sql','002_test_payments.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 const rider='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 for(const id of [rider,other])await db.query(`insert into auth.users values($1,'{}')`,[id]);
 const b=(await db.query<any>(`insert into bookings(rider_id,origin,destination,service,scheduled_at,status,amount_cents,duration_minutes,request_id) values($1,'union','washington','walk',now(),'completed',1950,20,gen_random_uuid()) returning id`,[rider])).rows[0].id;
 await db.exec('set role service_role');
 await assert.rejects(()=>db.query('select reserve_test_payment($1,$2)',[b,other]),/Completed rider/);
 const p=(await db.query<any>('select (reserve_test_payment($1,$2)).*',[b,rider])).rows[0];
 assert.equal(p.amount_cents,1950);
 assert.equal((await db.query<any>('select (reserve_test_payment($1,$2)).*',[b,rider])).rows[0].attempt_id,p.attempt_id);
 await db.query(`update journey_payments set status='expired' where booking_id=$1`,[b]);
 const retry=(await db.query<any>('select (reserve_test_payment($1,$2)).*',[b,rider])).rows[0];assert.notEqual(retry.attempt_id,p.attempt_id);
 await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[other]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from journey_payments')).rows.length,0);
 await assert.rejects(()=>db.query('select reserve_test_payment($1,$2)',[b,rider]),/permission denied/);
 await assert.rejects(()=>db.query(`update journey_payments set status='paid'`),/permission denied/);
 await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[rider]);await db.exec('set role authenticated');assert.equal((await db.query('select * from journey_payments')).rows.length,1);
 }finally{await db.close()}
});
