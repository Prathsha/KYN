export type CompanionFlowMode='live'|'demo';
export type CompanionPhase=1|2|3|4|5|6|7|'complete';

export function companionFlowMode(accountServiceAvailable:boolean):CompanionFlowMode{
 return accountServiceAvailable?'live':'demo';
}

export function nextCompanionPhase(phase:Exclude<CompanionPhase,'complete'>):CompanionPhase{
 return phase===7?'complete':(phase+1) as CompanionPhase;
}
