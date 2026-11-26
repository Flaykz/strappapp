import { cutsFor, type Placement, type Cut } from './planner';
import { toView } from './boardView';

export const colors=['#b9dccc','#f5d59b','#c5d5ed','#e6c4d8','#d5d9a4','#c1dfe5'];
const fmt=(n:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(n);
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6;
const accent='#79351e';

/** Ruler along one edge: tick every cm, longer every 5 cm, numbers every 10 cm. */
function Ruler({size,top,fs}:{size:number;top:boolean;fs:number}){
 const ticks=[];
 for(let cm=0;cm<=Math.floor(size+1e-8);cm++){
  const len=cm%5===0?fs*0.7:fs*0.35,major=cm%5===0;
  const a=top?{x1:cm,y1:-len,x2:cm,y2:0}:{x1:-len,y1:cm,x2:0,y2:cm};
  ticks.push(<line {...a} stroke="#6b7d72" stroke-width={major?fs*0.07:fs*0.04}/>);
  if(cm%10===0)ticks.push(top?<text x={cm} y={-fs*0.95} text-anchor="middle" font-size={fs*0.75} fill="#4a6256">{cm}</text>:<text x={-fs*0.95} y={cm} text-anchor="end" dominant-baseline="central" font-size={fs*0.75} fill="#4a6256">{cm}</text>);
 }
 return <g>{ticks}</g>;
}

export function BoardPlan({page,pageIndex,roll,boardLength,boardWidth,swapped}:{page:Placement[];pageIndex:number;roll:number;boardLength:number;boardWidth:number;swapped:boolean}){
 const viewW=swapped?boardWidth:boardLength,viewH=swapped?boardLength:boardWidth;
 const fs=Math.max(0.7,Math.max(viewW,viewH)/50);
 const marginTop=fs*3.6,marginLeft=fs*5.2;
 const cuts=cutsFor(page,roll);
 // Vertical-in-plan cuts (axis V) measure x; their cotes are listed once per distinct value.
 const lineOf=(cut:Cut)=>page.find(({y})=>cut.axis==='V'&&near(y,cut.from));
 const xValues=cuts.filter(c=>c.axis==='V').map(c=>c.fixed);
 const sharedX=new Set(xValues.filter(v=>xValues.filter(w=>near(v,w)).length>1).map(v=>Math.round(v*1000)));
 const yValues=[...page.flatMap(({y})=>[y,y+roll]),...cuts.filter(c=>c.axis==='H').map(c=>c.fixed)];
 const distinct=(values:number[])=>values.filter((v,i)=>values.findIndex(w=>near(v,w))===i);
 const halo={stroke:'#fffefb','stroke-width':fs*0.22,'paint-order':'stroke'};
 const pt=(x:number,y:number)=>toView(x,y,swapped);
 const rect=(x:number,y:number,w:number,h:number)=>{const a=pt(x,y),b=pt(x+w,y+h);return {x:Math.min(a.u,b.u),y:Math.min(a.v,b.v),width:Math.abs(b.u-a.u),height:Math.abs(b.v-a.v)};};
 // In the plan, x cotes sit on the edge running along x; y cotes on the other edge.
 const xEdgeIsTop=!swapped;
 const edgeCote=(value:number,alongX:boolean,color:string)=>{
  const onTop=alongX===xEdgeIsTop;
  const {u,v}=pt(alongX?value:0,alongX?0:value);
  return onTop
   ?<g><line x1={u} y1={-fs*1.6} x2={u} y2={0} stroke={color} stroke-width={fs*0.06}/><text x={u} y={-fs*2.1} text-anchor="middle" font-size={fs*0.85} font-weight="700" fill={color}>{fmt(value)}</text></g>
   :<g><line x1={-fs*2.4} y1={v} x2={0} y2={v} stroke={color} stroke-width={fs*0.06}/><text x={-fs*2.6} y={v} text-anchor="end" dominant-baseline="central" font-size={fs*0.85} font-weight="700" fill={color}>{fmt(value)}</text></g>;
 };
 return <svg viewBox={`${-marginLeft} ${-marginTop} ${viewW+marginLeft+fs} ${viewH+marginTop+fs}`} role="img" aria-label={`Plan de découpe, passage ${pageIndex+1}`}>
  <rect width={viewW} height={viewH} fill="#edf1ec" stroke="#becac0" stroke-width={fs*0.08}/>
  <Ruler size={viewW} top fs={fs}/><Ruler size={viewH} top={false} fs={fs}/>
  {page.map(({strip,x,y})=><g>
   <rect {...rect(x,y,strip.length,roll)} fill="#e3e0d8" stroke="#74867b" stroke-width={fs*0.06}/>
   {strip.segments.map(seg=>seg.pieces.map((piece,lane)=>{
    const r=rect(x+seg.x,y+lane*piece.width,seg.length,piece.width);
    const text=`${piece.name} · ${piece.side}`,room=Math.min(r.width-fs*0.3,r.height);
    const size=Math.min(fs*0.8,r.height*0.5,(Math.max(r.width,r.height)-fs*0.4)/(text.length*0.58));
    return <g><rect {...r} fill={colors[piece.index%colors.length]} stroke="white" stroke-width={fs*0.08}/>{room>0&&size>=fs*0.3&&<text x={r.x+r.width/2} y={r.y+r.height/2} text-anchor="middle" dominant-baseline="central" font-size={size} fill="#243b30">{text}</text>}</g>;
   }))}
  </g>)}
  {cuts.map(cut=>{const horizontal=cut.axis==='H';const a=pt(horizontal?cut.from:cut.fixed,horizontal?cut.fixed:cut.from),b=pt(horizontal?cut.to:cut.fixed,horizontal?cut.fixed:cut.to);return <line x1={a.u} y1={a.v} x2={b.u} y2={b.v} stroke={accent} stroke-width={fs*0.09} stroke-dasharray={`${fs*0.35} ${fs*0.2}`}/>;})}
  {cuts.filter(c=>c.axis==='V'&&!sharedX.has(Math.round(c.fixed*1000))).map(cut=>{
   const line=lineOf(cut),top=pt(cut.fixed,cut.from);
   if(!line)return null;
   return swapped
    ?<text x={top.u+fs*0.2} y={top.v-fs*0.2} font-size={fs*0.75} font-weight="700" fill={accent} {...halo}>{fmt(cut.fixed)}</text>
    :<text x={top.u-fs*0.2} y={top.v+fs*0.85} text-anchor="end" font-size={fs*0.75} font-weight="700" fill={accent} {...halo}>{fmt(cut.fixed)}</text>;
  })}
  {distinct(xValues.filter(v=>sharedX.has(Math.round(v*1000)))).map(v=>edgeCote(v,true,accent))}
  {distinct(yValues).map(v=>edgeCote(v,false,'#2f5b49'))}
 </svg>;
}
