begin;
alter table public.profiles add column presence_at timestamptz;
alter table public.profiles add column suspended boolean not null default false;
alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check check(status in ('requested','accepted','arrived','active','completion_requested','completed','cancelled','reported','expired','ended_early','no_show'));
alter table public.bookings add column expires_at timestamptz;
update public.bookings set expires_at=scheduled_at where expires_at is null;
alter table public.bookings alter column expires_at set not null;
drop index public.one_open_rider_booking;
drop index public.one_open_companion_booking;
create unique index one_open_rider_booking on public.bookings(rider_id) where status not in ('completed','cancelled','reported','expired','ended_early','no_show');
create unique index one_open_companion_booking on public.bookings(companion_id) where status not in ('completed','cancelled','reported','expired','ended_early','no_show') and companion_id is not null;
create index bookings_expiry on public.bookings(expires_at) where status='requested';
create index bookings_origin on public.bookings(origin);
create index bookings_destination on public.bookings(destination);
create index reports_booking on public.reports(booking_id);
create index reports_reporter on public.reports(reporter_id);
create index events_actor on public.booking_events(actor_id);
create index applications_reviewer on public.companion_applications(reviewed_by);

create function public.expire_requests() returns void language plpgsql security definer set search_path=public as $$begin
with expired as (update bookings set status='expired',updated_at=now() where status='requested' and expires_at<=now() returning id)
insert into booking_events(booking_id,kind) select id,'expired' from expired;
delete from trip_positions where updated_at<now()-interval '2 hours';
update profiles set available=false where available and (presence_at is null or presence_at<now()-interval '90 seconds');
end$$;
revoke all on function public.expire_requests() from public,anon;
grant execute on function public.expire_requests() to authenticated,service_role;

create or replace function public.kyn_approved() returns boolean language sql stable security definer set search_path=public as $$
select coalesce((select role='companion' and approved and available and adult_confirmed and not suspended and presence_at>now()-interval '90 seconds' from profiles where id=auth.uid()),false) $$;
create function public.companion_heartbeat() returns void language sql security definer set search_path=public as $$
update profiles set presence_at=now() where id=auth.uid() and role='companion' and approved and not suspended and available and presence_at>now()-interval '90 seconds' $$;
revoke all on function public.companion_heartbeat() from public,anon;
grant execute on function public.companion_heartbeat() to authenticated;
create or replace function public.set_availability(p_enabled boolean) returns public.profiles language plpgsql security definer set search_path=public as $$declare result public.profiles;begin
if not exists(select 1 from public.profiles where id=auth.uid() and role='companion' and approved and adult_confirmed and not suspended) then raise exception 'Companion approval required';end if;
update public.profiles set available=p_enabled,presence_at=now() where id=auth.uid() returning * into result;return result;end$$;

create or replace function public.create_booking(p_origin text,p_destination text,p_service text,p_scheduled_at timestamptz,p_notes text,p_request_id uuid) returns public.bookings language plpgsql security definer set search_path=public as $$declare result public.bookings;a public.places;b public.places;dist numeric;mins int;fare int;begin
if auth.uid() is null then raise exception 'Not authorized';end if;
perform public.expire_requests();
-- Serialize concurrent creations per rider, and make retries idempotent.
perform 1 from public.profiles where id=auth.uid() for update;
select * into result from public.bookings where rider_id=auth.uid() and request_id=p_request_id;if found then return result;end if;
if not exists(select 1 from public.profiles where id=auth.uid() and adult_confirmed) then raise exception 'Age confirmation required';end if;
if exists(select 1 from profiles where id=auth.uid() and suspended) then raise exception 'Account blocked: contact support';end if;
if (select paused from public.pilot_settings where id=1) then raise exception 'Pilot is paused';end if;
if exists(select 1 from public.bookings where rider_id=auth.uid() and status not in ('completed','cancelled','reported','expired','ended_early','no_show')) then raise exception 'Already have an open journey';end if;
select * into a from public.places where id=p_origin;select * into b from public.places where id=p_destination;
if a.id is null or b.id is null or a.id=b.id then raise exception 'Invalid route';end if;
if p_service not in ('walk','subway') then raise exception 'Invalid service';end if;
if p_scheduled_at<now() or p_scheduled_at>now()+interval '30 days' then raise exception 'Departure must be in the future and within 30 days';end if;
if public.service_capacity(p_origin)=0 then raise exception 'Companion unavailable: no online companion can fulfill this request. Try again later.';end if;
if length(p_notes)>500 or p_request_id is null then raise exception 'Invalid request';end if;
dist=round(sqrt(power(a.x-b.x,2)+power(a.y-b.y,2))::numeric/490,1);mins=greatest(7,round(dist*25)::int);
if p_service='subway' then mins=greatest(14,mins-3);fare=1400+mins*35+250;else fare=900+mins*40+250;end if;
insert into public.bookings(rider_id,origin,destination,service,scheduled_at,amount_cents,duration_minutes,notes,request_id,expires_at) values(auth.uid(),p_origin,p_destination,p_service,p_scheduled_at,fare,mins,p_notes,p_request_id,least(p_scheduled_at,now()+interval '15 minutes')) returning * into result;
insert into public.meeting_pins(booking_id,pin) values(result.id,lpad((('x'||encode(extensions.gen_random_bytes(2),'hex'))::bit(16)::int%10000)::text,4,'0'));
insert into public.booking_events(booking_id,actor_id,kind) values(result.id,auth.uid(),'requested');return result;end$$;

