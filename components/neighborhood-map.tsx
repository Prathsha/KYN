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
  if(unique.length>1){
   const routePoints=unique.map(p=>[p.lat,p.lng] as [number,number]);
    L.polyline(routePoints,{className:'kyn-route-casing',color:'#FCFDF9',weight:12,opacity:.96,lineCap:'round'}).addTo(markers);
    L.polyline(routePoints,{className:'kyn-route-line',color:'#17211C',weight:7,opacity:1,lineCap:'round'}).addTo(markers);
  }
  for(const p of unique){
   const label=`${p.id===a?.id?'Meeting point':'Destination'}: ${p.name}`;
   const content=document.createElement('div');
   const title=document.createElement('strong');title.textContent=label;
   const address=document.createElement('p');address.textContent=p.address;address.style.margin='6px 0 0';
   content.append(title,address);
   L.marker([p.lat,p.lng],{
    title:label,alt:label,
    icon:L.divIcon({className:`kyn-map-pin ${p.id===a?.id?'is-origin':'is-destination'}`,html:`<span>${p.id===a?.id?'A':'B'}</span>`,iconSize:[34,34],iconAnchor:[17,17]}),
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
  {q?<div className="route-estimate kyn-map-route"><div><strong>{q.minutes} min</strong><span>{q.miles} mi · Planning estimate</span></div>{directions&&<a href={directions} target="_blank" rel="noopener noreferrer">{service==='subway'?'Transit directions':'Walking directions'} <ExternalLink size={12}/></a>}</div>:<div className="map-intro"><Leaf size={23}/><span className="eyebrow">A LITTLE COMPANY GOES A LONG WAY</span><h2>Your neighborhood.<br/>A little more familiar.</h2><p>A walk home. A new subway route.<br/>A person to share the way.</p></div>}
  <div className="map-controls"><button aria-label="Zoom in" disabled={!ready} onClick={()=>instance.current?.map.zoomIn()}><Plus size={16}/></button><button aria-label="Zoom out" disabled={!ready} onClick={()=>instance.current?.map.zoomOut()}><Minus size={16}/></button><button aria-label="Recenter map" disabled={!ready} onClick={()=>recenter.current()}><LocateFixed size={16}/></button></div>
  <style jsx global>{`
   .kyn-live-map{isolation:isolate;background:#DDE3D9}
   .kyn-live-map .kyn-map-canvas{z-index:0;transition:none;background:#DDE3D9}
   .kyn-live-map .leaflet-tile-pane{filter:grayscale(.68) sepia(.11) saturate(.52) contrast(.9) brightness(1.04);opacity:.93}
   .kyn-live-map .leaflet-overlay-pane{filter:drop-shadow(0 2px 2px #243b3020)}
   .kyn-live-map .leaflet-overlay-pane svg{width:auto;height:auto}
   .kyn-live-map:after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(135deg,#e9eee30B,#becab50E)}
   .kyn-live-map .map-header,.kyn-live-map .map-intro,.kyn-live-map .map-controls,.kyn-live-map .kyn-map-route,.kyn-live-map .kyn-map-status{z-index:2}
   .kyn-live-map .map-header,.kyn-live-map .map-intro{pointer-events:none}
   .kyn-live-map .map-header{top:22px;left:22px;right:22px}
   .kyn-live-map .map-header>span{border:0;background:#FCFDF9E8;box-shadow:0 7px 22px #243b3014;backdrop-filter:blur(10px);font-weight:650}
   .kyn-live-map .map-header .map-area{background:#EFF3EAE8;color:#52654F;font-weight:600}
   .kyn-live-map .kyn-map-route{top:auto;left:24px;bottom:28px;max-width:calc(100% - 92px);display:flex;align-items:center;gap:20px;padding:14px 16px;border:1px solid #D9E1D4;box-shadow:0 9px 28px #243b3024;background:#FCFDF9F2;backdrop-filter:blur(12px)}
   .kyn-live-map .kyn-map-route strong{font-size:20px;letter-spacing:-.6px;margin:0 0 3px}
   .kyn-live-map .kyn-map-route span{display:block;font-size:9px;white-space:nowrap}
   .kyn-map-route a{display:flex;align-items:center;gap:7px;margin:0;padding:9px 11px;border-radius:7px;background:#243B30;color:white;font-size:10px;font-weight:700;text-decoration:none;white-space:nowrap}
   .kyn-map-route a:hover{background:#3A5743}
   .kyn-map-pin{border:0!important;background:transparent!important;display:grid!important;place-items:center;filter:none!important}
   .kyn-map-pin span{width:30px;height:30px;display:grid;place-items:center;background:#243B30;border:4px solid #FCFDF9;border-radius:50%;box-shadow:0 3px 12px #243b3050;color:white;font-size:11px;font-weight:800;line-height:1}
   .kyn-map-pin.is-destination span{background:#FCFDF9;color:#243B30;border-color:#243B30}
   .kyn-route-line{stroke-linecap:round}
   .kyn-map-status{position:absolute;top:80px;left:20px;right:20px;width:fit-content;background:#FCFDF9;padding:12px;border-radius:8px;font-size:11px;box-shadow:0 2px 10px #344e2715}
   .kyn-map-status button{text-decoration:underline;font-weight:bold}
   .kyn-live-map .map-controls{bottom:28px;right:22px;border:0;border-radius:10px;box-shadow:0 8px 24px #243b3022}
   .kyn-live-map .map-controls button{background:#FCFDF9F2;width:40px;height:39px}
   .kyn-live-map .map-intro{border:0;box-shadow:0 12px 34px #243b3020;background:#FCFDF9ED;backdrop-filter:blur(12px)}
   .kyn-live-map .leaflet-control-attribution{font-size:9px}
   @media(max-width:760px){
    .kyn-live-map .map-header{left:12px;right:12px;top:12px}
    .kyn-live-map .map-header>span{padding:8px 9px}
    .kyn-live-map .kyn-map-route{left:12px;bottom:18px;gap:10px;padding:11px 12px;max-width:calc(100% - 64px)}
    .kyn-live-map .kyn-map-route strong{font-size:17px}
    .kyn-live-map .kyn-map-route span{font-size:8px}
    .kyn-map-route a{padding:8px;font-size:0;gap:0}
    .kyn-map-route a svg{width:14px;height:14px}
    .kyn-live-map .map-controls{right:12px;bottom:18px}
    .kyn-live-map .map-controls button{width:34px;height:34px}
    .kyn-live-map .kyn-map-status{top:58px}
    .kyn-live-map .leaflet-control-attribution{font-size:8px;margin-bottom:12px}
   }
  `}</style>
 </section>;
}
