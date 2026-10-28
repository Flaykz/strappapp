export type Band = { id: string; name: string; length: number; quantity: number; side: 'both' | 'left' | 'right' };
export type Protocol = { bands: Band[]; roll: number; bandWidth: number; boardLength: number; boardWidth: number };
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
  p.bands.forEach((b,i)=>{
    if (!b.name.trim()) errors.push(`La bande ${i+1} doit avoir un nom.`);
    if (!Number.isFinite(b.length)||b.length<=0||b.length>10000) errors.push(`${b.name} : longueur non valide.`);
    if (Number.isFinite(b.length) && !Number.isInteger(b.length)) errors.push(`${b.name} : la longueur doit être un nombre entier de centimètres.`);
    if (!Number.isInteger(b.quantity)||b.quantity<1||b.quantity>100) errors.push(`${b.name} : quantité attendue entre 1 et 100 par côté.`);
    if (b.length>p.boardLength) errors.push(`${b.name} : longueur supérieure à la plaque. Ce MVP ne gère pas les découpes en plusieurs avancées.`);
  });
  return errors;
}
export function plan(p: Protocol) {
  const errors = validate(p);
  if (errors.length) return {errors,strips:[] as Strip[],pages:[] as Placement[][],pageCuts:[] as Cut[][],cuts:0,total:0,waste:0,travel:0};
  const pieces:Piece[] = p.bands.flatMap((b,index)=>(b.side==='both'?['G','D']:[b.side==='left'?'G':'D']).flatMap(side=>Array.from({length:b.quantity},(_,n)=>({key:`${b.id}-${side}-${n}`,name:b.name,length:b.length,width:p.bandWidth,side,index}))));
  pieces.sort((a,b)=>b.length-a.length||b.width-a.width);
  const shortStrips:Strip[]=[];
  for (const piece of pieces) {
    let strip=shortStrips.find(s=>s.length===piece.length&&s.used+piece.width<=p.roll+1e-8);
    if (!strip) {strip={length:piece.length,used:0,pieces:[]};shortStrips.push(strip);}
    strip.pieces.push(piece);strip.used+=piece.width;
  }
  // Compare several row groupings and placements using actual shared cuts.
  // Join rows with identical width boundaries: one continuous longitudinal cut
  // can then split several lengths. Never exceed the usable board length.
  const signature=(s:Strip)=>rowsOf(s)[0].pieces.map(piece=>piece.width).join('|');
  function grouped(order:Strip[],mode:number){
  const strips:Strip[]=[];
  for (const row of order) {
    const candidates=strips.filter(s=>signature(s)===signature(row)&&s.length+row.length<=p.boardLength+1e-8);
    candidates.sort((a,b)=>mode===1?a.length-b.length:b.length-a.length);
    const target=mode===2?undefined:candidates[0];
    if(target){target.rows!.push(row);target.length+=row.length;target.pieces.push(...row.pieces);}
    else strips.push({length:row.length,used:row.used,pieces:[...row.pieces],rows:[row]});
  }
  return strips;
  }
  function placed(strips:Strip[],shelf:boolean){
  // Fill each column from its own bottom edge, rather than leaving shelf gaps.
  const pages:{strip:Strip;x:number;y:number}[][]=[];
  const heights:number[][]=[];
  const columns=Math.floor((p.boardWidth+1e-8)/p.roll);
  let shelfX=0,shelfY=0,shelfHeight=0;
  for(const strip of strips){
    if(shelf){
      if(!pages.length)pages.push([]);
      if(shelfX+p.roll>p.boardWidth+eps){shelfX=0;shelfY+=shelfHeight;shelfHeight=0;}
      if(shelfY+strip.length>p.boardLength+eps){pages.push([]);shelfX=0;shelfY=0;shelfHeight=0;}
      pages.at(-1)!.push({strip,x:shelfX,y:shelfY});shelfX+=p.roll;shelfHeight=Math.max(shelfHeight,strip.length);continue;
    }
    let bestPage=-1,bestColumn=-1,bestRemaining=Infinity;
    heights.forEach((page,pi)=>page.forEach((height,ci)=>{
      const remaining=p.boardLength-height-strip.length;
      if(remaining>=-1e-8&&remaining<bestRemaining){bestPage=pi;bestColumn=ci;bestRemaining=remaining;}
    }));
    if(bestPage<0){bestPage=pages.length;bestColumn=0;pages.push([]);heights.push(Array(columns).fill(0));}
    pages[bestPage].push({strip,x:bestColumn*p.roll,y:heights[bestPage][bestColumn]});
    heights[bestPage][bestColumn]+=strip.length;
  }
  return pages;
  }
  const candidates=[];
  const orders=[shortStrips,[...shortStrips].reverse(),[...shortStrips].sort((a,b)=>signature(a).localeCompare(signature(b))||b.length-a.length)];
  // Bound the interactive search for unusually large imports.
  for(const order of shortStrips.length>300?orders.slice(0,1):orders)for(const mode of [0,1,2]){
    const strips=grouped(order,mode);
    for(const sorted of [strips,[...strips].sort((a,b)=>b.length-a.length)])for(const shelf of [false,true]){
      const originalPages=placed(sorted,shelf);
      for(const pages of [originalPages,originalPages.map(page=>alignOffsets(page,p.roll,p.boardLength))]){
      const pageCuts=pages.map(page=>cutsFor(page,p.roll));
      const cuts=strips.length+pageCuts.reduce((n,c)=>n+c.length,0);
      const travel=pageCuts.reduce((n,c)=>n+travelFor(c),0);
      candidates.push({strips,pages,pageCuts,cuts,travel});
      }
    }
  }
  candidates.sort((a,b)=>a.cuts-b.cuts||a.pages.length-b.pages.length||a.strips.length-b.strips.length||a.travel-b.travel);
  const {strips,pages,pageCuts,cuts,travel}=candidates[0];
  const total=strips.reduce((n,s)=>n+s.length,0);
  const waste=strips.reduce((n,s)=>n+(p.roll-s.used)*s.length,0);
  return {errors,strips,pages,pageCuts,cuts,total,waste,travel};
}