create or replace function public.booking_action(p_id uuid,p_action text,p_pin text default '',p_reason text default '',p_rating int default null) returns jsonb language plpgsql security definer set search_path=public as $$declare b public.bookings;p public.meeting_pins;is_rider boolean;is_companion boolean;begin
if auth.uid() is null then raise exception 'Not authorized';end if;
select * into b from public.bookings where id=p_id for update;if not found then raise exception 'Journey unavailable';end if;
is_rider=b.rider_id=auth.uid();is_companion=coalesce(b.companion_id=auth.uid(),false);
if p_action='accept' then
 if not public.can_receive_request(b.rider_id,b.origin) then raise exception 'Journey unavailable';end if;
 if is_rider or b.status<>'requested' or b.expires_at<=now() then raise exception 'Journey unavailable';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if not public.kyn_approved() then raise exception 'Companion approval required';end if;
 if exists(select 1 from profiles where id=auth.uid() and suspended) then raise exception 'Account blocked: contact support';end if;
if (select paused from public.pilot_settings where id=1) then raise exception 'Pilot is paused';end if;
 if exists(select 1 from public.bookings where companion_id=auth.uid() and status not in ('completed','cancelled','reported','expired','ended_early','no_show')) then raise exception 'Already assigned to a journey';end if;
 update public.bookings set companion_id=auth.uid(),status='accepted',updated_at=now() where id=p_id returning * into b;
else
 if not is_rider and not is_companion then raise exception 'Not a participant';end if;
 if p_action='arrive' and is_companion and b.status='accepted' then
  update public.bookings set status='arrived',updated_at=now() where id=p_id returning * into b;
 elsif p_action='start' and is_companion and b.status='arrived' then
  select * into p from public.meeting_pins where booking_id=p_id for update;
  if p.failed_attempts>=5 and p.last_failed_at>now()-interval '10 minutes' then return jsonb_build_object('error','Too many PIN attempts. Try again in 10 minutes.');end if;
  if p.pin is distinct from p_pin then update public.meeting_pins set failed_attempts=case when last_failed_at<now()-interval '10 minutes' then 1 else failed_attempts+1 end,last_failed_at=now() where booking_id=p_id;return jsonb_build_object('error','PIN does not match');end if;
  update public.bookings set status='active',updated_at=now() where id=p_id returning * into b;
 elsif p_action='complete' and b.status in ('active','completion_requested') then
  if (is_rider and b.rider_done) or (is_companion and b.companion_done) then return to_jsonb(b);end if;
  update public.bookings set rider_done=rider_done or is_rider,companion_done=companion_done or is_companion,updated_at=now() where id=p_id returning * into b;
  update public.bookings set status=case when b.rider_done and b.companion_done then 'completed' else 'completion_requested' end where id=p_id returning * into b;
 elsif p_action='end_early' and b.status in ('active','completion_requested') then
  if length(trim(p_reason))<3 then raise exception 'Consent required: enter a reason';end if;
  update bookings set status='ended_early',updated_at=now() where id=p_id returning * into b;
 elsif p_action='no_show' and b.status='arrived' and b.updated_at<now()-interval '10 minutes' then
  update bookings set status='no_show',updated_at=now() where id=p_id returning * into b;
 elsif p_action='cancel' and b.status in ('requested','accepted','arrived') then
  update public.bookings set status='cancelled',updated_at=now() where id=p_id returning * into b;
 elsif p_action='report' and b.status not in ('completed','cancelled','reported','expired','ended_early','no_show') then
  update public.bookings set status='reported',updated_at=now() where id=p_id returning * into b;
  insert into public.reports(booking_id,reporter_id,detail) values(p_id,auth.uid(),left(p_reason,2000));
 elsif p_action='rate' and is_rider and b.status='completed' and b.rating is null and p_rating between 1 and 5 then
  update public.bookings set rating=p_rating,updated_at=now() where id=p_id returning * into b;
 else raise exception 'Action not allowed';end if;
