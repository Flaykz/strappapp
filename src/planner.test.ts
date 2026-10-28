import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeProtocol } from './protocol.ts';
import { plan, cutsFor, alignOffsets, type Protocol, type Strip } from './planner.ts';
const example:Protocol={roll:5,bandWidth:2.5,boardLength:43,boardWidth:23,bands:[5,7,9].map((length,i)=>({id:String(i),name:`A${i+1}`,length,quantity:1,side:'both'}))};
test('current and legacy protocols preserve bands with a single global width',()=>{
 assert.deepEqual(decodeProtocol(JSON.parse(JSON.stringify(example)))?.protocol,example);
 const {bandWidth,...legacy}=example;
 const old={...legacy,bands:legacy.bands.map(b=>({...b,width:bandWidth}))};
 const migrated=decodeProtocol(old)!;
 assert.equal(migrated.migrated,true);assert.equal(migrated.mixedWidths,false);assert.deepEqual(migrated.protocol,example);
 old.bands[1].width=5;
 const mixed=decodeProtocol(old)!;
 assert.equal(mixed.mixedWidths,true);assert.equal(mixed.protocol.bandWidth,2.5);
 assert.ok(mixed.protocol.bands.every(b=>!('width' in b)));
 assert.equal(old.bands[1].width,5);
 assert.equal(decodeProtocol({...example,bandWidth:'bad'}),null);
});
function series(lengths:number[],id:string):Strip{
 const rows=lengths.map((length,i)=>({length,used:5,pieces:[{key:`${id}-${i}`,name:id,length,width:5,side:'G',index:0}]}));
 return {length:lengths.reduce((n,l)=>n+l,0),used:5,rows,pieces:rows.flatMap(row=>row.pieces)};
}
test('user four-series example reduces strokes with whole-strip offsets',()=>{
 const page=[[21,12,10],[20,11,10],[10,10],[10,16,8,8]].map((lengths,i)=>({strip:series(lengths,String(i)),x:i*5,y:0}));
 const aligned=alignOffsets(page,5,43);
 assert.deepEqual(aligned.map(item=>item.y),[0,1,0,0]);
 const cuts=cutsFor(aligned,5);
 assert.equal(cuts.length,6);assert.equal(cutsFor(page,5).length,7);
 assert.ok(cuts.some(c=>c.axis==='H'&&c.fixed===21&&c.from===0&&c.to===10));
 assert.ok(cuts.some(c=>c.axis==='H'&&c.fixed===10&&c.from===10&&c.to===20));
 // The user's 0/1/1/1 layout has the same stroke count. Series 3 ends at
 // 21 cm: that edge is already cut during preparation, not another stroke.
 assert.equal(cutsFor(page.map((item,i)=>({...item,y:i===0?0:1})),5).length,cuts.length);
 aligned.forEach((item,i)=>{assert.equal(item.strip,page[i].strip);assert.ok(item.y>=0);assert.ok(item.y+item.strip.length<=43);assert.equal(item.strip.rows!.reduce((n,row)=>n+row.length,0),item.strip.length);});
});
test('alignment cannot bridge a missing column or introduce gaps within a column',()=>{
 const strip=series([10,10],'a');
 const page=[{strip,x:0,y:0},{strip:series([9,10],'b'),x:10,y:0}];
 assert.deepEqual(alignOffsets(page,5,43).map(item=>item.y),[0,0]);
 const stacked=[{strip,x:0,y:0},{strip,x:0,y:20},{strip:series([9,10],'c'),x:5,y:0}];
 const aligned=alignOffsets(stacked,5,43);
 assert.equal(aligned[1].y,aligned[0].y+strip.length);
 assert.ok(aligned.every(item=>item.y>=0&&item.y+item.strip.length<=43));
});
test('adjacent columns share one horizontal cutter stroke',()=>{
 const result=plan({...example,boardLength:20,boardWidth:20,bands:[{...example.bands[0],length:10,quantity:4}]});
 assert.equal(result.cuts,5); // 2 roll cuts + 2 vertical strokes + 1 shared horizontal stroke
 assert.equal(result.pageCuts[0].filter(c=>c.axis==='H').length,1);
 assert.equal(result.pageCuts[0].find(c=>c.axis==='H')!.to,10);
 assert.equal(result.pageCuts[0].length+result.strips.length,result.cuts);
});
test('collinear strokes join only when their segments touch',()=>{
 const strip:Strip={length:5,used:5,pieces:[{key:'a',name:'A',side:'G',index:0,length:5,width:2.5},{key:'b',name:'A',side:'D',index:0,length:5,width:2.5}]};
 assert.equal(cutsFor([{strip,x:0,y:0},{strip,x:0,y:5}],5).length,1);
 assert.equal(cutsFor([{strip,x:0,y:0},{strip,x:0,y:6}],5).length,2);
 const full:Strip={length:5,used:5,pieces:[{...strip.pieces[0],width:5}]};
 assert.equal(cutsFor([{strip,x:0,y:0},{strip:full,x:0,y:5},{strip,x:0,y:10}],5).length,2);
});
test('compatible pairs share a continuous cut across different lengths',()=>{const p=plan(example);assert.equal(p.total,21);assert.equal(p.cuts,4);assert.equal(p.waste,0);assert.equal(p.strips.length,1);assert.equal(p.strips[0].length,21);assert.deepEqual(p.strips[0].pieces.map(x=>x.side),['G','D','G','D','G','D']);assert.deepEqual(p.strips[0].rows?.map(r=>r.length).sort((a,b)=>a-b),[5,7,9]);});
test('oversized and invalid bands are rejected, never silently truncated',()=>{for(const patch of [{length:44},{quantity:1.5},{length:0}]){assert.ok(plan({...example,bands:[{...example.bands[0],...patch}]}).errors.length);}});
test('multiple passages stay within board and never overlap',()=>{const input={...example,boardLength:10,boardWidth:5};const p=plan(input);assert.equal(p.pages.length,3);for(const page of p.pages)for(const a of page){assert.ok(a.x+input.roll<=input.boardWidth);assert.ok(a.y+a.strip.length<=input.boardLength);for(const b of page)if(a!==b)assert.ok(a.x+input.roll<=b.x||b.x+input.roll<=a.x||a.y+a.strip.length<=b.y||b.y+b.strip.length<=a.y);}});
test('unequal widths leave measured waste and exact quantities',()=>{const p=plan({...example,bandWidth:2,bands:[{...example.bands[0],quantity:3,side:'left'}]});assert.equal(p.strips.length,2);assert.equal(p.strips.flatMap(s=>s.pieces).length,3);assert.equal(p.waste,20);assert.equal(p.cuts,4);});
test('changing global width applies to every generated piece and rejects oversized widths',()=>{
 for(const bandWidth of [2,2.5,5]){const p=plan({...example,bandWidth});assert.equal(p.errors.length,0);assert.ok(p.strips.flatMap(s=>s.pieces).every(piece=>piece.width===bandWidth));assert.equal(p.strips.flatMap(s=>s.pieces).length,6);}
 for(const bandWidth of [0,-1,6,NaN])assert.ok(plan({...example,bandWidth}).errors.length);
});
test('merged bands fit within their parent and quantities and area are conserved',()=>{
 const p=plan({...example,boardLength:16,bands:example.bands.map(b=>({...b,quantity:4}))});
 assert.equal(p.strips.flatMap(s=>s.pieces).length,24);
 assert.equal(new Set(p.strips.flatMap(s=>s.pieces.map(p=>p.key))).size,24);
 assert.equal(p.total,84);assert.equal(p.waste,0);
 for(const s of p.strips){assert.ok(s.length<=16);assert.equal(s.rows!.reduce((n,r)=>n+r.length,0),s.length);for(const row of s.rows!)assert.equal(row.pieces.reduce((n,p)=>n+p.width,0),5);}
 for(const page of p.pages)for(const a of page)for(const b of page)if(a!==b)assert.ok(a.x+5<=b.x||b.x+5<=a.x||a.y+a.strip.length<=b.y||b.y+b.strip.length<=a.y);
});
