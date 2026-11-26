import type { Strip } from './planner';
import { decodeStock } from './stockCodec.ts';

export type RollType = { id:string; name:string; width:number; length:number };
export type RollStock = { id:string; typeId:string; name:string; remaining:number };
/** Roll taken by one recorded pass: exactly what to give back to the same roll on cancel. */
export type PassRecord = { recordedAt:number; consumed:{ rollId:string; length:number }[] };
/** Tracking of the current preparation, kept in the stock so it is synchronised with it. `passes` is keyed by pass index. */
export type Preparation = { key:string; passes:Record<string,PassRecord> };
export type Stock = { types:RollType[]; rolls:RollStock[]; selectedTypeId:string; preparation?:Preparation };
export const initialStock:Stock={types:[{id:'standard',name:'Strappal 4 cm × 10 m',width:4,length:1000}],rolls:[],selectedTypeId:'standard'};
export function loadStock():Stock {
 try {return decodeStock(JSON.parse(localStorage.getItem('strapp-stock')||'null'))??initialStock;} catch {return initialStock;}
}
/** Type whose width matches (used to preselect a type when a protocol is imported). */
export function typeForWidth(stock:Stock,width:number){return stock.types.find(t=>Math.abs(t.width-width)<1e-8);}
export function withNewType(stock:Stock,width:number,id:string):Stock{return {...stock,types:[...stock.types,{id,name:`Rouleau ${width} cm`,width,length:1000}],selectedTypeId:id};}
export function allocateStock(strips:Strip[],stock:Stock){
 const rolls=stock.rolls.filter(r=>r.typeId===stock.selectedTypeId).map(r=>({...r}));
 const assignments=strips.map(strip=>{
  // Use the smallest remainder that fits, keeping shorter remnants for later.
  const roll=rolls.filter(r=>r.remaining+1e-8>=strip.length).sort((a,b)=>a.remaining-b.remaining)[0];
  if(roll)roll.remaining-=strip.length;
  return {strip,rollId:roll?.id,rollName:roll?.name};
 });
 return {assignments,rolls,missing:assignments.filter(a=>!a.rollId)};
}

/**
 * Largest n in 1..4 whose real plan (`linesFor(n)`, lines of n sessions together) fits the stock, 0 if none.
 * The planner stacks consecutive identical pieces, even across sessions, so n sessions can cost less than n times one.
 * `linesFor` returns null when the plan is not valid.
 */
export function sessionsAvailableUpToFour(linesFor:(sessions:number)=>Strip[]|null,stock:Stock):number {
 let best=0;
 for(let n=1;n<=4;n++){
  const strips=linesFor(n);
  if(strips&&strips.length&&!allocateStock(strips,stock).missing.length)best=n;
 }
 return best;
}


/**
 * Pure: roll pieces consumed by one pass (a list of lines, e.g. `page.map(p=>p.strip)`), given the stock
 * as it stands before that pass. Each line takes one piece of roll of its own length.
 */
export function consumptionOf(strips:Strip[],stock:Stock){
 const allocation=allocateStock(strips,stock);
 const consumed=new Map<string,{rollId:string;rollName:string;length:number}>();
 for(const {strip,rollId,rollName} of allocation.assignments){
  if(!rollId)continue;
  const entry=consumed.get(rollId)??{rollId,rollName:rollName??'',length:0};
  entry.length+=strip.length;consumed.set(rollId,entry);
 }
 return {...allocation,consumed:[...consumed.values()]};
}
