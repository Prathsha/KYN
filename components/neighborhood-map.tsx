'use client';

import {useEffect,useRef,useState} from 'react';
import {MapPin,Plus,Minus,LocateFixed,Leaf,ExternalLink} from 'lucide-react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {place,estimate,mapDirections,type Service} from '@/shared/domain';

type MapState={map:Leaflet.Map;markers:Leaflet.LayerGroup;L:typeof Leaflet};

export function NeighborhoodMap({origin,destination,service='walk'}:{origin:string;destination:string;service?:Service}){
 const container=useRef<HTMLDivElement>(null);
 const instance=useRef<MapState|null>(null);
 const recenter=useRef<()=>void>(()=>{});
 const [ready,setReady]=useState(false);
 const [failed,setFailed]=useState(false);
 const [tileError,setTileError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const a=place(origin),b=place(destination);
 const q=a&&b&&a.id!==b.id?estimate(a.id,b.id,service):null;
 const directions=mapDirections(origin,destination,service);

 useEffect(()=>{
  let disposed=false;
  let observer:ResizeObserver|undefined;
  let map:Leaflet.Map|undefined;
  setReady(false);setFailed(false);setTileError(false);
  // Import only in the browser: Leaflet reads window at module initialization.
  import('leaflet').then(L=>{
   if(disposed||!container.current)return;
   map=L.map(container.current,{zoomControl:false,scrollWheelZoom:false}).setView([40.7308,-73.9905],14);
   map.attributionControl.setPrefix(false);
   L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
   }).on('tileerror',()=>{if(!disposed)setTileError(true)}).on('tileload',()=>{if(!disposed)setTileError(false)}).addTo(map);
   instance.current={map,markers:L.layerGroup().addTo(map),L};
   observer=new ResizeObserver(()=>{map?.invalidateSize();recenter.current()});
   observer.observe(container.current);
   setReady(true);
  }).catch(()=>{if(!disposed)setFailed(true)});
  return()=>{disposed=true;observer?.disconnect();map?.remove();instance.current=null};
 },[attempt]);

 useEffect(()=>{
  const state=instance.current;
  if(!ready||!state)return;
  const {map,markers,L}=state;
  markers.clearLayers();
  const selected=[a,b].filter((p):p is NonNullable<typeof p>=>!!p);
  const unique=selected.filter((p,i)=>selected.findIndex(v=>v.id===p.id)===i);
  for(const p of unique){
   const label=`${p.id===a?.id?'Meeting point':'Destination'}: ${p.name}`;
   const content=document.createElement('div');
   const title=document.createElement('strong');title.textContent=label;
   const address=document.createElement('p');address.textContent=p.address;address.style.margin='6px 0 0';
   content.append(title,address);
   L.marker([p.lat,p.lng],{
    title:label,alt:label,
    icon:L.divIcon({className:'kyn-map-pin',html:p.id===a?.id?'A':'B',iconSize:[30,30],iconAnchor:[15,15]}),
   }).bindPopup(content).addTo(markers);
  }
  const fit=()=>{
   if(unique.length>1){
    const compact=map.getSize().x<600;
    map.fitBounds(L.latLngBounds(unique.map(p=>[p.lat,p.lng])),{paddingTopLeft:compact?[175,65]:[45,85],paddingBottomRight:compact?[60,70]:[65,100],maxZoom:16,animate:false});
   }
   else if(unique.length)map.setView([unique[0].lat,unique[0].lng],15,{animate:false});
   else map.setView([40.7308,-73.9905],14,{animate:false});
  };
  recenter.current=fit;
  fit();
 },[ready,a,b]);

 return <section className="map kyn-live-map" aria-label="Interactive neighborhood map">
  <div ref={container} className="map-art kyn-map-canvas" aria-label="Street map of public meeting points"/>
  <div className="map-header"><span><MapPin size={14}/> East Village · NYC</span><span className="map-area">Neighborhood pilot</span></div>
  {!ready&&!failed&&<div className="kyn-map-status" role="status">Loading street map…</div>}
  {(failed||tileError)&&<div className="kyn-map-status" role="alert">Street map unavailable. Check your connection. <button onClick={()=>setAttempt(v=>v+1)}>Retry map</button></div>}
  {q?<div className="route-estimate kyn-map-route"><strong>{q.minutes} min</strong><span>{q.miles} mi · Planning estimate</span>{directions&&<a href={directions} target="_blank" rel="noopener noreferrer">{service==='subway'?'Transit directions':'Walking directions'} <ExternalLink size={12}/></a>}</div>:<div className="map-intro"><Leaf size={23}/><span className="eyebrow">A LITTLE COMPANY GOES A LONG WAY</span><h2>Your neighborhood.<br/>A little more familiar.</h2><p>A walk home. A new subway route.<br/>A person to share the way.</p></div>}
  <div className="map-controls"><button aria-label="Zoom in" disabled={!ready} onClick={()=>instance.current?.map.zoomIn()}><Plus size={16}/></button><button aria-label="Zoom out" disabled={!ready} onClick={()=>instance.current?.map.zoomOut()}><Minus size={16}/></button><button aria-label="Recenter map" disabled={!ready} onClick={()=>recenter.current()}><LocateFixed size={16}/></button></div>
  <style jsx global>{`
   .kyn-live-map{isolation:isolate}
   .kyn-live-map .kyn-map-canvas{z-index:0;transition:none}
   .kyn-live-map .map-header,.kyn-live-map .map-intro,.kyn-live-map .map-controls,.kyn-live-map .kyn-map-route,.kyn-live-map .kyn-map-status{z-index:1}
   .kyn-live-map .map-header,.kyn-live-map .map-intro{pointer-events:none}
   .kyn-live-map .kyn-map-route{top:auto;left:24px;bottom:38px;max-width:calc(100% - 90px)}
   .kyn-map-route a{display:flex;align-items:center;gap:7px;margin-top:10px;font-size:11px;font-weight:700}
   .kyn-map-pin{background:#34533D;border:3px solid white;border-radius:50%;box-shadow:0 1px 7px #243b3060;color:white;text-align:center;line-height:24px;font-size:12px;font-weight:bold}
   .kyn-map-status{position:absolute;top:80px;left:20px;right:20px;width:fit-content;background:#FCFDF9;padding:12px;border-radius:8px;font-size:11px;box-shadow:0 2px 10px #344e2715}
   .kyn-map-status button{text-decoration:underline;font-weight:bold}
   .kyn-live-map .leaflet-control-attribution{font-size:9px}
   @media(max-width:760px){.kyn-live-map .kyn-map-route{left:16px;bottom:26px}.kyn-live-map .kyn-map-status{top:58px}.kyn-live-map .leaflet-control-attribution{font-size:8px;margin-bottom:16px}}
  `}</style>
 </section>;
}
