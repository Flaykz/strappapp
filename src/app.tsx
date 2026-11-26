import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { plan, type Protocol, type Band } from './planner';
import './style.css';
import { decodeProtocol, newBandId } from './protocol';
import { CuttingBoard } from './CuttingBoard';
import { BoardPlan, colors } from './BoardPlan';
import { StockManager } from './StockManager';
import { SyncPanel } from './SyncPanel';
import { useSync } from './sync/useSync';
import { PassStock } from './PassStock';
import { RollSelect } from './RollSelect';
import { planKey, recordedPasses } from './preparation';
import { loadStock, sessionsAvailableUpToFour, typeForWidth, withNewType, type Stock } from './stock';

const initial:Protocol={sessions:1,roll:5,boardLength:43,boardWidth:23,bands:[5,7,9].map((length,i)=>({id:`example-${i}`,name:`A${i+1}`,length,side:'both'}))};
const fmt=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(n);
function load():{protocol:Protocol;notice:string} {
 try {
  const raw=localStorage.getItem('strapp-protocol');
  const decoded=decodeProtocol(JSON.parse(raw||'null'));
  if(!decoded)return {protocol:initial,notice:''};
  let backupAvailable=true;
  if(decoded.migrated&&raw)try{if(!localStorage.getItem('strapp-protocol-before-global-settings'))localStorage.setItem('strapp-protocol-before-global-settings',raw);}catch{backupAvailable=false;}
  const notice=[decoded.mixedQuantities?'Les anciennes quantités différaient : la préparation est réglée sur 1 séance complète. Vérifie le nombre de séances.':''].filter(Boolean).join(' ');
  return {protocol:decoded.protocol,notice:notice+(decoded.migrated&&!backupAvailable?' La copie de sauvegarde de l’ancien format n’a pas pu être enregistrée.':'')};
 }catch{return {protocol:initial,notice:''};}
}
const loaded=load();
function App(){
 const [p,setP]=useState<Protocol>(loaded.protocol),[tab,setTab]=useState(0),[notice,setNotice]=useState(loaded.notice),[saved,setSaved]=useState(true),[swapped,setSwapped]=useState(false),[selectedPage,setSelectedPage]=useState(0);
 const [stock,setStock]=useState<Stock>(loadStock);
 const {engine:syncEngine,state:syncState}=useSync(p,stock,{onProtocol:remote=>{setP(remote);setNotice('Protocole mis à jour depuis la synchronisation.');},onStock:remote=>{setStock(remote);setNotice('Stock mis à jour depuis la synchronisation.');}});
 const selectedType=stock.types.find(t=>t.id===stock.selectedTypeId);
 // The roll width comes from the selected stock type; `p.roll` is only a fallback; never rewritten from the stock by an effect (the sync would see a local edit), only on an explicit type choice.
 const rollWidth=selectedType?selectedType.width:p.roll;
 const eff:Protocol=p.roll===rollWidth?p:{...p,roll:rollWidth};
 function selectType(id:string){setStock({...stock,selectedTypeId:id});const width=stock.types.find(t=>t.id===id)?.width;if(width)setP(prev=>prev.roll===width?prev:{...prev,roll:width});}
 const result=plan(eff);
 const dailyPlan=selectedType?plan({...eff,sessions:1}):null;
 const hasStock=stock.rolls.some(r=>r.typeId===stock.selectedTypeId);
 const daysLeft=hasStock&&dailyPlan&&!dailyPlan.errors.length&&dailyPlan.strips.length?sessionsAvailableUpToFour(n=>{const sessionsPlan=plan({...eff,sessions:n});return sessionsPlan.errors.length?null:sessionsPlan.strips;},stock):null;
 const pagePieces=result.pages.map(page=>page.reduce((count,{strip})=>count+strip.pieces.length,0));
 const totalPieces=pagePieces.reduce((count,n)=>count+n,0);
 const pageIndex=Math.min(selectedPage,Math.max(0,result.pages.length-1));
 const recorded=result.pages.map((_,i)=>Object.hasOwn(recordedPasses(stock,planKey(eff)),i));
 const page=result.pages[pageIndex]??[];
 const wide=(swapped?p.boardWidth:p.boardLength)>=(swapped?p.boardLength:p.boardWidth);
 useEffect(()=>{setSelectedPage(0);},[p]);
 useEffect(()=>{try{localStorage.setItem('strapp-stock',JSON.stringify(stock));}catch{setNotice('Sauvegarde du stock indisponible sur cet appareil.');}},[stock]);
 useEffect(()=>{try{localStorage.setItem('strapp-protocol',JSON.stringify(p));setSaved(true);}catch{setSaved(false);}},[p]);
 function update(id:string,patch:Partial<Band>){setP({...p,bands:p.bands.map(b=>b.id===id?{...b,...patch}:b)});}
 function move(i:number,delta:number){const bands=[...p.bands];[bands[i],bands[i+delta]]=[bands[i+delta],bands[i]];setP({...p,bands});}
 function exportFile(){const url=URL.createObjectURL(new Blob([JSON.stringify(eff,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='strapp-protocole.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function importFile(file?:File){if(!file)return;try{if(file.size>1000000)throw Error();const decoded=decodeProtocol(JSON.parse(await file.text()));if(!decoded)throw Error();if(confirm(decoded.mixedQuantities?'Les anciennes quantités diffèrent : le protocole sera importé pour 1 séance complète. Remplacer le protocole actuel ?':'Remplacer le protocole actuel par celui du fichier ?')){setP(decoded.protocol);const match=typeForWidth(stock,decoded.protocol.roll);if(match)setStock({...stock,selectedTypeId:match.id});setNotice(match||!selectedType?'Protocole importé.':`Protocole importé. Aucun type de rouleau de ${decoded.protocol.roll} cm dans ton stock : la largeur du type sélectionné (${selectedType.width} cm) est utilisée.`);}}catch{setNotice('Import impossible : le fichier de protocole est invalide.');}}
 const num=(label:string,value:number,change:(n:number)=>void,integer=false)=><label>{label}<input type="number" min={integer?1:0.1} step={integer?1:0.1} value={value||''} onInput={e=>change(e.currentTarget.valueAsNumber||0)}/></label>;
 return <><header><a class="brand" href="#">▥ <span>strapp<span class="dot">.</span></span></a><span class="save">{saved?'● Sauvegardé sur cet appareil':'⚠ Sauvegarde indisponible : exporte ton protocole'}</span></header><main><div class="intro"><div class="eyebrow">LE SOIN COMMENCE LA VEILLE</div><h1>Tout prêt pour demain.</h1><p>Ton protocole, des découpes claires et les bandes dans le bon ordre.</p></div><nav aria-label="Étapes de préparation">{['Mon protocole','Découper'].map((name,i)=><button class={tab===i?'active':''} onClick={()=>setTab(i)}><span>0{i+1}</span>{name}</button>)}</nav>
 {daysLeft!==null&&daysLeft<=3&&<div class="capacity-notice" role="status"><strong>Stock de Strappal bientôt épuisé</strong><p>{daysLeft===0?'Le stock enregistré ne permet plus de préparer une séance complète.':`Il reste de quoi préparer environ ${daysLeft} journée${daysLeft>1?'s':''} complète${daysLeft>1?'s':''}, à raison d’une séance par jour.`} Pense à acheter un rouleau. Cette estimation dépend des restes enregistrés et ne compte pas les pertes supplémentaires.</p><button onClick={()=>{setTab(0);requestAnimationFrame(()=>document.getElementById('stock-manager')?.scrollIntoView({behavior:'smooth',block:'start'}));}}>Voir mon stock</button></div>}
 {notice&&<p role="status" class="notice">{notice}<button onClick={()=>setNotice('')} aria-label="Fermer">×</button></p>}
 {!result.errors.length&&result.pages.length>1&&<div class="capacity-notice" role="status"><strong>Préparation répartie sur {result.pages.length} passages</strong><p>Pour {p.sessions} séance{p.sessions>1?'s':''}, ce plan répartit les {totalPieces} bandes en {result.pages.length} passages sur ta plaque unique.</p><p>Utilise les flèches du plan pour passer d’un passage à l’autre ; chaque passage se pose et se découpe sur la plaque dans l’ordre du protocole.</p></div>}
 {tab===0&&<><StockManager protocol={eff} stock={stock} onChange={setStock} onSelect={selectType}/><section><div class="section-head"><div><h2>Ton matériel</h2><p>Les dimensions utiles, en centimètres.</p></div><span class="tag">CM</span></div><div class="settings">{num('Séances à préparer',p.sessions,sessions=>setP({...p,sessions}),true)}<RollSelect stock={stock} fallbackWidth={p.roll} onSelect={selectType} onCreate={()=>setStock(withNewType(stock,p.roll||4,newBandId()))}/>{num('Longueur de la plaque',p.boardLength,boardLength=>setP({...p,boardLength}))}{num('Largeur de la plaque',p.boardWidth,boardWidth=>setP({...p,boardWidth}))}</div></section><section><div class="section-head"><div><h2>Les bandes du protocole</h2><p>L’ordre des lignes est l’ordre de pose : la première bande est posée en premier, en lisant la plaque de gauche à droite puis de haut en bas.</p></div><button class="primary" onClick={()=>setP({...p,bands:[...p.bands,{id:newBandId(),name:`A${p.bands.length+1}`,length:5,side:'both'}]})}>+ Ajouter une bande</button></div><div class="bands">{p.bands.map((b,i)=><div class="band"><span class="ordinal" style={{background:colors[i%colors.length]}}>{i+1}</span><label>Nom<input value={b.name} onInput={e=>update(b.id,{name:e.currentTarget.value})}/></label>{num('Longueur · cm',b.length,length=>update(b.id,{length}),true)}<label>Côté<select value={b.side} onChange={e=>update(b.id,{side:e.currentTarget.value as Band['side']})}><option value="both">Gauche + droite</option><option value="left">Gauche</option><option value="right">Droite</option></select></label><label class="check"><input type="checkbox" checked={!!b.fullWidth} onChange={e=>update(b.id,{fullWidth:e.currentTarget.checked})}/>Largeur entière</label><div class="row-actions"><button disabled={i===0} onClick={()=>move(i,-1)} aria-label={`Monter ${b.name}`}>↑</button><button disabled={i===p.bands.length-1} onClick={()=>move(i,1)} aria-label={`Descendre ${b.name}`}>↓</button><button onClick={()=>{if(confirm(`Supprimer ${b.name} ?`))setP({...p,bands:p.bands.filter(x=>x.id!==b.id)});}} aria-label={`Supprimer ${b.name}`}>×</button></div></div>)}</div><p class="hint">Le protocole initial A1 / A2 / A3 est un exemple modifiable. Chaque séance comprend une bande de chaque côté sélectionné ; les pièces consécutives de même longueur (par exemple une bande Gauche puis une bande Droite) sont superposées dans la largeur du rouleau. Une bande fait la moitié de la largeur du rouleau. « Largeur entière » donne à la bande toute la largeur du rouleau : ses pièces gauche et droite sont alors posées bout à bout. Le nombre de séances multiplie tout le protocole.</p><div class="footer-actions"><div><button onClick={exportFile}>Exporter</button><label class="file-button">Importer<input type="file" accept="application/json,.json" onChange={e=>{void importFile(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label></div><button class="primary" onClick={()=>setTab(1)}>Voir le plan de découpe →</button></div></section><SyncPanel engine={syncEngine} state={syncState}/></>}
 {result.errors.length>0&&<div class="errors" role="alert"><strong>À vérifier avant de préparer</strong><ul>{result.errors.map(e=><li>{e}</li>)}</ul></div>}
 {tab===1&&!result.errors.length&&<><div class="stats"><div><strong>{fmt(result.total)} cm</strong><span>de rouleau à préparer</span></div><div><strong>{result.cuts} coupes</strong><span>gestes, préparation comprise</span></div><div><strong>{result.pages.length} passage{result.pages.length>1?'s':''}</strong><span>sur la plaque</span></div><div><strong>{fmt(result.waste)} cm²</strong><span>de chutes</span></div></div><section><div class="section-head"><div><h2>Les plans de découpe</h2><p>Plaque de {fmt(p.boardLength)} × {fmt(p.boardWidth)} cm · vue de dessus · lecture de gauche à droite puis de haut en bas</p></div></div><CuttingBoard recorded={recorded} onSelect={setSelectedPage} passPanel={<PassStock key={pageIndex} stock={stock} protocol={eff} pageIndex={pageIndex} strips={page.map(pl=>pl.strip)} onChange={setStock}/>} pieces={pagePieces[pageIndex]} totalPieces={totalPieces} remaining={pagePieces.slice(pageIndex+1).reduce((count,n)=>count+n,0)} onPrevious={()=>setSelectedPage(pageIndex-1)} onNext={()=>setSelectedPage(pageIndex+1)} page={pageIndex+1} total={result.pages.length} rotateLabel={wide?'Portrait':'Paysage'} onRotate={()=>setSwapped(!swapped)}><BoardPlan page={page} pageIndex={pageIndex} roll={rollWidth} boardLength={p.boardLength} boardWidth={p.boardWidth} swapped={swapped}/></CuttingBoard><p class="hint">Origine (0,0) en haut à gauche, cotes en cm depuis ce bord. Chaque ligne est un morceau de rouleau déroulé de gauche à droite ; les traits pointillés sont les coupes. G = gauche, D = droite.</p></section></>}
 <footer>strapp. · Préparer simplement, suivre ton protocole.<span>Données stockées dans ce navigateur ; synchronisation optionnelle avec un compte. Exporte-les pour les conserver.</span></footer></main></>;
}
render(<App/>,document.getElementById('app')!);
