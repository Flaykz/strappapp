import { useState } from 'preact/hooks';
import type { Protocol, Strip } from './planner';
import { cancelPass, clearPreparation, passRecord, planKey, recordedPasses, recordPass, staleCount } from './preparation';
import { consumptionOf, type Stock } from './stock';
import './passStock.css';

const fmt=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(n);

type Props={stock:Stock;protocol:Protocol;pageIndex:number;strips:Strip[];onChange:(s:Stock)=>void};

/** Roll consumption of the displayed pass: allocation, record button, cancel button. `protocol` carries the effective roll width. */
export function PassStock({stock,protocol,pageIndex,strips,onChange}:Props){
 const [message,setMessage]=useState('');
 const key=planKey(protocol);
 const stale=staleCount(stock,key);
 const selected=stock.types.find(t=>t.id===stock.selectedTypeId);
 const rolls=stock.rolls.filter(r=>r.typeId===stock.selectedTypeId);
 const record=passRecord(stock,key,pageIndex);
 const number=pageIndex+1;
 const unrecordedBefore=Array.from({length:pageIndex},(_,i)=>i).some(i=>!Object.hasOwn(recordedPasses(stock,key),i));
 const staleNotice=stale>0&&<p class="stock-warning" role="status">Le protocole, la largeur du rouleau ou la plaque a changé : le suivi des passages repart à zéro. {stale} passage{stale>1?'s':''} de la préparation précédente {stale>1?'étaient enregistrés et restent décomptés':'était enregistré et reste décompté'} du stock. <button onClick={()=>onChange(clearPreparation(stock))}>Compris</button></p>;
 if(!selected)return <div class="pass-stock">{staleNotice}<p class="hint">Crée un type de rouleau dans « Mon protocole » pour suivre le stock.</p></div>;
 if(!rolls.length)return <div class="pass-stock">{staleNotice}<p class="hint">Ajoute tes rouleaux dans « Mon protocole » pour suivre leur consommation.</p></div>;
 function save(){
  if(!confirm(`Enregistrer la consommation du passage ${number} ? À faire une fois ses découpes réalisées.`))return;
  const result=recordPass(stock,key,strips,pageIndex,Date.now());
  if(result.ok){setMessage('');onChange(result.stock);}
  else setMessage(result.reason==='missing'?`Stock insuffisant pour ${result.missing} ligne(s) de ce passage.`:result.reason==='already'?'Ce passage est déjà enregistré.':'Ce passage ne contient aucune ligne.');
 }
 function undo(){
  if(!confirm(`Annuler l’enregistrement du passage ${number} ? Les longueurs consommées seront rendues aux mêmes rouleaux.`))return;
  const result=cancelPass(stock,key,pageIndex);
  if(!result)return;
  onChange(result.stock);
  setMessage(result.lost.length?`Passage ${number} annulé, mais ${result.lost.length} rouleau${result.lost.length>1?'x ont':' a'} été retiré${result.lost.length>1?'s':''} du stock : ${fmt(result.lost.reduce((n,l)=>n+l.length,0))} cm n’ont pas pu être rendus.`:'');
 }
 if(record)return <div class="pass-stock">{staleNotice}<p class="stock-confirmed" role="status"><span aria-hidden="true">✓ </span>Consommation du passage {number} enregistrée : {record.consumed.map(c=>`${stock.rolls.find(r=>r.id===c.rollId)?.name??'rouleau retiré'} −${fmt(c.length)} cm`).join(' · ')}.</p>{message&&<p class="stock-warning" role="status">{message}</p>}<button onClick={undo}>Annuler l’enregistrement de ce passage</button></div>;
 const allocation=consumptionOf(strips,stock);
 return <div class="pass-stock">{staleNotice}
  <div class="stock-allocation">{allocation.assignments.map((a,i)=><p>Ligne {i+1} · {fmt(a.strip.length)} cm : <strong>{a.rollName??'aucun rouleau assez long'}</strong></p>)}</div>
  {unrecordedBefore&&<p class="hint" role="status">Passages précédents non enregistrés : restes prévus indicatifs.</p>}
  <p class="hint">Restes prévus après ce passage : {allocation.rolls.map(r=>`${r.name} : ${fmt(r.remaining)} cm`).join(' · ')}</p>
  {message&&<p class="stock-warning" role="status">{message}</p>}
  {allocation.missing.length>0
   ?<p class="stock-warning" role="status">Stock insuffisant pour {allocation.missing.length} ligne(s) de ce passage. Ajoute un rouleau ou ajuste les restes.</p>
   :<button class="primary" onClick={save}>Enregistrer la consommation de ce passage</button>}
 </div>;
}
