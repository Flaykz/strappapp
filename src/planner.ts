export type Band = { id: string; name: string; length: number; side: 'both' | 'left' | 'right' };
export type Protocol = { bands: Band[]; sessions: number; roll: number; bandWidth: number; boardLength: number; boardWidth: number };
export type Piece = { key: string; name: string; length: number; width: number; side: string; index: number };
export type Strip = { length: number; used: number; pieces: Piece[]; rows?: Strip[] };
export type Placement = { strip: Strip; x: number; y: number };
export type Cut = { axis: 'H' | 'V'; fixed: number; from: number; to: number; reverse?: boolean };
const eps = 1e-8;
// Merge only touching/overlapping edges. Never bridge a gap or cross a band.
export function cutsFor(page: Placement[], roll: number): Cut[] {
  const raw: Cut[]=[];
  for(const {strip,x,y} of page){
    for(const at of boundariesOf(strip,roll)) raw.push({axis:'V',fixed:x+at,from:y,to:y+strip.length});
    let height=y;
    for(const row of rowsOf(strip).slice(0,-1)){height+=row.length;raw.push({axis:'H',fixed:height,from:x,to:x+roll});}
  }
  raw.sort((a,b)=>a.axis.localeCompare(b.axis)||a.fixed-b.fixed||a.from-b.from);
  const merged:Cut[]=[];
  for(const cut of raw){const last=merged.at(-1);if(last&&last.axis===cut.axis&&Math.abs(last.fixed-cut.fixed)<eps&&cut.from<=last.to+eps)last.to=Math.max(last.to,cut.to);else merged.push({...cut});}
  // Keep each orientation together; choose the nearest available endpoint.
  const route=(first:'H'|'V')=>{
    const ordered:Cut[]=[];let x=0,y=0,travel=0;
    for(const axis of [first,first==='H'?'V':'H']){
      const pending=merged.filter(c=>c.axis===axis);
      while(pending.length){let best=0,reverse=false,distance=Infinity;
        pending.forEach((c,i)=>{for(const rev of [false,true]){const pos=rev?c.to:c.from;const d=Math.hypot((c.axis==='H'?pos:c.fixed)-x,(c.axis==='H'?c.fixed:pos)-y);if(d<distance){best=i;reverse=rev;distance=d;}}});
        const c={...pending.splice(best,1)[0],reverse};ordered.push(c);travel+=distance;
        const end=reverse?c.from:c.to;x=c.axis==='H'?end:c.fixed;y=c.axis==='H'?c.fixed:end;
      }
    }return {ordered,travel};
  };
  const h=route('H'),v=route('V');return h.travel<v.travel?h.ordered:v.ordered;
}
function travelFor(cuts:Cut[]):number{let x=0,y=0,total=0;for(const c of cuts){const start=c.reverse?c.to:c.from,end=c.reverse?c.from:c.to;total+=Math.hypot((c.axis==='H'?start:c.fixed)-x,(c.axis==='H'?c.fixed:start)-y);x=c.axis==='H'?end:c.fixed;y=c.axis==='H'?c.fixed:end;}return total;}
/** Shift entire columns, preserving each strip and its uninterrupted row sequence.
 * Dynamic programming maximizes shared horizontal edges between neighbors.
 * Offsets are whole cm; for very large boards the search range is bounded.
 */
