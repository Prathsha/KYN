'use client';
import {serviceAreas,defaultServiceArea} from '@/shared/service-areas';

import {useEffect,useState,type FormEvent} from 'react';
import {supabase,api} from '@/lib/supabase';
import {companionFlowMode,nextCompanionPhase,type CompanionPhase} from '@/shared/companion-walkthrough';
import type {Profile} from '@/shared/domain';

function CompanionProgress({current,complete=false}:{current:number;complete?:boolean}){
 return <ol className="step-indicators" aria-label={complete?'Companion application walkthrough complete':`Companion application, step ${current} of 6`}>
  {[1,2,3,4,5,6].map(n=>{
   const done=complete||n<current;
   return <li key={n} className={done?'complete':n===current?'current':''} aria-current={!complete&&n===current?'step':undefined}><span>{n}</span></li>;
  })}
 </ol>;
}

export function CompanionAuth(){
 const [mode,setMode]=useState('signup');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [name,setName]=useState('');
 const [sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [cooldown,setCooldown]=useState(0);
 const [demoProfile,setDemoProfile]=useState<Profile|null>(null);
 const flowMode=companionFlowMode(Boolean(supabase));

 useEffect(()=>{
  if(!cooldown)return;
  const timer=setTimeout(()=>setCooldown(cooldown-1),1000);
  return()=>clearTimeout(timer);
 },[cooldown]);

 async function submit(event:FormEvent){
  event.preventDefault();
  setBusy(true);
  setError('');
  try{
   if(flowMode==='demo'){
    setDemoProfile({
     id:'demo-companion',
     full_name:name.trim()||email.split('@')[0]||'Demo companion',
     role:'rider',
     approved:false,
     available:false,
     adult_confirmed:false,
     notes:'',
    });
    return;
   }
   if(!supabase)throw Error('Account service unavailable.');
   const result=mode==='signup'
    ?await supabase.auth.signUp({email,password,options:{data:{full_name:name,companion_onboarding:true},emailRedirectTo:window.location.origin}})
    :await supabase.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   if(!result.data.session){setSent(true);setCooldown(60)}
  }catch(caught){
   setError(caught instanceof Error?caught.message:'Please try again.');
  }finally{
   setBusy(false);
  }
 }

 if(demoProfile)return <CompanionWizard profile={demoProfile} demo/>;

 return <section className="surface onboarding-card" id="companion-account">
  <span className="eyebrow">STEP 1 · ACCOUNT</span>
  <CompanionProgress current={1}/>
  <h2>{sent?'Check your email':mode==='signup'?'Let’s get you started.':'Welcome back.'}</h2>
  {flowMode==='demo'&&<div className="notice-soft" role="note"><span><b>Demo walkthrough.</b> Your entries stay on this page. No account, identity check, or application will be created.</span></div>}
  {sent&&<p>We requested a confirmation link for <b>{email}</b>. Open it to continue here, or confirm on another device and then sign in below. Check Spam if it hasn’t arrived.</p>}
  <form onSubmit={submit}>
   {mode==='signup'&&<label className="field">Full name<input required autoComplete="name" maxLength={80} value={name} onChange={event=>setName(event.target.value)}/></label>}
   <label className="field">Email<input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></label>
   <label className="field">Password<input required type="password" autoComplete={mode==='signup'?'new-password':'current-password'} minLength={flowMode==='demo'?1:mode==='signup'?12:1} value={password} onChange={event=>setPassword(event.target.value)}/></label>
   <button className="button full" disabled={busy||(mode==='signup'&&cooldown>0)}>{busy?'Please wait…':flowMode==='demo'?'Continue in demo mode':mode==='signup'?'Create companion account':'Sign in & continue'}</button>
  </form>
  <button className="text-button full" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setError('')}}>{mode==='signup'?'Already have an account? Sign in':'Create an account'}</button>
  {sent&&<button className="text-button full" disabled={busy||cooldown>0} onClick={async()=>{
   setBusy(true);
   try{
    const result=await supabase!.auth.resend({type:'signup',email,options:{emailRedirectTo:window.location.origin}});
    if(result.error)throw result.error;
    setCooldown(60);
   }catch(caught){
    setError(caught instanceof Error?caught.message:'Unable to resend.');
   }finally{
    setBusy(false);
   }
  }}>{cooldown?`Resend in ${cooldown}s`:'Resend confirmation email'}</button>}
  {error&&<p className="error" role="alert">{error}</p>}
 </section>;
}

type Draft={name:string;area:string;availability:string;experience:string};
type CompanionWizardProps={
 profile:Profile;
 initial?:{full_name:string;service_area:string;availability:string;experience:string};
 onComplete?:()=>Promise<void>;
 demo?:boolean;
};

