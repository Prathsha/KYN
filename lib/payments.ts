import Stripe from 'stripe';
import {createClient} from '@supabase/supabase-js';

export function paymentsConfigured() {
 return process.env.KYN_TEST_PAYMENTS_ENABLED==='true' && /^(rk|sk)_test_/.test(process.env.STRIPE_SECRET_KEY||'') && !!process.env.STRIPE_WEBHOOK_SECRET && !!process.env.SUPABASE_SECRET_KEY;
}
export function stripeClient() {
 const key=process.env.STRIPE_SECRET_KEY||'';
 if(!/^(rk|sk)_test_/.test(key)) throw new Error('Only Stripe test keys are supported.');
 return new Stripe(key,{apiVersion:'2026-09-30.endive',maxNetworkRetries:2});
}
export function paymentDatabase() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key) throw new Error('Payment database is not configured.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
// Browser redirects never provide evidence of payment.
export function paymentEventStatus(type:string, session:{livemode:boolean;payment_status:string}) {
 if(session.livemode) throw new Error('Live events are disabled.');
 if((type==='checkout.session.completed'||type==='checkout.session.async_payment_succeeded')&&session.payment_status==='paid')return 'paid';
 if(type==='checkout.session.async_payment_failed')return 'failed';
 if(type==='checkout.session.expired')return 'expired';
 return null;
}
