import test from 'node:test';
import assert from 'node:assert/strict';
import { createWakeLock } from './wakeLock.ts';

function setup(opts:{refuse?:boolean;noApi?:boolean}={}){
 const listeners=new Set<()=>void>();
 const doc={visibilityState:'visible',addEventListener:(_:'visibilitychange',l:()=>void)=>{listeners.add(l);},removeEventListener:(_:'visibilitychange',l:()=>void)=>{listeners.delete(l);}};
 const locks:{released:boolean;fire:()=>void}[]=[];
 const wakeLock=opts.noApi?undefined:{request:async()=>{
  if(opts.refuse)throw new Error('NotAllowedError');
  let onRelease=()=>{};
  const lock={released:false,fire:()=>{lock.released=true;onRelease();},release:async()=>{lock.released=true;},addEventListener:(_:'release',l:()=>void)=>{onRelease=l;}};
  locks.push(lock);return lock;
 }};
 const states:{supported:boolean;active:boolean}[]=[];
 const wl=createWakeLock({wakeLock,doc},s=>states.push(s));
 const tick=()=>new Promise(r=>setTimeout(r,0));
 return {wl,doc,locks,listeners,states,tick};
}

test('acquires on start and releases on stop',async()=>{
 const t=setup();t.wl.start();await t.tick();
 assert.deepEqual(t.wl.state(),{supported:true,active:true});
 t.wl.stop();await t.tick();
 assert.equal(t.locks[0].released,true);assert.equal(t.wl.state().active,false);assert.equal(t.listeners.size,0);
});

test('re-requests after the browser releases it on hidden then visible',async()=>{
 const t=setup();t.wl.start();await t.tick();
 t.doc.visibilityState='hidden';t.locks[0].fire();
 assert.equal(t.wl.state().active,false);
 t.doc.visibilityState='visible';t.listeners.forEach(l=>l());await t.tick();
 assert.equal(t.locks.length,2);assert.equal(t.wl.state().active,true);
});

test('does not request while hidden',async()=>{
 const t=setup();t.doc.visibilityState='hidden';t.wl.start();await t.tick();
 assert.equal(t.locks.length,0);
});

test('unsupported API: no crash, supported=false',async()=>{
 const t=setup({noApi:true});t.wl.start();await t.tick();
 assert.deepEqual(t.wl.state(),{supported:false,active:false});t.wl.stop();
});

test('refused request: stays inactive without throwing',async()=>{
 const t=setup({refuse:true});t.wl.start();await t.tick();
 assert.deepEqual(t.wl.state(),{supported:true,active:false});
});

test('stop during pending request releases the late lock',async()=>{
 const t=setup();t.wl.start();t.wl.stop();await t.tick();
 assert.equal(t.locks[0].released,true);assert.equal(t.wl.state().active,false);
});
