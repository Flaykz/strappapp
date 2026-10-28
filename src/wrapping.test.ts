import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wrapSteps} from './wrapping.ts';
import type {Protocol} from './planner.ts';
const p:Protocol={sessions:2,roll:5,bandWidth:2.5,boardLength:43,boardWidth:23,bands:[{id:'a',name:'A1',length:5,side:'both'},{id:'b',name:'A2',length:7,side:'right'},{id:'c',name:'A3',length:9,side:'left'}]};
test('paired wrapping validates one pair at a time and preserves single-sided bands',()=>{
 const steps=wrapSteps(p,true);assert.equal(steps.length,6);
 assert.deepEqual(steps.map(s=>s.pieces.map(p=>`${p.name}-${p.side}-${p.copy}`)),[['A1-left-1','A1-right-1'],['A2-right-1'],['A3-left-1'],['A1-left-2','A1-right-2'],['A2-right-2'],['A3-left-2']]);
});
test('separate wrapping goes left then right for every copy without losing quantities',()=>{
 const steps=wrapSteps(p,false);assert.equal(steps.length,8);assert.ok(steps.every(s=>s.pieces.length===1));
 assert.deepEqual(steps.flatMap(s=>s.pieces),wrapSteps(p,true).flatMap(s=>s.pieces));
 assert.equal(new Set(steps.map(s=>s.key)).size,steps.length);
});
