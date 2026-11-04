import test from 'node:test';
import assert from 'node:assert/strict';
import {companionFlowMode,nextCompanionPhase,type CompanionPhase} from '../shared/companion-walkthrough.ts';

test('an unconfigured companion application uses demo mode and can visit all seven phases',()=>{
 assert.equal(companionFlowMode(false),'demo');
 assert.equal(companionFlowMode(true),'live');
 const visited:number[]=[];
 let phase:CompanionPhase=1;
 while(phase!=='complete'){
  visited.push(phase);
  phase=nextCompanionPhase(phase);
 }
 assert.deepEqual(visited,[1,2,3,4,5,6,7]);
});