end if;
-- Keep report details out of participant-visible event history.
insert into public.booking_events(booking_id,actor_id,kind,detail) values(p_id,auth.uid(),p_action,case when p_action in ('cancel','end_early','no_show') then left(p_reason,500) else '' end);
return to_jsonb(b);end$$;


alter table reports add column severity text not null default 'standard' check(severity in ('standard','urgent'));
alter table reports add column status text not null default 'open' check(status in ('open','acknowledged','escalated','resolved'));
alter table reports add column reviewed_by uuid references profiles(id);
alter table reports add column reviewed_at timestamptz;
create table public.operations_audit(id bigint generated always as identity primary key,actor_id uuid not null references profiles(id),target_id uuid not null,action text not null,note text not null,created_at timestamptz not null default now());
alter table operations_audit enable row level security;
revoke all on operations_audit from anon,authenticated;
grant select on operations_audit to authenticated;
create policy ops_audit_read on operations_audit for select to authenticated using((select kyn_role())='ops');
create function public.ops_resolve(p_id uuid,p_action text,p_note text) returns void language plpgsql security definer set search_path=public as $$begin
if kyn_role() is distinct from 'ops' then raise exception 'Not authorized';end if;
if length(trim(p_note)) not between 10 and 1000 then raise exception 'Consent required: detailed resolution note';end if;
if p_action in ('acknowledged','escalated','resolved') then
 update reports set status=p_action,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
elsif p_action='complete_stalled' then
 update bookings set status='completed',updated_at=now() where id=p_id and status='completion_requested' and updated_at<now()-interval '30 minutes';
elsif p_action='cancel_stalled' then
 update bookings set status='cancelled',updated_at=now() where id=p_id and status in ('requested','accepted','arrived','completion_requested');
elsif p_action='suspend' then
 update profiles set suspended=true,available=false,approved=false where id=p_id and role<>'ops';
else raise exception 'Action not allowed';end if;
if not found then raise exception 'Action not allowed';end if;
insert into operations_audit(actor_id,target_id,action,note) values(auth.uid(),p_id,p_action,trim(p_note));
end$$;
revoke all on function public.ops_resolve(uuid,text,text) from public,anon;
grant execute on function public.ops_resolve(uuid,text,text) to authenticated;

create table public.account_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id),kind text not null check(kind in ('deletion','support')),detail text not null check(length(detail) between 3 and 2000),status text not null default 'open' check(status in ('open','acknowledged','resolved')),created_at timestamptz not null default now());
alter table account_requests enable row level security;
revoke all on account_requests from anon,authenticated;
grant select,insert on account_requests to authenticated;
create policy account_request_read on account_requests for select to authenticated using(user_id=(select auth.uid()) or (select kyn_role())='ops');
create policy account_request_insert on account_requests for insert to authenticated with check(user_id=(select auth.uid()) and status='open');
create index account_requests_user on account_requests(user_id);

-- Avoid evaluating identity/role functions once per row where arguments are invariant.
alter policy profile_read on profiles using(id=(select auth.uid()) or kyn_peer(id) or (select kyn_role())='ops');
alter policy bookings_read on bookings using(rider_id=(select auth.uid()) or companion_id=(select auth.uid()) or (select kyn_role())='ops' or (status='requested' and expires_at>now() and (select kyn_approved())));
alter policy report_read on reports using(reporter_id=(select auth.uid()) or (select kyn_role())='ops');
alter policy event_read on booking_events using(kyn_member(booking_id) or (select kyn_role())='ops');
alter policy application_read on companion_applications using(user_id=(select auth.uid()) or (select kyn_role())='ops');

