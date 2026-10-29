import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import './fullscreen.css';

export function CuttingBoard({children,page,total,landscape,onRotate}:{children:ComponentChildren;page:number;total:number;landscape:boolean;onRotate:()=>void}){
 const panel=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);
 const [expanded,setExpanded]=useState(false);
 const native=useRef(false);
 async function close(){
  if(document.fullscreenElement===panel.current)try{await document.exitFullscreen();}catch{/* Keep the visible exit control if the browser refuses. */return;}
  native.current=false;setExpanded(false);toggle.current?.focus({preventScroll:true});
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
    const controls=panel.current?.querySelectorAll<HTMLButtonElement>('button');
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
  <div class="board-toolbar"><span>Passage {page} / {total}</span><div>{expanded&&<button onClick={onRotate}>↻ {landscape?'Portrait':'Paysage'}</button>}<button ref={toggle} aria-expanded={expanded} onClick={()=>void(expanded?close():open())}>{expanded?'✕ Quitter le plein écran':'⛶ Plein écran'}</button></div></div>
  <div class="board">{children}</div>
  {expanded&&<p class="board-fullscreen-hint">1 carreau = 1 cm · lignes renforcées tous les 5 cm · Échap pour quitter</p>}
 </div>;
}