export function CompanionWizard({profile,initial,onComplete,demo=false}:CompanionWizardProps){
 const [phase,setPhase]=useState<CompanionPhase>(2);
 const [draft,setDraft]=useState<Draft>({
  name:initial?.full_name||profile.full_name,
  area:initial?.service_area||defaultServiceArea,
  availability:initial?.availability||'',
  experience:initial?.experience||'',
 });
 const [adult,setAdult]=useState(profile.adult_confirmed);
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const names=['Your profile','Where & when','Your experience','Safety & onboarding','Review & submit'];

 async function next(event:FormEvent){
  event.preventDefault();
  if(phase==='complete')return;
  setError('');
  if(phase===2){
   setBusy(true);
   try{
    if(!demo)await api('profile',{full_name:draft.name,notes:profile.notes||'',adult_confirmed:adult});
    setPhase(nextCompanionPhase(phase));
   }catch(caught){
    setError(caught instanceof Error?caught.message:'Unable to save.');
   }finally{
    setBusy(false);
   }
   return;
  }
  if(phase<6){
   setPhase(nextCompanionPhase(phase));
   return;
  }
  setBusy(true);
  try{
   if(demo){
    setPhase('complete');
    return;
   }
   await api('companions',{action:'apply',...draft,consent});
   await supabase?.auth.updateUser({data:{companion_onboarding:false}});
   await onComplete?.();
  }catch(caught){
   setError(caught instanceof Error?caught.message:'Unable to submit.');
  }finally{
   setBusy(false);
  }
 }

 if(phase==='complete')return <section className="surface onboarding-card" role="status">
  <span className="eyebrow">DEMO APPLICATION COMPLETE</span>
  <CompanionProgress current={6} complete/>
  <h2>You made it through every step.</h2>
  <p>This is where a submitted application would move to KYN operations for identity, screening, and onboarding review.</p>
  <div className="notice-soft"><span>No account, identity check, background check, or application was created during this walkthrough.</span></div>
  <button className="button secondary" onClick={()=>setPhase(2)}>Review the steps again</button>
 </section>;

 const stepIndex=phase-2;
 return <section className="surface onboarding-card">
  <span className="eyebrow">STEP {phase} OF 6{demo?' · DEMO':''}</span>
  <CompanionProgress current={phase}/>
  <h2>{names[stepIndex]}</h2>
  <form onSubmit={next}>
   {phase===2?<>
    <label className="field">Full name<input required maxLength={80} autoComplete="name" value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
    <label className="checkbox"><input type="checkbox" required checked={adult} onChange={event=>setAdult(event.target.checked)}/>I confirm I am 18 or older.</label>
   </>:phase===3?<>
    <label className="field">Your service area<select value={draft.area} onChange={event=>setDraft({...draft,area:event.target.value})}>{serviceAreas.map(area=><option key={area}>{area}</option>)}</select></label>
    <label className="field">When can you accompany people?<textarea required minLength={3} maxLength={500} placeholder="For example, Monday–Thursday, 6–9 pm" value={draft.availability} onChange={event=>setDraft({...draft,availability:event.target.value})}/></label>
   </>:phase===4?
    <label className="field">Tell us about your local knowledge and experience<textarea required minLength={20} maxLength={2000} rows={6} placeholder="Which neighborhoods and subway routes do you know? What experience do you have helping people?" value={draft.experience} onChange={event=>setDraft({...draft,experience:event.target.value})}/><small>At least 20 characters. Please leave out identity documents and sensitive personal details.</small></label>
   :phase===5?<>
    <h3>Before your first journey</h3>
    <ul><li>Meet at the agreed public meeting point.</li><li>Verify the meeting PIN in person.</li><li>Respect boundaries and agreed routes.</li><li>Use reporting tools when something is wrong. For emergencies, contact emergency services directly.</li></ul>
    <p>The KYN team must complete identity, screening and onboarding review before approving you. These checks are coordinated separately; no automated check has been run by this form.</p>
    {demo&&<div className="notice-soft"><span>For this walkthrough, screening is represented by this step only. No documents are requested or checked.</span></div>}
    <label className="checkbox"><input type="checkbox" required checked={consent} onChange={event=>setConsent(event.target.checked)}/>I agree to these expectations and to complete screening before accepting journeys.</label>
   </>:<>
    <dl><dt>Name</dt><dd>{draft.name}</dd><dt>Area</dt><dd>{draft.area}</dd><dt>Availability</dt><dd>{draft.availability}</dd><dt>Experience</dt><dd style={{whiteSpace:'pre-wrap'}}>{draft.experience}</dd></dl>
    <p>{demo?'Finishing completes the walkthrough without sending anything.':'Submitting sends your application to operations. Your status and any requested changes will appear here.'}</p>
    <p className="muted">Demo mode does not process identity checks, earnings, or payouts.</p>
   </>}
   <div className="onboarding-actions">
    {phase>2&&<button type="button" className="button secondary" disabled={busy} onClick={()=>setPhase((phase-1) as CompanionPhase)}>Back</button>}
    <button className="button" disabled={busy}>{busy?'Saving…':phase===6?(demo?'Finish walkthrough':'Submit application'):'Continue'}</button>
   </div>
  </form>
  {error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
