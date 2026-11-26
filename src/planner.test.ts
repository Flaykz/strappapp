import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toView } from './boardView.ts';
import { decodeProtocol } from './protocol.ts';
import { plan, cutsFor, type Protocol, type Placement } from './planner.ts';
import { allocateStock, consumptionOf, sessionsAvailableUpToFour, type Stock } from './stock.ts';
const example:Protocol={sessions:1,roll:5,bandWidth:2.5,boardLength:43,boardWidth:23,bands:[5,7,9].map((length,i)=>({id:String(i),name:`A${i+1}`,length,side:'both'}))};
test('current and legacy protocols preserve bands with a single global width',()=>{
 assert.deepEqual(decodeProtocol(JSON.parse(JSON.stringify(example)))?.protocol,example);
 const {bandWidth,sessions,...legacy}=example;
 const old={...legacy,bands:legacy.bands.map(b=>({...b,width:bandWidth,quantity:sessions}))};
 const migrated=decodeProtocol(old)!;
 assert.equal(migrated.migrated,true);assert.equal(migrated.mixedWidths,false);assert.deepEqual(migrated.protocol,example);
 old.bands[1].width=5;
 const mixed=decodeProtocol(old)!;
 assert.equal(mixed.mixedWidths,true);assert.equal(mixed.protocol.bandWidth,2.5);
 assert.ok(mixed.protocol.bands.every(b=>!('width' in b)));
 assert.equal(old.bands[1].width,5);
 assert.equal(decodeProtocol({...example,bandWidth:'bad'}),null);
});
test('global sessions multiply the entire protocol and validate the count',()=>{
 const p=plan({...example,sessions:2});
 assert.equal(p.strips.flatMap(s=>s.pieces).length,12);
 assert.equal(p.total,42);
 for(const band of example.bands)for(const side of ['G','D'])assert.equal(p.strips.flatMap(s=>s.pieces).filter(piece=>piece.name===band.name&&piece.side===side).length,2);
 for(const sessions of [0,-1,1.5,101,NaN])assert.ok(plan({...example,sessions}).errors.length);
});
test('legacy quantities become a global count with a warning when inconsistent',()=>{
 const {sessions,...old}=example;
 const same=decodeProtocol({...old,bands:old.bands.map(b=>({...b,quantity:2}))})!;
 assert.equal(same.protocol.sessions,2);assert.equal(same.mixedQuantities,false);
 const mixed=decodeProtocol({...old,bands:old.bands.map((b,i)=>({...b,quantity:i+1}))})!;
 assert.equal(mixed.protocol.sessions,1);assert.equal(mixed.mixedQuantities,true);
 assert.ok(mixed.protocol.bands.every(b=>!('quantity' in b)));
 assert.equal(decodeProtocol({...example,sessions:'two'}),null);
 assert.deepEqual(decodeProtocol(JSON.parse(JSON.stringify(same.protocol)))!.protocol,same.protocol);
});
const ids=(strip:Placement['strip'])=>strip.segments.map(seg=>seg.pieces.map(piece=>`${piece.name}${piece.side}`));
const spec:Protocol={sessions:1,roll:5,bandWidth:2.5,boardLength:45,boardWidth:23,bands:[20,15,8,25,12].map((length,i)=>({id:String(i+1),name:String(i+1),length,side:'both'}))};
test('segments are laid end to end, left to right, then on a new line below',()=>{
 const p=plan(spec);
 assert.deepEqual(p.errors,[]);
 assert.equal(p.pages.length,1);
 assert.equal(p.strips.length,2);
 assert.deepEqual(p.pages[0].map(({x,y})=>[x,y]),[[0,0],[0,6]]);
 assert.deepEqual(p.strips[0].segments.map(s=>[s.x,s.length]),[[0,20],[20,15],[35,8]]);
 assert.deepEqual(p.strips[1].segments.map(s=>[s.x,s.length]),[[0,25],[25,12]]);
 // G above D, in protocol order.
 assert.deepEqual(ids(p.strips[0]),[['1G','1D'],['2G','2D'],['3G','3D']]);
 assert.deepEqual(ids(p.strips[1]),[['4G','4D'],['5G','5D']]);
 assert.deepEqual(p.strips.map(s=>s.length),[43,37]);
 assert.equal(p.total,80);assert.equal(p.waste,0);
});
test('cuts: horizontal between lanes, then vertical at segment ends, line by line',()=>{
 const p=plan(spec);
 assert.deepEqual(p.pageCuts[0],[
  {axis:'H',fixed:2.5,from:0,to:43},{axis:'V',fixed:20,from:0,to:5},{axis:'V',fixed:35,from:0,to:5},{axis:'V',fixed:43,from:0,to:5},
  {axis:'H',fixed:8.5,from:0,to:37},{axis:'V',fixed:25,from:6,to:11},{axis:'V',fixed:37,from:6,to:11},
 ]);
 assert.equal(p.cuts,7);
 assert.deepEqual(cutsFor(p.pages[0],5),p.pageCuts[0]);
});
test('cuts: the last stacked band is separated from the roll-width waste',()=>{
 const one=plan({...spec,roll:5,bandWidth:2.5,sessions:1,bands:[{id:'a',name:'A',length:5,side:'left'}]});
 assert.deepEqual(one.pageCuts[0],[{axis:'H',fixed:2.5,from:0,to:5},{axis:'V',fixed:5,from:0,to:5}]);
 assert.equal(one.cuts,2);
 const both=plan({...spec,roll:5,bandWidth:2,sessions:1,bands:[{id:'a',name:'A',length:5,side:'both'}]});
 assert.deepEqual(both.pageCuts[0],[{axis:'H',fixed:2,from:0,to:5},{axis:'H',fixed:4,from:0,to:5},{axis:'V',fixed:5,from:0,to:5}]);
 assert.equal(both.cuts,3);
});
test('a band wider than half the roll stays single-lane; extra pieces overflow to the next segment',()=>{
 const single=plan({...spec,bandWidth:3,bands:[{id:'a',name:'A',length:10,side:'both'}]});
 assert.deepEqual(single.strips[0].segments.map(s=>s.pieces.length),[1,1]);
 assert.equal(single.strips[0].length,20);
 assert.equal(single.waste,2*(5-3)*10);
 const three=plan({...spec,roll:6,bandWidth:2,boardWidth:23,bands:[{id:'a',name:'A',length:10,side:'both'}],sessions:1});
 assert.deepEqual(three.strips[0].segments.map(s=>s.pieces.length),[2]);
 assert.equal(three.waste,2*10);
 const narrow=plan({...spec,roll:4,bandWidth:1,bands:[{id:'a',name:'A',length:10,side:'both'}],sessions:3});
 assert.deepEqual(narrow.strips[0].segments.map(s=>s.pieces.length),[4,2]);
});
test('no reordering: a short segment never goes back to fill an earlier line',()=>{
 const p=plan({...spec,boardLength:30,bands:[25,10,3].map((length,i)=>({id:String(i),name:`B${i}`,length,side:'both' as const}))});
 assert.deepEqual(p.strips.map(s=>s.segments.map(g=>g.length)),[[25],[10,3]]);
});
test('lines never overflow the board and pages restart at the top',()=>{
 const input:Protocol={...spec,boardLength:20,boardWidth:12,bands:[{id:'a',name:'A',length:20,side:'both'}],sessions:3};
 const p=plan(input);
 assert.equal(p.strips.length,3);
 assert.equal(p.pages.length,2);
 assert.deepEqual(p.pages.map(page=>page.map(({y})=>y)),[[0,6],[0]]);
 for(const page of p.pages)for(const {strip,y} of page){assert.ok(strip.length<=input.boardLength);assert.ok(y+input.roll<=input.boardWidth);}
 assert.equal(p.pages.flatMap(page=>page.flatMap(({strip})=>strip.pieces)).length,6);
});
test('invalid dimensions and oversized bands are rejected',()=>{
 for(const patch of [{length:46},{length:0}])assert.ok(plan({...spec,bands:[{...spec.bands[0],...patch}]}).errors.length);
 assert.ok(plan({...spec,boardWidth:4}).errors.length);
});
test('changing global width applies to every generated piece and rejects oversized widths',()=>{
 for(const bandWidth of [2,2.5,5]){const p=plan({...spec,bandWidth});assert.equal(p.errors.length,0);assert.ok(p.strips.flatMap(s=>s.pieces).every(piece=>piece.width===bandWidth));assert.equal(p.strips.flatMap(s=>s.pieces).length,10);}
 for(const bandWidth of [0,-1,6,NaN])assert.ok(plan({...spec,bandWidth}).errors.length);
});
test('view swap exchanges the axes and never moves the origin',()=>{
 assert.deepEqual(toView(5,1,false),{u:5,v:1});
 assert.deepEqual(toView(5,1,true),{u:1,v:5});
 assert.deepEqual(toView(0,0,true),{u:0,v:0});
});
const stock:Stock={types:[{id:'t',name:'T',width:5,length:1000}],selectedTypeId:'t',rolls:[{id:'r1',typeId:'t',name:'R1',remaining:50},{id:'r2',typeId:'t',name:'R2',remaining:40}]};
test('stock consumption is computed per pass from the lines of that pass',()=>{
 const p=plan(spec);
 const first=consumptionOf([p.strips[0]],stock);
 assert.deepEqual(first.consumed,[{rollId:'r1',rollName:'R1',length:43}]);
 assert.deepEqual(first.missing,[]);
 const after:Stock={...stock,rolls:stock.rolls.map(r=>first.rolls.find(x=>x.id===r.id)??r)};
 const second=consumptionOf([p.strips[1]],after);
 assert.deepEqual(second.consumed,[{rollId:'r2',rollName:'R2',length:37}]);
 assert.equal(allocateStock(p.strips,stock).missing.length,0);
 assert.equal(consumptionOf(p.strips,{...stock,rolls:[{...stock.rolls[0],remaining:40}]}).missing.length,1);
});
test('available sessions use the real multi-session plan, which stacks identical pieces across sessions',()=>{
 const protocol:Protocol={...example,roll:4,bandWidth:1,boardLength:100,boardWidth:10,bands:[{id:'a',name:'A',length:10,side:'both'}]};
 assert.deepEqual(plan({...protocol,sessions:3}).strips.map(s=>s.length),[20]);
 const mk=(remaining:number):Stock=>({types:[{id:'t',name:'T',width:4,length:1000}],selectedTypeId:"t",rolls:[{id:"r",typeId:"t",name:"R",remaining}]});
 const linesFor=(n:number)=>{const r=plan({...protocol,sessions:n});return r.errors.length?null:r.strips;};
 assert.equal(sessionsAvailableUpToFour(linesFor,mk(10)),2);
 assert.equal(sessionsAvailableUpToFour(linesFor,mk(19)),2);
 assert.equal(sessionsAvailableUpToFour(linesFor,mk(5)),0);
 assert.equal(sessionsAvailableUpToFour(linesFor,mk(20)),4);
});
test('fullWidth + both: two roll-wide pieces laid end to end, no horizontal cut, waste unchanged by them',()=>{
 const p:Protocol={...example,bands:[{id:'f',name:'F',length:5,side:'both',fullWidth:true}]};
 const r=plan(p);
 assert.deepEqual(r.errors,[]);
 const segs=r.strips.flatMap(s=>s.segments);
 assert.equal(segs.length,2);
 assert.deepEqual(segs.map(s=>[s.x,s.pieces.length,s.pieces[0].width,s.pieces[0].side]),[[0,1,5,'G'],[5,1,5,'D']]);
 assert.equal(r.total,10);assert.equal(r.waste,0);
 assert.ok(r.pageCuts.flat().every(c=>c.axis==='V'));
});
test('mixed protocol: normal bands stay stacked, full-width band stands alone',()=>{
 const p:Protocol={...example,boardLength:100,bands:[{id:'a',name:'A',length:5,side:'both'},{id:'f',name:'F',length:4,side:'both',fullWidth:true},{id:'b',name:'B',length:3,side:'both'}]};
 const r=plan(p);
 const segs=r.strips.flatMap(s=>s.segments);
 assert.deepEqual(segs.map(s=>[s.pieces.length,s.pieces[0].width]),[[2,2.5],[1,5],[1,5],[2,2.5]]);
 assert.equal(r.total,5+4+4+3);assert.equal(r.waste,0);
 assert.equal(r.pageCuts.flat().filter(c=>c.axis==='H').length,2);
});
test('fullWidth + left gives a single roll-wide piece',()=>{
 const r=plan({...example,bands:[{id:'f',name:'F',length:6,side:'left',fullWidth:true}]});
 const pieces=r.strips.flatMap(s=>s.pieces);
 assert.deepEqual(pieces.map(x=>[x.side,x.width]),[['G',5]]);
 assert.equal(r.total,6);assert.equal(r.waste,0);
});
test('fullWidth is kept on decode, absent otherwise',()=>{
 const p:Protocol={...example,bands:[{...example.bands[0],fullWidth:true},example.bands[1]]};
 const d=decodeProtocol(JSON.parse(JSON.stringify(p)))!.protocol;
 assert.equal(d.bands[0].fullWidth,true);
 assert.ok(!('fullWidth' in d.bands[1]));
 assert.ok(!('fullWidth' in decodeProtocol({...p,bands:[{...p.bands[0],fullWidth:'yes'}]})!.protocol.bands[0]));
});
const stackSpec={...example,boardLength:100,bands:[] as Protocol['bands']};
const mk=(id:string,length:number,side:'both'|'left'|'right')=>({id,name:id.toUpperCase(),length,side});
const layout=(bands:Protocol['bands'])=>plan({...stackSpec,bands}).strips.flatMap(s=>s.segments.map(g=>g.pieces.map(x=>`${x.name}·${x.side}`)));
test('left + right bands of equal length are stacked',()=>{
 const r=plan({...stackSpec,bands:[mk('a',20,'left'),mk('b',20,'right')]});
 assert.deepEqual(layout([mk('a',20,'left'),mk('b',20,'right')]),[['A·G','B·D']]);
 assert.equal(r.total,20);
 assert.deepEqual(r.pageCuts[0].filter(c=>c.axis==='H').map(c=>[c.fixed,c.from,c.to]),[[2.5,0,20]]);
 assert.equal(r.pageCuts[0].filter(c=>c.axis==='V').length,1);
 assert.equal(r.waste,0);
});
test('both + both is unchanged',()=>{
 assert.deepEqual(layout([mk('a',20,'both'),mk('b',20,'both')]),[['A·G','A·D'],['B·G','B·D']]);
});
test('left then both stacks greedily',()=>{
 assert.deepEqual(layout([mk('a',20,'left'),mk('b',20,'both')]),[['A·G','B·G'],['B·D']]);
});
test('different lengths are not stacked',()=>{
 assert.deepEqual(layout([mk('a',20,'left'),mk('b',25,'right')]),[['A·G'],['B·D']]);
});
test('full width pieces never stack',()=>{
 const f=(id:string)=>({...mk(id,20,'left'),fullWidth:true});
 assert.deepEqual(layout([f('a'),f('b')]),[['A·G'],['B·G']]);
});
