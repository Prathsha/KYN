begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('companion-ids','companion-ids',false,10485760,array['image/jpeg','image/png','application/pdf']);
create policy companion_id_upload on storage.objects for insert to authenticated with check(bucket_id='companion-ids' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy companion_id_read on storage.objects for select to authenticated using(bucket_id='companion-ids' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select public.kyn_role())='ops'));
create policy companion_id_delete on storage.objects for delete to authenticated using(bucket_id='companion-ids' and (storage.foldername(name))[1]=(select auth.uid())::text);
create table public.companion_id_documents(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),storage_path text not null unique,mime_type text not null check(mime_type in ('image/jpeg','image/png','application/pdf')),uploaded_at timestamptz not null default now());
alter table companion_id_documents enable row level security;
revoke all on companion_id_documents from anon,authenticated;
grant select,insert,delete on companion_id_documents to authenticated;
create policy id_document_read on companion_id_documents for select to authenticated using(user_id=(select auth.uid()) or (select kyn_role())='ops');
create policy id_document_insert on companion_id_documents for insert to authenticated with check(user_id=(select auth.uid()) and split_part(storage_path,'/',1)=(select auth.uid())::text and exists(select 1 from storage.objects where bucket_id='companion-ids' and name=storage_path));
create policy id_document_delete on companion_id_documents for delete to authenticated using(user_id=(select auth.uid()));
create index id_documents_user on companion_id_documents(user_id);
create function public.require_companion_id() returns trigger language plpgsql security definer set search_path=public as $$begin
if new.status='submitted' and not exists(select 1 from companion_id_documents d join storage.objects o on o.name=d.storage_path and o.bucket_id='companion-ids' where d.user_id=new.user_id) then raise exception 'Identity document required before submitting';end if;return new;end$$;
revoke all on function public.require_companion_id() from public,anon,authenticated;
create trigger companion_id_required before insert or update on companion_applications for each row execute function require_companion_id();
create function public.controlled_journey_preferences() returns trigger language plpgsql set search_path=public as $$begin
if new.notes<>'' and exists(select 1 from unnest(string_to_array(new.notes,E'\n')) note where note not in ('Quiet walk preferred','Conversation welcome','Relaxed walking pace','Help with subway directions','Step-free route preferred')) then raise exception 'Invalid request preferences';end if;return new;end$$;
revoke all on function public.controlled_journey_preferences() from public,anon,authenticated;
create trigger booking_preferences_guard before insert on bookings for each row execute function controlled_journey_preferences();
commit;
