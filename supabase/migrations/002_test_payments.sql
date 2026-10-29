-- Stripe test payments are separate from journey state and never enable paid dispatch.
create table public.journey_payments (
 booking_id uuid primary key references public.bookings(id),
 attempt_id uuid not null default gen_random_uuid(),
 session_id text unique,
 amount_cents integer not null check(amount_cents>0),
 currency text not null default 'usd' check(currency='usd'),
 status text not null default 'pending' check(status in ('pending','paid','failed','expired')),
 updated_at timestamptz not null default now()
);
alter table public.journey_payments enable row level security;
revoke all on public.journey_payments from anon,authenticated;
grant select on public.journey_payments to authenticated;
grant all on public.journey_payments to service_role;
grant select,update on public.bookings to service_role;
create policy payment_read on public.journey_payments for select to authenticated using (
 exists(select 1 from public.bookings b where b.id=booking_id and b.rider_id=auth.uid()) or public.kyn_role()='ops'
);
create function public.reserve_test_payment(p_booking uuid,p_rider uuid) returns public.journey_payments
language plpgsql security invoker set search_path=public as $$
declare b public.bookings; p public.journey_payments;
begin
 select * into b from public.bookings where id=p_booking for update;
 if b.id is null or b.rider_id<>p_rider or b.status<>'completed' then raise exception 'Completed rider journey required'; end if;
 insert into public.journey_payments(booking_id,amount_cents) values(b.id,b.amount_cents) on conflict do nothing;
 select * into p from public.journey_payments where booking_id=b.id for update;
 if p.status in ('failed','expired') then
 update public.journey_payments set attempt_id=gen_random_uuid(),session_id=null,status='pending',updated_at=now() where booking_id=b.id returning * into p;
 end if;
 return p;
end $$;
revoke all on function public.reserve_test_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_test_payment(uuid,uuid) to service_role;
