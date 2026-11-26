import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useWakeLock } from './useWakeLock';
import './fullscreen.css';

export function CuttingBoard({children,page,total,rotateLabel,onRotate,pieces,totalPieces,remaining,onNext,onPrevious,onSelect,recorded,passPanel}:{recorded:boolean[];onSelect:(index:number)=>void;passPanel:ComponentChildren;pieces:number;totalPieces:number;remaining:number;onNext:()=>void;onPrevious:()=>void;children:ComponentChildren;page:number;total:number;rotateLabel:string;onRotate:()=>void}){
 const panel=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);
 const [expanded,setExpanded]=useState(false);
 const native=useRef(false);
 const [keepAwake,setKeepAwake]=useState(true);
 const wake=useWakeLock(keepAwake);
 async function close(){
  if(document.fullscreenElement===panel.current)try{await document.exitFullscreen();}catch{/* Keep the visible exit control if the browser refuses. */return false;}
  native.current=false;setExpanded(false);toggle.current?.focus({preventScroll:true});return true;
 }
 async function open(){
  setExpanded(true);
  if(panel.current?.requestFullscreen)try{await panel.current.requestFullscreen();native.current=true;}catch{/* Unsupported browsers still get an enlarged viewport. */}
 }
 useEffect(()=>{
  const changed=()=>{if(document.fullscreenElement===panel.current)native.current=true;else if(native.current){native.current=false;setExpanded(false);toggle.current?.focus({preventScroll:true});}};
  document.addEventListener('fullscreenchange',changed);
  return()=>document.removeEventListener('fullscreenchange',changed);
 },[]);
 useEffect(()=>{
  if(!expanded)return;
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  toggle.current?.focus({preventScroll:true});
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();void close();}
   if(event.key==='Tab'){
    const controls=panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    if(!controls?.length)return;
    const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',keydown);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keydown);};
 },[expanded]);
 return <div ref={panel} class={`cutting-board-panel ${expanded?'is-expanded':''}`} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} aria-label={`Plan de découpe, passage ${page} sur ${total}`}>
  <div class="board-toolbar"><div class="board-pagination" aria-label="Navigation entre les passages"><button class="board-arrow" disabled={page<=1} onClick={onPrevious} aria-label="Passage précédent">←</button><strong aria-live="polite" aria-atomic="true"><span>Passage</span>{page} / {total}</strong><button class="board-arrow" disabled={page>=total} onClick={onNext} aria-label="Passage suivant">→</button>{total>1&&<span class="board-passes">{recorded.map((done,i)=><button class={`board-pass ${i+1===page?"is-current":""}`} aria-current={i+1===page?"step":undefined} onClick={()=>onSelect(i)} aria-label={`Passage ${i+1}${done?", consommation enregistrée":""}`}>{i+1}{done&&<span aria-hidden="true"> ✓</span>}</button>)}</span>}</div><div class="board-view-controls"><button onClick={onRotate}>↻ {rotateLabel}</button>{wake.supported&&<button class="board-wake" aria-pressed={keepAwake} onClick={()=>setKeepAwake(v=>!v)}>{keepAwake?(wake.active?'☀ Écran allumé : activé':'☀ Écran allumé : en attente'):'☾ Écran allumé : désactivé'}</button>}<button ref={toggle} aria-expanded={expanded} onClick={()=>void(expanded?close():open())}>{expanded?'✕ Quitter le plein écran':'⛶ Plein écran'}</button></div></div>
  {total>1&&<div class="board-partial"><strong>Plan partiel : {pieces} / {totalPieces} bandes</strong><span>{remaining>0?`${remaining} bandes sur les passages suivants.`:'Dernier passage : les plans précédents sont aussi à réaliser.'}</span></div>}
  {passPanel}
  <div class="board">{children}</div>
  {expanded&&<p class="board-fullscreen-hint">Graduation en cm · Échap pour quitter</p>}
 </div>;
}
