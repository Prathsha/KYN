'use client';

import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {place,places} from '@/shared/domain';

type PlaceSelectProps={
 label:string;
 value:string;
 onChange:(value:string)=>void;
 placeholder?:string;
};

export function PlaceSelect({label,value,onChange,placeholder}:PlaceSelectProps){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const options=useRef<Array<HTMLButtonElement|null>>([]);
 const listboxId=useId();
 const choices=placeholder?[{id:'',name:placeholder},...places]:places;
 const selected=place(value)?.name||placeholder||'Choose a place';

 useEffect(()=>{
  if(!open)return;
  const close=(event:PointerEvent)=>{
   if(!root.current?.contains(event.target as Node))setOpen(false);
  };
  document.addEventListener('pointerdown',close);
  const selectedIndex=Math.max(0,choices.findIndex(choice=>choice.id===value));
  options.current[selectedIndex]?.focus();
  return()=>document.removeEventListener('pointerdown',close);
 },[open,value]);

 const closeAndFocus=()=>{
  setOpen(false);
  requestAnimationFrame(()=>trigger.current?.focus());
 };

 const moveFocus=(event:KeyboardEvent<HTMLButtonElement>,direction:1|-1)=>{
  event.preventDefault();
  const current=options.current.indexOf(event.currentTarget);
  const next=(current+direction+choices.length)%choices.length;
  options.current[next]?.focus();
 };

 return <div className="place-select" ref={root}>
  <button
   ref={trigger}
   type="button"
   className="place-select-trigger"
   aria-label={label}
   aria-haspopup="listbox"
   aria-expanded={open}
   aria-controls={open?listboxId:undefined}
   onClick={()=>setOpen(current=>!current)}
   onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault();
     setOpen(true);
    }
   }}
  >
   <span>{selected}</span><ChevronDown size={17} aria-hidden="true"/>
  </button>
  {open&&<div className="place-select-menu" id={listboxId} role="listbox" aria-label={label}>
   {choices.map((choice,index)=><button
    key={choice.id||'placeholder'}
    ref={element=>{options.current[index]=element}}
    type="button"
    role="option"
    aria-selected={choice.id===value}
    className="place-select-option"
    onClick={()=>{onChange(choice.id);closeAndFocus()}}
    onKeyDown={event=>{
     if(event.key==='ArrowDown')moveFocus(event,1);
     else if(event.key==='ArrowUp')moveFocus(event,-1);
     else if(event.key==='Home'){event.preventDefault();options.current[0]?.focus()}
     else if(event.key==='End'){event.preventDefault();options.current[choices.length-1]?.focus()}
     else if(event.key==='Escape')closeAndFocus();
     else if(event.key==='Tab')setOpen(false);
    }}
   >
    <span>{choice.name}</span>{choice.id===value&&<Check size={16} aria-hidden="true"/>}
   </button>)}
  </div>}
 </div>;
}
