-- KYN pilot foundation. Run once in a NEW Supabase project's SQL editor.
-- Database is authoritative: clients cannot write roles, fares or trip states directly.
begin;
create extension if not exists pgcrypto with schema extensions;
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null default 'KYN member' check(length(full_name) between 1 and 80),role text not null default 'rider' check(role in ('rider','companion','ops')),approved boolean not null default false,available boolean not null default false,adult_confirmed boolean not null default false,notes text not null default '' check(length(notes)<=500),created_at timestamptz not null default now());
create table public.places(id text primary key,name text not null,x integer not null,y integer not null);
insert into public.places values ('union','Union Square',510,250),('washington','Washington Square Park',300,530),('astor','Astor Place',580,420),('tompkins','Tompkins Square Park',810,495),('bobst','NYU Bobst Library',350,600),('cooper','Cooper Union',610,465),('strand','Strand Book Store',485,315),('stuyvesant','Stuyvesant Square',735,225);
create table public.pilot_settings(id integer primary key check(id=1),paused boolean not null default true,updated_at timestamptz not null default now());
insert into public.pilot_settings(id,paused) values(1,true);
create table public.bookings(id uuid primary key default gen_random_uuid(),rider_id uuid not null references public.profiles(id),companion_id uuid references public.profiles(id),origin text not null references public.places(id),destination text not null references public.places(id),service text not null check(service in ('walk','subway')),scheduled_at timestamptz not null,status text not null default 'requested' check(status in ('requested','accepted','arrived','active','completion_requested','completed','cancelled','reported')),amount_cents integer not null check(amount_cents>=0),duration_minutes integer not null check(duration_minutes>0),notes text not null default '' check(length(notes)<=500),rating integer check(rating between 1 and 5),rider_done boolean not null default false,companion_done boolean not null default false,request_id uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(rider_id,request_id),check(origin<>destination),check(companion_id is null or companion_id<>rider_id));
create unique index one_open_rider_booking on public.bookings(rider_id) where status not in ('completed','cancelled','reported');
create unique index one_open_companion_booking on public.bookings(companion_id) where status not in ('completed','cancelled','reported') and companion_id is not null;
create table public.meeting_pins(booking_id uuid primary key references public.bookings(id) on delete cascade,pin text not null,failed_attempts integer not null default 0,last_failed_at timestamptz);
create table public.messages(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),sender_id uuid not null references public.profiles(id),body text not null check(length(body) between 1 and 2000),request_id uuid not null,created_at timestamptz not null default now(),unique(sender_id,request_id));
create table public.booking_events(id bigint generated always as identity primary key,booking_id uuid references public.bookings(id),actor_id uuid references public.profiles(id),kind text not null,detail text not null default '',created_at timestamptz not null default now());
create table public.reports(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),reporter_id uuid not null references public.profiles(id),detail text not null default '' check(length(detail)<=2000),created_at timestamptz not null default now());
create index bookings_recent on public.bookings(created_at desc);
create index messages_by_booking on public.messages(booking_id,created_at);
create index events_by_booking on public.booking_events(booking_id,created_at);
create function public.kyn_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create function public.kyn_member(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.bookings where id=p_id and (rider_id=auth.uid() or companion_id=auth.uid())) $$;
create function public.kyn_peer(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.bookings where (rider_id=auth.uid() and companion_id=p_id) or (companion_id=auth.uid() and rider_id=p_id)) $$;
create function public.kyn_approved() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select role='companion' and approved and available and adult_confirmed from public.profiles where id=auth.uid()),false) $$;
create function public.kyn_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.profiles(id,full_name) values(new.id,coalesce(nullif(left(new.raw_user_meta_data->>'full_name',80),''),'KYN member'));return new;end$$;
create trigger kyn_user_created after insert on auth.users for each row execute function public.kyn_new_user();
-- Backfill accounts created before this migration without trusting metadata roles.
insert into public.profiles(id,full_name) select id,coalesce(nullif(left(raw_user_meta_data->>'full_name',80),''),'KYN member') from auth.users on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.pilot_settings enable row level security;
alter table public.bookings enable row level security;
alter table public.meeting_pins enable row level security;
alter table public.messages enable row level security;
alter table public.booking_events enable row level security;
alter table public.reports enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.kyn_peer(id) or public.kyn_role()='ops');
create policy places_read on public.places for select to authenticated using(true);
create policy settings_read on public.pilot_settings for select to authenticated using(true);
create policy bookings_read on public.bookings for select to authenticated using(rider_id=auth.uid() or companion_id=auth.uid() or public.kyn_role()='ops' or (status='requested' and public.kyn_approved()));
create policy pin_rider_read on public.meeting_pins for select to authenticated using(exists(select 1 from public.bookings b where b.id=booking_id and b.rider_id=auth.uid()));
create policy message_read on public.messages for select to authenticated using(public.kyn_member(booking_id));
create policy event_read on public.booking_events for select to authenticated using(public.kyn_member(booking_id) or public.kyn_role()='ops');
create policy report_read on public.reports for select to authenticated using(reporter_id=auth.uid() or public.kyn_role()='ops');
revoke all on public.profiles,public.places,public.pilot_settings,public.bookings,public.meeting_pins,public.messages,public.booking_events,public.reports from anon,authenticated;
grant select on public.profiles,public.places,public.pilot_settings,public.bookings,public.meeting_pins,public.messages,public.booking_events,public.reports to authenticated;

