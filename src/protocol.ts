import type { Protocol, Band } from './planner.ts';

export function decodeProtocol(value: unknown): { protocol: Protocol; migrated: boolean; mixedWidths: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const p=value as Record<string,unknown>;
  if (![p.roll,p.boardLength,p.boardWidth].every(n=>typeof n==='number') || !Array.isArray(p.bands) || p.bands.length>200) return null;
  const migrated=!Object.hasOwn(p,'bandWidth');
  if (!migrated && typeof p.bandWidth!=='number') return null;
  const bands: Band[]=[];
  const widths:number[]=[];
  for(const b of p.bands){
    if(!b||typeof b!=='object'||typeof b.id!=='string'||typeof b.name!=='string'||typeof b.length!=='number'||typeof b.quantity!=='number'||!['both','left','right'].includes(b.side))return null;
    if(migrated&&typeof b.width!=='number')return null;
    if(migrated)widths.push(b.width);
    bands.push({id:b.id,name:b.name,length:b.length,quantity:b.quantity,side:b.side});
  }
  if(new Set(bands.map(b=>b.id)).size!==bands.length)return null;
  return {protocol:{roll:p.roll as number,boardLength:p.boardLength as number,boardWidth:p.boardWidth as number,bandWidth:migrated?(widths[0]??Math.min(2.5,p.roll as number)):p.bandWidth as number,bands},migrated,mixedWidths:new Set(widths).size>1};
}
