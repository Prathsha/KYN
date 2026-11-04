import {serviceAreas} from '@/shared/service-areas';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {client,body,json,fail,ApiError} from '@/lib/server';
export async function GET(req:NextRequest){try{const {db}=await client(req);const {data,error}=await db.from('companion_applications').select('*').order('submitted_at');if(error)throw new ApiError('Unable to load applications.',500);const history=await db.from('application_history').select('*').order('created_at',{ascending:false}).limit(100);if(history.error)throw new ApiError('Unable to load application history.',500);return json({applications:data,history:history.data})}catch(e){return fail(e)}}
export async function POST(req:NextRequest){try{
const {db}=await client(req);const i=z.discriminatedUnion('action',[
z.object({action:z.literal('apply'),name:z.string().trim().min(1).max(80),experience:z.string().trim().min(20).max(2000),availability:z.string().trim().min(3).max(500),area:z.enum(serviceAreas),consent:z.literal(true)}),
z.object({action:z.literal('review'),id:z.uuid(),status:z.enum(['under_review','changes_requested','approved','declined']),note:z.string().trim().min(3).max(1000),screened:z.boolean(),evidence:z.string().trim().max(500).optional(),recheck:z.iso.datetime().optional()})]).parse(await body(req));
if(i.action==='review'&&i.status==='approved'){if(!i.screened||!i.evidence||i.evidence.length<10||!i.recheck||new Date(i.recheck)<=new Date())throw new ApiError('Record screening evidence and a future recheck date before approval.');const {data:{user}}=await db.auth.getUser();const saved=await db.from('screening_reviews').upsert({user_id:i.id,reviewer_id:user!.id,evidence_reference:i.evidence,identity_checked:true,screening_checked:true,onboarding_checked:true,recheck_at:i.recheck});if(saved.error)throw new ApiError('Screening evidence could not be saved.',403);}
const result=i.action==='apply'?await db.rpc('submit_companion_application',{p_name:i.name,p_experience:i.experience,p_availability:i.availability,p_area:i.area,p_consent:i.consent}):await db.rpc('review_companion_application',{p_user:i.id,p_status:i.status,p_note:i.note,p_screened:i.screened});
if(result.error)throw new ApiError('Unable to save. Confirm your profile, ID upload, permissions and application status, then refresh.',409);
return json({application:result.data});
}catch(e){return fail(e)}}