create function public.save_profile(p_name text,p_notes text,p_adult boolean) returns public.profiles language plpgsql security definer set search_path=public as $$declare result public.profiles;begin
if auth.uid() is null then raise exception 'Not authorized';end if;
if length(trim(p_name)) not between 1 and 80 or length(p_notes)>500 then raise exception 'Invalid profile';end if;
update public.profiles set full_name=trim(p_name),notes=p_notes,adult_confirmed=adult_confirmed or p_adult where id=auth.uid() returning * into result;return result;end$$;
create function public.set_availability(p_enabled boolean) returns public.profiles language plpgsql security definer set search_path=public as $$declare result public.profiles;begin
if not exists(select 1 from public.profiles where id=auth.uid() and role='companion' and approved and adult_confirmed) then raise exception 'Companion approval required';end if;
update public.profiles set available=p_enabled where id=auth.uid() returning * into result;return result;end$$;
create function public.set_pilot_pause(p_paused boolean,p_reason text) returns jsonb language plpgsql security definer set search_path=public as $$begin
if public.kyn_role() is distinct from 'ops' then raise exception 'Not authorized';end if;
if length(trim(p_reason))<3 then raise exception 'Consent required: record a reason';end if;
update public.pilot_settings set paused=p_paused,updated_at=now() where id=1;
insert into public.booking_events(actor_id,kind,detail) values(auth.uid(),'pilot_pause',left(p_reason,500));return jsonb_build_object('paused',p_paused);end$$;
create function public.create_booking(p_origin text,p_destination text,p_service text,p_scheduled_at timestamptz,p_notes text,p_request_id uuid) returns public.bookings language plpgsql security definer set search_path=public as $$declare result public.bookings;a public.places;b public.places;dist numeric;mins int;fare int;begin
if auth.uid() is null then raise exception 'Not authorized';end if;
-- Serialize concurrent creations per rider, and make retries idempotent.
perform 1 from public.profiles where id=auth.uid() for update;
select * into result from public.bookings where rider_id=auth.uid() and request_id=p_request_id;if found then return result;end if;
if not exists(select 1 from public.profiles where id=auth.uid() and adult_confirmed) then raise exception 'Age confirmation required';end if;
if (select paused from public.pilot_settings where id=1) then raise exception 'Pilot is paused';end if;
if exists(select 1 from public.bookings where rider_id=auth.uid() and status not in ('completed','cancelled','reported')) then raise exception 'Already have an open journey';end if;
select * into a from public.places where id=p_origin;select * into b from public.places where id=p_destination;
if a.id is null or b.id is null or a.id=b.id then raise exception 'Invalid route';end if;
if p_service not in ('walk','subway') then raise exception 'Invalid service';end if;
if p_scheduled_at<now() or p_scheduled_at>now()+interval '30 days' then raise exception 'Departure must be in the future and within 30 days';end if;
if length(p_notes)>500 or p_request_id is null then raise exception 'Invalid request';end if;
dist=round(sqrt(power(a.x-b.x,2)+power(a.y-b.y,2))::numeric/490,1);mins=greatest(7,round(dist*25)::int);
if p_service='subway' then mins=greatest(14,mins-3);fare=1400+mins*35+250;else fare=900+mins*40+250;end if;
insert into public.bookings(rider_id,origin,destination,service,scheduled_at,amount_cents,duration_minutes,notes,request_id) values(auth.uid(),p_origin,p_destination,p_service,p_scheduled_at,fare,mins,p_notes,p_request_id) returning * into result;
insert into public.meeting_pins(booking_id,pin) values(result.id,lpad((('x'||encode(extensions.gen_random_bytes(2),'hex'))::bit(16)::int%10000)::text,4,'0'));
insert into public.booking_events(booking_id,actor_id,kind) values(result.id,auth.uid(),'requested');return result;end$$;
create function public.booking_action(p_id uuid,p_action text,p_pin text default '',p_reason text default '',p_rating int default null) returns jsonb language plpgsql security definer set search_path=public as $$declare b public.bookings;p public.meeting_pins;is_rider boolean;is_companion boolean;begin
if auth.uid() is null then raise exception 'Not authorized';end if;
select * into b from public.bookings where id=p_id for update;if not found then raise exception 'Journey unavailable';end if;
is_rider=b.rider_id=auth.uid();is_companion=coalesce(b.companion_id=auth.uid(),false);
if p_action='accept' then
 if is_rider or b.status<>'requested' then raise exception 'Journey unavailable';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if not public.kyn_approved() then raise exception 'Companion approval required';end if;
 if (select paused from public.pilot_settings where id=1) then raise exception 'Pilot is paused';end if;
 if exists(select 1 from public.bookings where companion_id=auth.uid() and status not in ('completed','cancelled','reported')) then raise exception 'Already assigned to a journey';end if;
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
  update public.bookings set rider_done=rider_done or is_rider,companion_done=companion_done or is_companion,updated_at=now() where id=p_id returning * into b;
  update public.bookings set status=case when b.rider_done and b.companion_done then 'completed' else 'completion_requested' end where id=p_id returning * into b;
 elsif p_action='cancel' and b.status in ('requested','accepted','arrived') then
  update public.bookings set status='cancelled',updated_at=now() where id=p_id returning * into b;
 elsif p_action='report' and b.status not in ('completed','cancelled','reported') then
  update public.bookings set status='reported',updated_at=now() where id=p_id returning * into b;
  insert into public.reports(booking_id,reporter_id,detail) values(p_id,auth.uid(),left(p_reason,2000));
 elsif p_action='rate' and is_rider and b.status='completed' and b.rating is null and p_rating between 1 and 5 then
  update public.bookings set rating=p_rating,updated_at=now() where id=p_id returning * into b;
 else raise exception 'Action not allowed';end if;