create table public.user_blocks(user_id uuid not null references profiles(id),blocked_id uuid not null references profiles(id),created_at timestamptz not null default now(),primary key(user_id,blocked_id),check(user_id<>blocked_id));
alter table user_blocks enable row level security;
revoke all on user_blocks from anon,authenticated;
grant select,insert,delete on user_blocks to authenticated;
create policy blocks_read on user_blocks for select to authenticated using(user_id=(select auth.uid()));
create policy blocks_add on user_blocks for insert to authenticated with check(user_id=(select auth.uid()) and kyn_peer(blocked_id));
create policy blocks_remove on user_blocks for delete to authenticated using(user_id=(select auth.uid()));
create index blocks_target on user_blocks(blocked_id);
create function public.pair_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from user_blocks where (user_id=a and blocked_id=b) or (user_id=b and blocked_id=a))$$;
revoke all on function public.pair_blocked(uuid,uuid) from public,anon,authenticated;
-- Eligibility is checked at acceptance, even if an offer was loaded before the block.
create function public.guard_booking_pair() returns trigger language plpgsql security definer set search_path=public as $$begin
if new.companion_id is not null and (old.companion_id is distinct from new.companion_id) and pair_blocked(new.rider_id,new.companion_id) then raise exception 'Journey unavailable';end if;
return new;end$$;
revoke all on function public.guard_booking_pair() from public,anon,authenticated;
create trigger booking_pair_guard before update on bookings for each row execute function guard_booking_pair();

create table public.journey_feedback(booking_id uuid not null references bookings(id),author_id uuid not null references profiles(id),rating integer not null check(rating between 1 and 5),note text not null default '' check(length(note)<=1000),created_at timestamptz not null default now(),primary key(booking_id,author_id));
alter table journey_feedback enable row level security;
revoke all on journey_feedback from anon,authenticated;
grant select,insert on journey_feedback to authenticated;
create policy feedback_read on journey_feedback for select to authenticated using(author_id=(select auth.uid()) or (select kyn_role())='ops');
create policy feedback_add on journey_feedback for insert to authenticated with check(author_id=(select auth.uid()) and kyn_member(booking_id) and exists(select 1 from bookings where id=booking_id and status in ('completed','ended_early')));
create index feedback_author on journey_feedback(author_id);

create table public.screening_reviews(user_id uuid primary key references profiles(id),reviewer_id uuid not null references profiles(id),evidence_reference text not null check(length(evidence_reference) between 10 and 500),identity_checked boolean not null,screening_checked boolean not null,onboarding_checked boolean not null,reviewed_at timestamptz not null default now(),recheck_at timestamptz not null check(recheck_at>reviewed_at));
alter table screening_reviews enable row level security;
revoke all on screening_reviews from anon,authenticated;
grant select,insert,update on screening_reviews to authenticated;
create policy screening_read on screening_reviews for select to authenticated using((select kyn_role())='ops');
create policy screening_insert on screening_reviews for insert to authenticated with check((select kyn_role())='ops' and reviewer_id=(select auth.uid()) and user_id<>(select auth.uid()));
create policy screening_update on screening_reviews for update to authenticated using((select kyn_role())='ops') with check((select kyn_role())='ops' and reviewer_id=(select auth.uid()) and user_id<>(select auth.uid()));
create index screening_reviewer on screening_reviews(reviewer_id);
create function public.guard_companion_approval() returns trigger language plpgsql security definer set search_path=public as $$begin
if new.approved and not old.approved then
 if not exists(select 1 from screening_reviews where user_id=new.id and identity_checked and screening_checked and onboarding_checked and recheck_at>now()) then raise exception 'Companion approval required: record current screening evidence';end if;
end if;return new;end$$;
revoke all on function public.guard_companion_approval() from public,anon,authenticated;
create trigger companion_approval_guard before update on profiles for each row execute function guard_companion_approval();

