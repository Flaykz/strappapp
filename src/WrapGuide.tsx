import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Protocol } from './planner';
import { wrapSteps, type WrapPiece } from './wrapping';
import './wrapping.css';

const colors=['#b9dccc','#f5d59b','#c5d5ed','#e6c4d8','#d5d9a4','#c1dfe5'];
const fmt=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(n);
export function WrapGuide({protocol,active}:{protocol:Protocol;active:boolean}){
 const [paired,setPaired]=useState(true),[cursor,setCursor]=useState(0),[activeSession,setActiveSession]=useState(1),[animation,setAnimation]=useState(0),[animatedSides,setAnimatedSides]=useState<string[]>([]);
 const lastAction=useRef(-Infinity);
 const advanceButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(active)advanceButton.current?.focus({preventScroll:true});},[active]);
 const steps=useMemo(()=>wrapSteps(protocol,paired),[protocol,paired]);
 const current=steps[cursor],next=steps[cursor+1];
 const pendingSession=!!current&&current.pieces[0].copy>activeSession;
 const last:{left?:WrapPiece;right?:WrapPiece}={};
 let completedPieces=0;
 for(const step of steps.slice(0,cursor))for(const piece of step.pieces){if(piece.copy===activeSession)last[piece.side]=piece;completedPieces++;}
 const totalPieces=steps.reduce((n,step)=>n+step.pieces.length,0);
 const advance=()=>{
  if(!active||!current||performance.now()-lastAction.current<350)return;
  lastAction.current=performance.now();
  if(pendingSession){setActiveSession(current.pieces[0].copy);setAnimatedSides([]);return;}
  setAnimatedSides(current.pieces.map(p=>p.side));setAnimation(n=>n+1);setCursor(n=>Math.min(n+1,steps.length));
 };
 useEffect(()=>{
  if(!active)return;
  const onKey=(event:KeyboardEvent)=>{
   if(![' ','Enter'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing)return;
   const target=event.target instanceof Element?event.target:null;
   if(target?.closest('input,select,textarea,a,[contenteditable="true"],[role="button"]'))return;
   if(target?.closest('button')&&!target.closest('[data-wrap-advance]'))return;
   event.preventDefault();
   if(!event.repeat)advance();
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[active,cursor,paired,steps,activeSession]);
 function restart(){if(cursor>0&&!confirm('Recommencer le guidage depuis la première bande ?'))return;setCursor(0);setActiveSession(1);setAnimatedSides([]);lastAction.current=performance.now();}
 const sideText=(pieces:WrapPiece[])=>pieces.length===2?'gauche et droite':pieces[0].side==='left'?'gauche':'droite';
 return <section class="wrap-guide">
  <div class="section-head"><div><h2>Enroule, valide, continue.</h2><p>Une étape à la fois, dans l’ordre du protocole.</p></div><button onClick={restart}>Nouvelle préparation</button></div>
  <label class="wrap-mode"><input type="checkbox" checked={paired} disabled={cursor>0} onChange={e=>{setPaired(e.currentTarget.checked);setAnimatedSides([]);}}/><span>Valider gauche et droite ensemble<small>{cursor>0?'Mode fixé pour cette préparation. Recommence pour le changer.':'Décoche pour valider la gauche, puis la droite, séparément.'}</small></span></label>
  <div class="wrap-progress-label"><span>{completedPieces} / {totalPieces} bandes enroulées</span><span>{current?`Étape ${cursor+1} / ${steps.length}`:'Terminé'}</span></div>
  <div class="progress" role="progressbar" aria-label="Bandes enroulées" aria-valuemin={0} aria-valuemax={totalPieces} aria-valuenow={completedPieces}><span style={{width:`${totalPieces?completedPieces/totalPieces*100:0}%`}}/></div>
  <div class="guided-mandrel" aria-label="Dernière bande enroulée de chaque côté du mandrin">
   {(['left','right'] as const).map(side=><div class={`mandrel-side ${!pendingSession&&current?.pieces.some(p=>p.side===side)?'is-next':''}`}><span class="mandrel-caption">{side==='left'?'GAUCHE':'DROITE'}</span><div class="mandrel-cylinder">{last[side]?<div key={`${last[side]!.key}-${animatedSides.includes(side)?animation:0}`} class={`mandrel-tape ${animatedSides.includes(side)?'is-winding':''}`} style={{backgroundColor:colors[last[side]!.index%colors.length]}}><strong>{last[side]!.name}</strong><span>{fmt(last[side]!.length)} cm{last[side]!.quantity>1?` · séance ${last[side]!.copy}`:''}</span></div>:<span class="mandrel-empty">Aucune bande</span>}</div></div>)}
  </div>
  <p class="mandrel-legend">Le nom sur le mandrin indique la dernière bande validée de chaque côté.</p>
  <div class="wrap-current" aria-live="polite" aria-atomic="true">
   {pendingSession?<><div class="eyebrow">SÉANCE {activeSession} TERMINÉE</div><h3>Prends un autre mandrin.</h3><p>Le jeu précédent est complet. Prépare un mandrin vide pour la séance {current.pieces[0].copy}.</p></>:current?<><div class="eyebrow">SÉANCE {current.pieces[0].copy} / {protocol.sessions} · {sideText(current.pieces)}</div><h3>{current.pieces[0].name}<span>{fmt(current.pieces[0].length)} cm</span></h3><p>{current.pieces.length===2?'Une bande à gauche et une à droite.':`Une bande à ${sideText(current.pieces)}.`}</p></>:<><div class="eyebrow">PRÉPARATION TERMINÉE</div><h3>Tout est prêt pour demain.</h3><p>Les {totalPieces} bandes ont été validées dans l’ordre.</p></>}
  </div>
  <div class="wrap-controls"><button disabled={cursor===0} onClick={()=>{setActiveSession(steps[Math.max(0,cursor-1)].pieces[0].copy);setCursor(n=>Math.max(0,n-1));setAnimatedSides([]);lastAction.current=performance.now();advanceButton.current?.focus({preventScroll:true});}}>← Annuler la dernière validation</button><button ref={advanceButton} class="primary wrap-advance" data-wrap-advance aria-keyshortcuts="Space Enter" disabled={!current} onClick={advance}>{pendingSession?`Commencer la séance ${current.pieces[0].copy} →`:current?current.pieces.length===2?'Les deux bandes sont enroulées ✓':'Bande enroulée ✓':'Enroulage terminé ✓'}</button></div>
  <p class="wrap-shortcut">Valide avec <kbd>Espace</kbd> ou <kbd>Entrée</kbd> · une pression par étape.</p>
  {next&&!pendingSession&&<p class="wrap-upcoming">Ensuite : <strong>{next.pieces[0].name} · {fmt(next.pieces[0].length)} cm</strong> · {sideText(next.pieces)} · séance {next.pieces[0].copy}</p>}
 </section>;
}
