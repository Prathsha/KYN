import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';import {estimate,places} from '../shared/domain.ts';
test('Postgres migration: roles, RLS isolation, PIN, idempotency and complete journey',async()=>{
const db=new PGlite({extensions:{pgcrypto}});try{
await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`);
await db.exec(await readFile(new URL('../supabase/migrations/001_kyn.sql',import.meta.url),'utf8'));
const rider='00000000-0000-4000-8000-000000000001',companion='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000003';
for(const id of [rider,companion,stranger])await db.query(`insert into auth.users values($1,'{"full_name":"Test member","role":"ops","approved":true}')`,[id]);
assert.equal((await db.query<{role:string}>(`select role from profiles where id=$1`,[rider])).rows[0].role,'rider');
await db.query(`update profiles set role='companion',approved=true,adult_confirmed=true,available=true where id=$1`,[companion]);
async function as(id:string){await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);await db.exec('set role authenticated')}
await as(rider);await assert.rejects(()=>db.query(`update profiles set role='ops' where id=$1`,[rider]),/permission denied/);
await db.query(`select save_profile('Rider','',true)`);
await assert.rejects(()=>db.query(`select create_booking('union','washington','walk',now()+interval '1 hour','','10000000-0000-4000-8000-000000000001')`),/Pilot is paused/);
await db.exec('reset role;update pilot_settings set paused=false;');await as(rider);
const booking=(await db.query<{b:any}>(`select to_jsonb(create_booking('union','washington','walk',now()+interval '1 hour','','10000000-0000-4000-8000-000000000001')) b`)).rows[0].b;
assert.equal(booking.amount_cents,estimate('union','washington','walk').total);
const duplicate=(await db.query<{id:string}>(`select (create_booking('union','washington','walk',now()+interval '1 hour','','10000000-0000-4000-8000-000000000001')).id`)).rows[0];assert.equal(duplicate.id,booking.id);
const pin=(await db.query<{pin:string}>(`select pin from meeting_pins where booking_id=$1`,[booking.id])).rows[0].pin;assert.match(pin,/^\d{4}$/);
await as(stranger);assert.equal((await db.query('select * from bookings')).rows.length,0);assert.equal((await db.query('select * from meeting_pins')).rows.length,0);
await assert.rejects(()=>db.query(`select booking_action($1,'cancel')`,[booking.id]),/Not a participant/);
await as(companion);assert.equal((await db.query('select * from bookings')).rows.length,1);assert.equal((await db.query('select * from meeting_pins')).rows.length,0);
await db.query(`select booking_action($1,'accept')`,[booking.id]);await assert.rejects(()=>db.query(`select booking_action($1,'accept')`,[booking.id]),/Journey unavailable/);
await db.query(`select booking_action($1,'arrive')`,[booking.id]);
const bad=(await db.query<{r:{error:string}}>(`select booking_action($1,'start','xxxx') r`,[booking.id])).rows[0].r;assert.equal(bad.error,'PIN does not match');
const nullPin=(await db.query<{r:{error:string}}>(`select booking_action($1,'start',null) r`,[booking.id])).rows[0].r;assert.equal(nullPin.error,'PIN does not match');
await db.exec('reset role');assert.equal((await db.query<{failed_attempts:number}>('select failed_attempts from meeting_pins')).rows[0].failed_attempts,2);await as(companion);
await db.query(`select booking_action($1,'start',$2)`,[booking.id,pin]);
await db.query(`select send_message($1,'At the arch','20000000-0000-4000-8000-000000000001')`,[booking.id]);
await as(stranger);assert.equal((await db.query('select * from messages')).rows.length,0);
await as(rider);assert.equal((await db.query('select * from messages')).rows.length,1);await db.query(`select booking_action($1,'complete')`,[booking.id]);
assert.equal((await db.query<{status:string}>('select status from bookings')).rows[0].status,'completion_requested');
await as(companion);await db.query(`select booking_action($1,'complete')`,[booking.id]);assert.equal((await db.query<{status:string}>('select status from bookings')).rows[0].status,'completed');
await as(rider);await db.query(`select booking_action($1,'rate','','',5)`,[booking.id]);await assert.rejects(()=>db.query(`select booking_action($1,'cancel')`,[booking.id]),/Action not allowed/);
// Compare PostgreSQL numeric rounding with shared JS prices for every distinct route.
for(const a of places)for(const b of places)if(a.id!==b.id)for(const service of ['walk','subway'] as const){const id=crypto.randomUUID();const q=(await db.query<{b:any}>(`select to_jsonb(create_booking($1,$2,$3,now()+interval '1 hour','',$4)) b`,[a.id,b.id,service,id])).rows[0].b;assert.equal(q.amount_cents,estimate(a.id,b.id,service).total,`${a.id}/${b.id}/${service}`);await db.query(`select booking_action($1,'cancel')`,[q.id]);}
}finally{await db.close()}});