end if;
-- Keep report details out of participant-visible event history.
insert into public.booking_events(booking_id,actor_id,kind,detail) values(p_id,auth.uid(),p_action,case when p_action='cancel' then left(p_reason,500) else '' end);
return to_jsonb(b);end$$;
create function public.send_message(p_booking uuid,p_body text,p_request_id uuid) returns public.messages language plpgsql security definer set search_path=public as $$declare result public.messages;begin
if auth.uid() is null then raise exception 'Not authorized';end if;
if not public.kyn_member(p_booking) then raise exception 'Not a participant';end if;
select * into result from public.messages where sender_id=auth.uid() and request_id=p_request_id;if found then return result;end if;
if not exists(select 1 from public.bookings where id=p_booking and status in ('accepted','arrived','active','completion_requested')) then raise exception 'Action not allowed';end if;
if length(trim(p_body)) not between 1 and 2000 then raise exception 'Message is empty or too long';end if;
insert into public.messages(booking_id,sender_id,body,request_id) values(p_booking,auth.uid(),trim(p_body),p_request_id) returning * into result;return result;end$$;
-- Restrict RPC execution to signed-in users; security-definer functions check actor and state.
revoke all on function public.kyn_new_user() from public,anon,authenticated;
revoke all on function public.kyn_role(),public.kyn_member(uuid),public.kyn_peer(uuid),public.kyn_approved(),public.save_profile(text,text,boolean),public.set_availability(boolean),public.set_pilot_pause(boolean,text),public.create_booking(text,text,text,timestamptz,text,uuid),public.booking_action(uuid,text,text,text,integer),public.send_message(uuid,text,uuid) from public,anon;
grant execute on function public.kyn_role(),public.kyn_member(uuid),public.kyn_peer(uuid),public.kyn_approved(),public.save_profile(text,text,boolean),public.set_availability(boolean),public.set_pilot_pause(boolean,text),public.create_booking(text,text,text,timestamptz,text,uuid),public.booking_action(uuid,text,text,text,integer),public.send_message(uuid,text,uuid) to authenticated;
commit;