create table public.application_history(id bigint generated always as identity primary key,user_id uuid not null references profiles(id),status text not null,review_note text not null,actor_id uuid references profiles(id),created_at timestamptz not null default now());
alter table application_history enable row level security;
revoke all on application_history from anon,authenticated;
grant select on application_history to authenticated;
create policy application_history_read on application_history for select to authenticated using(user_id=(select auth.uid()) or (select kyn_role())='ops');
create index history_user on application_history(user_id);
create function public.record_application_history() returns trigger language plpgsql security definer set search_path=public as $$begin
insert into application_history(user_id,status,review_note,actor_id) values(new.user_id,new.status,new.review_note,auth.uid());return new;end$$;
revoke all on function public.record_application_history() from public,anon,authenticated;
create trigger application_audit after insert or update on companion_applications for each row execute function record_application_history();

create function public.reschedule_booking(p_id uuid,p_departure timestamptz) returns public.bookings language plpgsql security definer set search_path=public as $$declare b public.bookings;begin
select * into b from bookings where id=p_id for update;
if b.rider_id is distinct from auth.uid() or auth.uid() is null then raise exception 'Not authorized';end if;
if b.status<>'requested' or b.expires_at<=now() then raise exception 'Action not allowed: only an unmatched request can be rescheduled';end if;
if p_departure<now()+interval '1 minute' or p_departure>now()+interval '30 days' then raise exception 'Departure must be in the future and within 30 days';end if;
update bookings set scheduled_at=p_departure,expires_at=least(p_departure,now()+interval '15 minutes'),updated_at=now() where id=p_id returning * into b;
insert into booking_events(booking_id,actor_id,kind,detail) values(p_id,auth.uid(),'rescheduled',p_departure::text);return b;end$$;
revoke all on function public.reschedule_booking(uuid,timestamptz) from public,anon;
grant execute on function public.reschedule_booking(uuid,timestamptz) to authenticated;
create function public.service_capacity(p_origin text default null) returns integer language sql stable security definer set search_path=public as $$
select count(*)::integer from profiles p where p.role='companion' and p.approved and p.adult_confirmed and not p.suspended and p.available and p.presence_at>now()-interval '90 seconds' and (p_origin is null or exists(select 1 from companion_applications ca where ca.user_id=p.id and (ca.service_area='All pilot areas' or ca.service_area=case when p_origin in ('union','strand','stuyvesant') then 'Union Square' when p_origin in ('washington','bobst') then 'NYU / Greenwich Village' else 'East Village' end))) and p.id<>auth.uid() and exists(select 1 from screening_reviews sr where sr.user_id=p.id and sr.identity_checked and sr.screening_checked and sr.onboarding_checked and sr.recheck_at>now()) and not public.pair_blocked(p.id,auth.uid()) and not exists(select 1 from bookings b where b.companion_id=p.id and b.status not in ('completed','cancelled','reported','expired','ended_early','no_show')) $$;
revoke all on function public.service_capacity(text) from public,anon;
grant execute on function public.service_capacity(text) to authenticated;