export function alignOffsets(page: Placement[], roll: number, boardLength: number): Placement[] {
  if(page.length<2||page.length>300)return page;
  const xs=[...new Set(page.map(item=>item.x))].sort((a,b)=>a-b);
  if(xs.length>64)return page;
  const columns=xs.map(x=>{
    const items=page.filter(item=>item.x===x);
    const top=Math.min(...items.map(item=>item.y));
    const span=Math.max(...items.map(item=>item.y+item.strip.length))-top;
    const max=Math.max(0,Math.floor(boardLength-span+eps));
    const offsets=[...new Set([...Array.from({length:Math.min(max,256)+1},(_,i)=>i),max,top])].sort((a,b)=>a-b);
    const boundaries:number[]=[];
    for(const item of items){let at=item.y-top;for(const row of rowsOf(item.strip).slice(0,-1)){at+=row.length;boundaries.push(at);}}
    return {x,items,top,offsets,boundaries};
  });
  let scores=columns[0].offsets.map(offset=>({shared:0,shift:offset}));
  const parents:number[][]=[[]];
  for(let ci=1;ci<columns.length;ci++){
    const left=columns[ci-1],right=columns[ci];
    const rewards=new Map<number,number>();
    if(Math.abs(right.x-left.x-roll)<eps)for(const a of left.boundaries)for(const b of right.boundaries){const delta=a-b;rewards.set(delta,(rewards.get(delta)??0)+1);}
    const links:number[]=[];
    const next=right.offsets.map(offset=>{
      let best={shared:-1,shift:Infinity},parent=0;
      left.offsets.forEach((prior,i)=>{
        const shared=scores[i].shared+(rewards.get(offset-prior)??0),shift=scores[i].shift+offset;
        if(shared>best.shared||(shared===best.shared&&shift<best.shift)){best={shared,shift};parent=i;}
      });links.push(parent);return best;
    });parents.push(links);scores=next;
  }
  let index=0;scores.forEach((score,i)=>{if(score.shared>scores[index].shared||(score.shared===scores[index].shared&&score.shift<scores[index].shift))index=i;});
  const shifts:number[]=[];
  for(let ci=columns.length-1;ci>=0;ci--){shifts[ci]=columns[ci].offsets[index]-columns[ci].top;index=parents[ci][index];}
  return page.map(item=>({...item,y:item.y+shifts[xs.indexOf(item.x)]}));
}
export function rowsOf(strip: Strip): Strip[] { return strip.rows ?? [strip]; }
export function boundariesOf(strip: Strip, roll: number): number[] {
  let offset = 0;
  return rowsOf(strip)[0].pieces.map(piece => offset += piece.width).filter(x => x < roll - 1e-8);
}
export function validate(p: Protocol): string[] {
  const errors: string[] = [];
  if (![p.roll,p.boardLength,p.boardWidth].every(n=>Number.isFinite(n)&&n>0&&n<=10000)) errors.push('Les dimensions du matériel doivent être positives et inférieures ou égales à 10 000 cm.');
  if (p.roll > p.boardWidth) errors.push('La largeur du rouleau dépasse la largeur utile de la plaque. Inverse les dimensions de la plaque si nécessaire.');
  if (!Number.isFinite(p.bandWidth)||p.bandWidth<=0||p.bandWidth>10000) errors.push('La largeur commune des bandes doit être positive et inférieure ou égale à 10 000 cm.');
  if (p.bandWidth>p.roll) errors.push('La largeur commune des bandes dépasse celle du rouleau.');
  if (!p.bands.length) errors.push('Ajoute au moins une bande.');
  if (!Number.isInteger(p.sessions)||p.sessions<1||p.sessions>100) errors.push('Le nombre de séances doit être un entier entre 1 et 100.');
  p.bands.forEach((b,i)=>{
    if (!b.name.trim()) errors.push(`La bande ${i+1} doit avoir un nom.`);
    if (!Number.isFinite(b.length)||b.length<=0||b.length>10000) errors.push(`${b.name} : longueur non valide.`);
    if (Number.isFinite(b.length) && !Number.isInteger(b.length)) errors.push(`${b.name} : la longueur doit être un nombre entier de centimètres.`);
    if (b.length>p.boardLength) errors.push(`${b.name} : longueur supérieure à la plaque. Ce MVP ne gère pas les découpes en plusieurs avancées.`);
  });
  return errors;
}
export function plan(p: Protocol) {
  const errors = validate(p);
  if (errors.length) return {errors,strips:[] as Strip[],pages:[] as Placement[][],pageCuts:[] as Cut[][],cuts:0,total:0,waste:0,travel:0};
  // Follow the same session, band and side order as the winding guide.
  const pieces:Piece[] = Array.from({length:p.sessions},(_,copy)=>p.bands.flatMap((b,index)=>
    (b.side==='both'?['G','D']:[b.side==='left'?'G':'D']).map(side=>({key:`${b.id}-${side}-${copy}`,name:b.name,length:b.length,width:p.bandWidth,side,index})))).flat();
  const strips:Strip[]=[];
  for(const piece of pieces){
    const last=strips.at(-1);
    if(last && last.length===piece.length && last.used+piece.width<=p.roll+eps){last.pieces.push(piece);last.used+=piece.width;}
    else strips.push({length:piece.length,used:piece.width,pieces:[piece]});
  }
  // Fill a single board in winding order. Leave 1 cm between rows in a column.
  // Once a page is full, later pieces are never moved back to an earlier page.
  const pages:Placement[][]=[];
  let column=0, y=0;
  const columns=Math.floor((p.boardWidth+eps)/p.roll);
  for(const strip of strips){
    if(!pages.length)pages.push([]);
    if(y+strip.length>p.boardLength+eps){column++;y=0;}
    if(column>=columns){pages.push([]);column=0;y=0;}
    pages.at(-1)!.push({strip,x:column*p.roll,y});
    y+=strip.length+1;
  }
  const pageCuts=pages.map(page=>cutsFor(page,p.roll));
  const cuts=strips.length+pageCuts.reduce((n,c)=>n+c.length,0);
  const travel=pageCuts.reduce((n,c)=>n+travelFor(c),0);
  const total=strips.reduce((n,s)=>n+s.length,0);
  const waste=strips.reduce((n,s)=>n+(p.roll-s.used)*s.length,0);
  return {errors,strips,pages,pageCuts,cuts,total,waste,travel};
}
