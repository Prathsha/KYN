import {NextRequest} from 'next/server';
import {z} from 'zod';
import {client,body,json,fail,ApiError} from '@/lib/server';
export async function GET(req:NextRequest){try{const {db}=await client(req);const {data,error}=await db.from('companion_applications').select('*').order('submitted_at');if(error)throw new ApiError('Unable to load applications.',500);return json({applications:data})}catch(e){return fail(e)}}
export async function POST(req:NextRequest){try{
const {db}=await client(req);const i=z.discriminatedUnion('action',[
z.object({action:z.literal('apply'),name:z.string().trim().min(1).max(80),experience:z.string().trim().min(20).max(2000),availability:z.string().trim().min(3).max(500),area:z.enum(['East Village','NYU / Greenwich Village','Union Square','All pilot areas']),consent:z.literal(true)}),
z.object({action:z.literal('review'),id:z.uuid(),status:z.enum(['under_review','changes_requested','approved','declined']),note:z.string().trim().min(3).max(1000),screened:z.boolean()})]).parse(await body(req));
const result=i.action==='apply'?await db.rpc('submit_companion_application',{p_name:i.name,p_experience:i.experience,p_availability:i.availability,p_area:i.area,p_consent:i.consent}):await db.rpc('review_companion_application',{p_user:i.id,p_status:i.status,p_note:i.note,p_screened:i.screened});
if(result.error)throw new ApiError('Unable to save. Confirm your profile, permissions and application status, then refresh.',409);
return json({application:result.data});
}catch(e){return fail(e)}}
