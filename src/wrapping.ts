import type { Protocol } from './planner.ts';
export type WrapPiece = { key:string; name:string; length:number; side:'left'|'right'; copy:number; quantity:number; index:number };
export type WrapStep = { key:string; pieces:WrapPiece[] };
export function wrapSteps(protocol:Protocol,paired:boolean):WrapStep[]{
 return Array.from({length:protocol.sessions},(_,copy)=>protocol.bands.flatMap((band,index)=>{
  const sides:('left'|'right')[]=band.side==='both'?['left','right']:[band.side];
  const pieces=sides.map(side=>({key:`${band.id}-${copy}-${side}`,name:band.name,length:band.length,side,copy:copy+1,quantity:protocol.sessions,index}));
  return paired?[{key:`${band.id}-${copy}`,pieces}]:pieces.map(piece=>({key:piece.key,pieces:[piece]}));
 })).flat();
}
