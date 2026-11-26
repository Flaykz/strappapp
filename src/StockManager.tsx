import { useState } from 'preact/hooks';
import { formatRollTypeName, rollTypeBrand, rollTypeName, stockBrands, type RollType, type Stock } from './stock';
import { plan, type Protocol } from './planner';
import { newBandId } from './protocol';

type Props={protocol:Protocol;stock:Stock;onChange:(s:Stock)=>void;onSelect:(id:string)=>void};
const meters=(centimeters:number)=>centimeters/100;
const suggestedFormats=[
 {brand:'Strappal',width:4,length:1000},
 {brand:'Strappal',width:4,length:500},
 {brand:'Tensoplast',width:8,length:300}
];

export function StockManager({protocol,stock,onChange}:Props){
 const [formatToAdd,setFormatToAdd]=useState(stock.selectedTypeId||stock.types[0]?.id||'');
 const [newBrand,setNewBrand]=useState('');
 const brands=stockBrands(stock);
 const selectedFormat=stock.types.find(type=>type.id===formatToAdd)??stock.types[0];
 const fmt=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(n);

 function updateType(id:string,patch:Partial<Pick<RollType,'brand'|'width'|'length'>>){
  onChange({...stock,types:stock.types.map(type=>{
   if(type.id!==id)return type;
   const updated={...type,...patch};
   return {...updated,name:formatRollTypeName(rollTypeBrand(updated),updated.width,updated.length)};
  })});
 }
 function addBrand(){
  const brand=newBrand.trim();
  if(!brand||brands.some(item=>item.toLocaleLowerCase('fr')===brand.toLocaleLowerCase('fr')))return;
  onChange({...stock,brands:[...brands,brand]});setNewBrand('');
 }
 function addFormat(){
  const id=newBandId(),brand=brands[0]??'Strappal',width=4,length=1000;
  onChange({...stock,brands:brands.length?brands:[brand],types:[...stock.types,{id,brand,width,length,name:formatRollTypeName(brand,width,length)}]});
  setFormatToAdd(id);
 }
 function addSuggestedFormat(format:(typeof suggestedFormats)[number]){
  const id=newBandId();
  onChange({...stock,brands:[...new Set([...brands,format.brand])],types:[...stock.types,{id,...format,name:formatRollTypeName(format.brand,format.width,format.length)}]});
  setFormatToAdd(id);
 }
 function addRoll(){
  if(!selectedFormat)return;
  const number=stock.rolls.filter(roll=>roll.typeId===selectedFormat.id).reduce((max,roll)=>Math.max(max,Number(roll.name.match(/#?(\d+)$/)?.[1]??0)),0)+1;
  onChange({...stock,rolls:[...stock.rolls,{id:newBandId(),typeId:selectedFormat.id,name:`${rollTypeBrand(selectedFormat)} #${number}`,remaining:selectedFormat.length}]});
 }
 function dailyLength(type:RollType){
  const result=plan({...protocol,roll:type.width,sessions:1});
  return result.errors.length?0:result.total;
 }

 return <section id="stock-manager"><div class="section-head"><div><h2>Mon stock de rouleaux</h2><p>Ajoute un rouleau en choisissant simplement son format.</p></div></div>
  <div class="stock-add"><label>Format du nouveau rouleau<select value={selectedFormat?.id??''} onChange={e=>setFormatToAdd(e.currentTarget.value)}>{stock.types.map(type=><option value={type.id}>{rollTypeName(type)}</option>)}</select></label><button class="primary" disabled={!selectedFormat} onClick={addRoll}>+ Ajouter un rouleau neuf</button></div>
  {!stock.types.length&&<p class="hint">Configure d’abord un format de rouleau dans le paramétrage ci-dessous.</p>}
  <div class="stock-rolls">{stock.rolls.map(roll=>{const type=stock.types.find(item=>item.id===roll.typeId);const perDay=type?dailyLength(type):0;return <div class="stock-roll" key={roll.id}><div class="stock-roll-format"><strong>{type?rollTypeName(type):'Format supprimé'}</strong><input class="stock-roll-name" aria-label={`Repère du rouleau ${roll.name}`} value={roll.name} onInput={e=>onChange({...stock,rolls:stock.rolls.map(item=>item.id===roll.id?{...item,name:e.currentTarget.value}:item)})}/></div><label>Reste · cm<input type="number" min="0" step="0.1" value={roll.remaining} onInput={e=>onChange({...stock,rolls:stock.rolls.map(item=>item.id===roll.id?{...item,remaining:Math.max(0,e.currentTarget.valueAsNumber||0)}:item)})}/></label><span class="stock-days">{perDay>0?`Environ ${Math.floor((roll.remaining+1e-8)/perDay)} jour(s) · ${fmt(roll.remaining)} cm restants`:`${fmt(roll.remaining)} cm restants`}</span><button onClick={()=>{if(confirm(`Retirer ${roll.name} du stock ?`))onChange({...stock,rolls:stock.rolls.filter(item=>item.id!==roll.id)});}}>Retirer</button></div>})}</div>
  {!stock.rolls.length&&<p class="hint">Aucun rouleau en stock pour le moment.</p>}

  <details class="stock-settings-panel"><summary>Paramétrage des familles et formats</summary><div class="stock-settings-content">
   <h3>Familles de rouleaux</h3><p class="hint">Exemples : Strappal, Tensoplast ou toute autre référence que tu utilises.</p>
   <div class="stock-brands">{brands.map(brand=>{const used=stock.types.some(type=>rollTypeBrand(type)===brand);return <span>{brand}<button disabled={used} title={used?'Cette famille est utilisée par un format.':''} onClick={()=>onChange({...stock,brands:brands.filter(item=>item!==brand)})} aria-label={`Supprimer ${brand}`}>×</button></span>})}</div>
   <div class="stock-add-brand"><label>Nouvelle famille<input value={newBrand} placeholder="Ex. Leukoplast" onInput={e=>setNewBrand(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addBrand();}}}/></label><button onClick={addBrand} disabled={!newBrand.trim()}>Ajouter</button></div>
   <h3>Formats suggérés</h3><div class="stock-suggestions">{suggestedFormats.map(format=>{const exists=stock.types.some(type=>rollTypeBrand(type)===format.brand&&type.width===format.width&&type.length===format.length);return <button disabled={exists} onClick={()=>addSuggestedFormat(format)}>{exists?'✓ ': '+ '}{formatRollTypeName(format.brand,format.width,format.length)}</button>})}</div>
   <div class="stock-formats-head"><h3>Formats disponibles</h3><button onClick={addFormat}>+ Ajouter un format personnalisé</button></div>
   <div class="stock-formats">{stock.types.map(type=>{const used=stock.rolls.some(roll=>roll.typeId===type.id)||stock.selectedTypeId===type.id;return <div class="stock-format" key={type.id}><strong>{rollTypeName(type)}</strong><label>Famille<select value={rollTypeBrand(type)} onChange={e=>updateType(type.id,{brand:e.currentTarget.value})}>{brands.map(brand=><option value={brand}>{brand}</option>)}</select></label><label>Largeur · cm<input type="number" min="0.1" step="0.1" value={type.width} onInput={e=>updateType(type.id,{width:e.currentTarget.valueAsNumber||0})}/></label><label>Longueur · m<input type="number" min="0.01" step="0.01" value={meters(type.length)} onInput={e=>updateType(type.id,{length:(e.currentTarget.valueAsNumber||0)*100})}/></label><button disabled={used} title={used?'Format utilisé par le protocole ou par un rouleau en stock.':''} onClick={()=>onChange({...stock,types:stock.types.filter(item=>item.id!==type.id)})}>Supprimer</button></div>})}</div>
  </div></details>
 </section>;
}
