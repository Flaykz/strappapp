import type { Stock } from './stock';
import { plan, type Protocol } from './planner';
import { newBandId } from './protocol';

type Props={protocol:Protocol;stock:Stock;onChange:(s:Stock)=>void;onSelect:(id:string)=>void};
export function StockManager({protocol,stock,onChange,onSelect}:Props){
 const selected=stock.types.find(t=>t.id===stock.selectedTypeId);
 const dailyPlan=selected?plan({...protocol,roll:selected.width,sessions:1}):null;
 const dailyLength=dailyPlan&&!dailyPlan.errors.length?dailyPlan.total:0;
 const fmt=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(n);
 function addType(){const id=newBandId();onChange({...stock,types:[...stock.types,{id,name:'Nouveau type',width:4,length:1000}],selectedTypeId:id});}
 return <section id="stock-manager"><div class="section-head"><div><h2>Mon stock de rouleaux</h2><p>Indique la longueur restante de chaque rouleau en centimètres. 10 m = 1 000 cm.</p></div></div>
  <label>Type utilisé <select value={stock.selectedTypeId} onChange={e=>onSelect(e.currentTarget.value)}>{stock.types.map(t=><option value={t.id}>{t.name} · {t.width} cm</option>)}</select></label> <button onClick={()=>onSelect(stock.selectedTypeId)}>Utiliser ce type</button> <button onClick={addType}>+ Ajouter un type</button>
  {selected&&<><div class="settings stock-settings"><label>Nom du type<input value={selected.name} onInput={e=>onChange({...stock,types:stock.types.map(t=>t.id===selected.id?{...t,name:e.currentTarget.value}:t)})}/></label><label>Largeur · cm<input type="number" min="0.1" step="0.1" value={selected.width} onInput={e=>onChange({...stock,types:stock.types.map(t=>t.id===selected.id?{...t,width:e.currentTarget.valueAsNumber||0}:t)})}/></label><label>Longueur d’un rouleau neuf · cm<input type="number" min="1" value={selected.length} onInput={e=>onChange({...stock,types:stock.types.map(t=>t.id===selected.id?{...t,length:e.currentTarget.valueAsNumber||0}:t)})}/></label></div>
  <button onClick={()=>onChange({...stock,rolls:[...stock.rolls,{id:newBandId(),typeId:selected.id,name:`Rouleau ${stock.rolls.filter(r=>r.typeId===selected.id).length+1}`,remaining:selected.length}]})}>+ Ajouter un rouleau neuf</button>
  <p class="hint">{dailyLength>0?`Pour une séance par jour : ${fmt(dailyLength)} cm de rouleau par séance. Estimation indicative, sans compter les pertes supplémentaires.`:"Renseigne un protocole valide pour estimer le nombre de jours."}</p><div class="stock-rolls">{stock.rolls.filter(r=>r.typeId===selected.id).map(r=><div class="stock-roll" key={r.id}><label>Rouleau<input value={r.name} onInput={e=>onChange({...stock,rolls:stock.rolls.map(item=>item.id===r.id?{...item,name:e.currentTarget.value}:item)})}/></label><label>Reste · cm<input type="number" min="0" step="0.1" value={r.remaining} onInput={e=>onChange({...stock,rolls:stock.rolls.map(item=>item.id===r.id?{...item,remaining:Math.max(0,e.currentTarget.valueAsNumber||0)}:item)})}/></label><span class="stock-days">{dailyLength>0?`Environ ${Math.floor((r.remaining+1e-8)/dailyLength)} jour(s) complets`:'Estimation indisponible'}</span><button onClick={()=>{if(confirm(`Retirer ${r.name} du stock ?`))onChange({...stock,rolls:stock.rolls.filter(item=>item.id!==r.id)});}}>Retirer</button></div>)}</div>
  {!stock.rolls.some(r=>r.typeId===selected.id)&&<p class="hint">Ajoute tes rouleaux pour répartir la préparation et suivre les restes.</p>}</>}
 </section>;
}