create table public.trip_shares(id uuid primary key default gen_random_uuid(),booking_id uuid not null references bookings(id),owner_id uuid not null references profiles(id),token_hash text not null unique,expires_at timestamptz not null,revoked boolean not null default false,created_at timestamptz not null default now());
create table public.trip_positions(share_id uuid primary key references trip_shares(id) on delete cascade,latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),accuracy double precision not null check(accuracy>=0),updated_at timestamptz not null default now());
alter table trip_shares enable row level security;alter table trip_positions enable row level security;
revoke all on trip_shares,trip_positions from anon,authenticated;
create index shares_booking on trip_shares(booking_id);create index shares_owner on trip_shares(owner_id);
create function public.create_trip_share(p_booking uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare token text;share uuid;begin
if auth.uid() is null or not kyn_member(p_booking) then raise exception 'Not a participant';end if;
if not exists(select 1 from bookings where id=p_booking and status in ('accepted','arrived','active','completion_requested')) then raise exception 'Action not allowed';end if;
update trip_shares set revoked=true where booking_id=p_booking and owner_id=auth.uid();
token=encode(extensions.gen_random_bytes(32),'hex');
insert into trip_shares(booking_id,owner_id,token_hash,expires_at) values(p_booking,auth.uid(),encode(extensions.digest(token,'sha256'),'hex'),now()+interval '2 hours') returning id into share;
return jsonb_build_object('id',share,'token',token,'expires_at',now()+interval '2 hours');end$$;
create function public.update_trip_position(p_share uuid,p_lat double precision,p_lng double precision,p_accuracy double precision) returns void language plpgsql security definer set search_path=public as $$begin
if not exists(select 1 from trip_shares s join bookings b on b.id=s.booking_id where s.id=p_share and s.owner_id=auth.uid() and not s.revoked and s.expires_at>now() and b.status in ('accepted','arrived','active','completion_requested')) then raise exception 'Action not allowed';end if;
insert into trip_positions(share_id,latitude,longitude,accuracy) values(p_share,p_lat,p_lng,p_accuracy) on conflict(share_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,updated_at=now();end$$;
create function public.revoke_trip_share(p_share uuid) returns void language plpgsql security definer set search_path=public as $$begin
update trip_shares set revoked=true where id=p_share and owner_id=auth.uid();
if not found then raise exception 'Not authorized';end if;
delete from trip_positions where share_id=p_share;end$$;
create function public.read_trip_share(p_token text) returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object('status',b.status,'expires_at',s.expires_at,'position',case when p.updated_at>now()-interval '90 seconds' then jsonb_build_object('latitude',p.latitude,'longitude',p.longitude,'accuracy',p.accuracy,'updated_at',p.updated_at) else null end)
from trip_shares s join bookings b on b.id=s.booking_id left join trip_positions p on p.share_id=s.id
where s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not s.revoked and s.expires_at>now() and b.status in ('accepted','arrived','active','completion_requested') $$;
revoke all on function public.create_trip_share(uuid),public.update_trip_position(uuid,double precision,double precision,double precision),public.revoke_trip_share(uuid),public.read_trip_share(text) from public,anon,authenticated;
grant execute on function public.create_trip_share(uuid),public.update_trip_position(uuid,double precision,double precision,double precision),public.revoke_trip_share(uuid) to authenticated;
grant execute on function public.read_trip_share(text) to anon,authenticated;
create or replace function public.kyn_approved() returns boolean language sql stable security definer set search_path=public as $$
select coalesce((select p.role='companion' and p.approved and p.available and p.adult_confirmed and not p.suspended and p.presence_at>now()-interval '90 seconds' and exists(select 1 from screening_reviews sr where sr.user_id=p.id and sr.identity_checked and sr.screening_checked and sr.onboarding_checked and sr.recheck_at>now()) from profiles p where p.id=auth.uid()),false) $$;
create function public.can_receive_request(p_rider uuid,p_origin text) returns boolean language sql stable security definer set search_path=public as $$
select kyn_approved() and not pair_blocked(auth.uid(),p_rider) and exists(select 1 from companion_applications where user_id=auth.uid() and (service_area='All pilot areas' or service_area=case when p_origin in ('union','strand','stuyvesant') then 'Union Square' when p_origin in ('washington','bobst') then 'NYU / Greenwich Village' else 'East Village' end)) $$;
revoke all on function public.can_receive_request(uuid,text) from public,anon;
grant execute on function public.can_receive_request(uuid,text) to authenticated;
alter policy bookings_read on bookings using(rider_id=(select auth.uid()) or companion_id=(select auth.uid()) or (select kyn_role())='ops' or (status='requested' and expires_at>now() and can_receive_request(rider_id,origin)));
create function public.journey_peer_card(p_booking uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$declare peer uuid;begin
if auth.uid() is null or not kyn_member(p_booking) then return null;end if;
select case when rider_id=auth.uid() then companion_id else rider_id end into peer from bookings where id=p_booking;
return (select jsonb_build_object('full_name',p.full_name,'role',p.role,'approved',p.approved and not p.suspended,'notes',p.notes,'completed_journeys',(select count(*) from bookings b where b.status='completed' and (b.rider_id=p.id or b.companion_id=p.id))) from profiles p where p.id=peer);end$$;
revoke all on function public.journey_peer_card(uuid) from public,anon;
grant execute on function public.journey_peer_card(uuid) to authenticated;
create function public.record_screening_audit() returns trigger language plpgsql security definer set search_path=public as $$begin
insert into operations_audit(actor_id,target_id,action,note) values(new.reviewer_id,new.user_id,'screening_review',new.evidence_reference || ' | identity=' || new.identity_checked || ' screening=' || new.screening_checked || ' onboarding=' || new.onboarding_checked || ' recheck=' || new.recheck_at::text);return new;end$$;
revoke all on function public.record_screening_audit() from public,anon,authenticated;
create trigger screening_audit after insert or update on screening_reviews for each row execute function record_screening_audit();
commit;
