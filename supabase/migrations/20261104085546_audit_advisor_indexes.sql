begin;
create index application_history_actor on public.application_history(actor_id);
create index operations_audit_actor on public.operations_audit(actor_id);
create index reports_reviewer on public.reports(reviewed_by);
alter policy payment_read on public.journey_payments using(exists(select 1 from public.bookings b where b.id=booking_id and b.rider_id=(select auth.uid())) or (select public.kyn_role())='ops');
alter policy pin_rider_read on public.meeting_pins using(exists(select 1 from public.bookings b where b.id=booking_id and b.rider_id=(select auth.uid())));
commit;
