import type { Stock } from './stock';

/** The roll width comes only from the stock: pick the roll type, its width is read-only here. */
export function RollSelect({stock,fallbackWidth,onSelect,onCreate}:{stock:Stock;fallbackWidth:number;onSelect:(id:string)=>void;onCreate:()=>void}){
 const selected=stock.types.find(t=>t.id===stock.selectedTypeId);
 if(!stock.types.length)return <div class="roll-select"><p>Aucun type de rouleau : crée-en un pour définir la largeur du rouleau (en attendant, {fallbackWidth} cm est utilisé).</p><button onClick={onCreate}>Créer un type de {fallbackWidth} cm</button></div>;
 return <div class="roll-select"><label>Type de rouleau<select value={stock.selectedTypeId} onChange={e=>onSelect(e.currentTarget.value)}>{stock.types.map(t=><option value={t.id}>{t.name} · {t.width} cm</option>)}</select></label><p class="hint">Largeur du rouleau : <strong>{selected?`${selected.width} cm`:`${fallbackWidth} cm`}</strong>, définie dans « Mon stock de rouleaux ».</p></div>;
}
