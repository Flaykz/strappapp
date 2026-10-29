import type { Protocol, Band } from './planner.ts';

// randomUUID is HTTPS-only; getRandomValues also works on the local NAS over HTTP.
export function newBandId():string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function decodeProtocol(value: unknown): { protocol: Protocol; migrated: boolean; mixedWidths: boolean; mixedQuantities: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const p=value as Record<string,unknown>;
  if (![p.roll,p.boardLength,p.boardWidth].every(n=>typeof n==='number') || !Array.isArray(p.bands) || p.bands.length>200) return null;
  const oldWidth=!Object.hasOwn(p,'bandWidth'),oldQuantity=!Object.hasOwn(p,'sessions');
  const migrated=oldWidth||oldQuantity;
  if (!oldWidth && typeof p.bandWidth!=='number') return null;
  if (!oldQuantity && typeof p.sessions!=='number') return null;
  const bands: Band[]=[];
  const widths:number[]=[];
  const quantities:number[]=[];
  for(const b of p.bands){
    if(!b||typeof b!=='object'||typeof b.id!=='string'||typeof b.name!=='string'||typeof b.length!=='number'||!['both','left','right'].includes(b.side))return null;
    if(oldWidth&&typeof b.width!=='number')return null;
    if(oldQuantity&&typeof b.quantity!=='number')return null;
    if(oldWidth)widths.push(b.width);
    if(oldQuantity)quantities.push(b.quantity);
    bands.push({id:b.id,name:b.name,length:b.length,side:b.side});
  }
  if(new Set(bands.map(b=>b.id)).size!==bands.length)return null;
  const mixedQuantities=new Set(quantities).size>1;
  return {protocol:{roll:p.roll as number,boardLength:p.boardLength as number,boardWidth:p.boardWidth as number,bandWidth:oldWidth?(widths[0]??Math.min(2.5,p.roll as number)):p.bandWidth as number,sessions:oldQuantity?(mixedQuantities?1:quantities[0]??1):p.sessions as number,bands},migrated,mixedWidths:new Set(widths).size>1,mixedQuantities};
}
