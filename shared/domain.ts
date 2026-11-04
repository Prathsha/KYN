export const palette={aloe:'#D6DBD3',salt:'#C9D5C9',sage:'#CCD5C5',olive:'#CECEBC',ink:'#243B30',paper:'#F6F7F2'};
export const places=[{id:'union',lat:40.7345,lng:-73.9904,name:'Union Square',address:'South plaza · E 14th St & Broadway',x:510,y:250},{id:'washington',lat:40.7312,lng:-73.9971,name:'Washington Square Park',address:'North arch · 5th Avenue',x:300,y:530},{id:'astor',lat:40.7299,lng:-73.991,name:'Astor Place',address:'Outside the 6 train entrance',x:580,y:420},{id:'tompkins',lat:40.7265,lng:-73.9838,name:'Tompkins Square Park',address:'Southwest gate · Avenue A',x:810,y:495},{id:'bobst',lat:40.7295,lng:-73.9972,name:'NYU Bobst Library',address:'Public sidewalk · Washington Square S',x:350,y:600},{id:'cooper',lat:40.7281,lng:-73.9903,name:'Cooper Union',address:'Foundation Building · E 7th St',x:610,y:465},{id:'strand',lat:40.7332,lng:-73.9909,name:'Strand Book Store',address:'Main entrance · Broadway',x:485,y:315},{id:'stuyvesant',lat:40.7347,lng:-73.9865,name:'Stuyvesant Square',address:'West park gate · E 16th St',x:735,y:225}] as const;
export type PlaceId=typeof places[number]['id'];
export type Service='walk'|'subway';
export type Status='requested'|'accepted'|'arrived'|'active'|'completion_requested'|'completed'|'cancelled'|'reported'|'expired'|'ended_early'|'no_show';
export type Role='rider'|'companion'|'ops';
export type Profile={id:string;full_name:string;role:Role;approved:boolean;available:boolean;adult_confirmed:boolean;notes:string};
export type Journey={id:string;rider_id:string;companion_id:string|null;origin:string;destination:string;service:Service;scheduled_at:string;status:Status;amount_cents:number;duration_minutes:number;notes:string;rating:number|null;rider_done:boolean;companion_done:boolean;created_at:string;updated_at:string};
export type Message={id:string;booking_id:string;sender_id:string;body:string;created_at:string};
export const terminal:Status[]=['completed','cancelled','reported','expired','ended_early','no_show'];
export function place(id:string){return places.find(p=>p.id===id)}
export function money(cents:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)}
export function estimate(from:string,to:string,service:Service){const a=place(from),b=place(to);if(!a||!b||a.id===b.id)throw new Error('Choose two different public meeting points.');const miles=Math.round(Math.hypot(a.x-b.x,a.y-b.y)/490*10)/10;const walk=Math.max(7,Math.round(miles*25));const minutes=service==='walk'?walk:Math.max(14,walk-3);const base=service==='walk'?400:500,rate=service==='walk'?20:15,fee=150,time=minutes*rate;return {minutes,miles,base,time,fee,total:base+time+fee}}
export const labels:Record<Status,string>={expired:'No companion matched',ended_early:'Ended early',no_show:'No-show reported',requested:'Awaiting companion acceptance',accepted:'Buddy assigned',arrived:'At the meeting point',active:'Journey in progress',completion_requested:'Confirming arrival',completed:'Completed',cancelled:'Cancelled',reported:'Ended · Report saved'};
export type Action='accept'|'arrive'|'start'|'complete'|'cancel'|'report'|'rate'|'availability'|'pause'|'heartbeat'|'end_early'|'no_show';
export function canAct(action:Action,trip:Journey,uid:string,role:Role){const rider=trip.rider_id===uid,companion=trip.companion_id===uid;if(action==='end_early')return (rider||companion)&&['active','completion_requested'].includes(trip.status);if(action==='no_show')return (rider||companion)&&trip.status==='arrived'&&Date.now()-new Date(trip.updated_at).getTime()>=600000;if(action==='accept')return role==='companion'&&trip.status==='requested'&&!rider;if(action==='arrive')return companion&&trip.status==='accepted';if(action==='start')return companion&&trip.status==='arrived';if(action==='complete')return (rider||companion)&&['active','completion_requested'].includes(trip.status);if(action==='cancel')return (rider||companion)&&['requested','accepted','arrived'].includes(trip.status);if(action==='report')return (rider||companion)&&!terminal.includes(trip.status);if(action==='rate')return rider&&trip.status==='completed';return false}

// Maps URLs work on desktop and mobile without a Google Maps API key.
export function mapDirections(from:string,to:string,service:Service){
 const a=place(from),b=place(to);
 if(!a||!b||a.id===b.id)return null;
 const params=new URLSearchParams({api:'1',origin:`${a.lat},${a.lng}`,destination:`${b.lat},${b.lng}`,travelmode:service==='subway'?'transit':'walking'});
 return `https://www.google.com/maps/dir/?${params}`;
}
