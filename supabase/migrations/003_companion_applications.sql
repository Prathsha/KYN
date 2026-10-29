create table public.companion_applications (
 user_id uuid primary key references public.profiles(id),
 full_name text not null check(length(full_name) between 1 and 80),
 experience text not null check(length(experience) between 20 and 2000),
 availability text not null check(length(availability) between 3 and 500),
 service_area text not null check(service_area in ('East Village','NYU / Greenwich Village','Union Square','All pilot areas')),
 status text not null default 'submitted' check(status in ('submitted','under_review','changes_requested','approved','declined')),
 review_note text not null default '',
 reviewed_by uuid references public.profiles(id),
 submitted_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.companion_applications enable row level security;
revoke all on public.companion_applications from anon,authenticated;
grant select on public.companion_applications to authenticated;
create policy application_read on public.companion_applications for select to authenticated using(user_id=auth.uid() or public.kyn_role()='ops');
create function public.submit_companion_application(p_name text,p_experience text,p_availability text,p_area text,p_consent boolean) returns public.companion_applications
language plpgsql security definer set search_path=public as $$
declare a public.companion_applications; p public.profiles;
begin
 select * into p from profiles where id=auth.uid() for update;
 if p.id is null or not p.adult_confirmed or p_consent is distinct from true then raise exception 'Age confirmation and onboarding agreement required'; end if;
 if p.role<>'rider' then raise exception 'Only rider accounts can apply'; end if;
 select * into a from companion_applications where user_id=p.id for update;
 if a.user_id is not null and a.status<>'changes_requested' then raise exception 'Application already submitted'; end if;
 insert into companion_applications(user_id,full_name,experience,availability,service_area) values(p.id,trim(p_name),trim(p_experience),trim(p_availability),p_area)
 on conflict(user_id) do update set full_name=excluded.full_name,experience=excluded.experience,availability=excluded.availability,service_area=excluded.service_area,status='submitted',review_note='',reviewed_by=null,submitted_at=now(),updated_at=now() returning * into a;
 return a;
end $$;
create function public.review_companion_application(p_user uuid,p_status text,p_note text,p_screened boolean) returns public.companion_applications
language plpgsql security definer set search_path=public as $$
declare a public.companion_applications;
begin
 if public.kyn_role() is distinct from 'ops' or auth.uid()=p_user then raise exception 'Not authorized'; end if;
 if p_status not in ('under_review','changes_requested','approved','declined') or length(trim(p_note)) not between 3 and 1000 then raise exception 'Review status and note required'; end if;
 select * into a from companion_applications where user_id=p_user for update;
 if a.user_id is null or a.status not in ('submitted','under_review') then raise exception 'Application not awaiting review'; end if;
 if p_status='approved' then
 if a.status<>'under_review' or p_screened is distinct from true then raise exception 'Complete screening and onboarding review first'; end if;
 update profiles set role='companion',approved=true,available=false where id=p_user and role='rider' and adult_confirmed=true;
 if not found then raise exception 'Applicant is not eligible'; end if;
 end if;
 update companion_applications set status=p_status,review_note=trim(p_note),reviewed_by=auth.uid(),updated_at=now() where user_id=p_user returning * into a;
 return a;
end $$;
revoke all on function public.submit_companion_application(text,text,text,text,boolean),public.review_companion_application(uuid,text,text,boolean) from public,anon;
grant execute on function public.submit_companion_application(text,text,text,text,boolean),public.review_companion_application(uuid,text,text,boolean) to authenticated;
