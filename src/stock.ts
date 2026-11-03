import type { Strip } from './planner';

export type RollType = { id:string; name:string; width:number; length:number };
export type RollStock = { id:string; typeId:string; name:string; remaining:number };
export type Stock = { types:RollType[]; rolls:RollStock[]; selectedTypeId:string };
export const initialStock:Stock={types:[{id:'standard',name:'Strappal 4 cm × 10 m',width:4,length:1000}],rolls:[],selectedTypeId:'standard'};
export function loadStock():Stock {
 try {
  const s=JSON.parse(localStorage.getItem('strapp-stock')||'null');
  if(!s || !Array.isArray(s.types) || !Array.isArray(s.rolls) || typeof s.selectedTypeId!=='string') return initialStock;
  if(!s.types.every((t:RollType)=>typeof t.id==='string'&&typeof t.name==='string'&&Number.isFinite(t.width)&&t.width>0&&Number.isFinite(t.length)&&t.length>0)||!s.rolls.every((r:RollStock)=>typeof r.id==='string'&&typeof r.typeId==='string'&&typeof r.name==='string'&&Number.isFinite(r.remaining)&&r.remaining>=0))return initialStock;
  return s;
 } catch {return initialStock;}
}
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

// Count up to four complete sessions, respecting the length of each roll.
export function sessionsAvailableUpToFour(strips:Strip[],stock:Stock):number {
 let current=stock;
 for(let days=0;days<4;days++){
  const allocation=allocateStock(strips,current);
  if(allocation.missing.length)return days;
  const remaining=new Map(allocation.rolls.map(roll=>[roll.id,roll.remaining]));
  current={...current,rolls:current.rolls.map(roll=>remaining.has(roll.id)?{...roll,remaining:remaining.get(roll.id)!}:roll)};
 }
 return 4;
}
