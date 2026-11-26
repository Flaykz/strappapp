export type WakeLockState={supported:boolean;active:boolean};

type Sentinel={release:()=>Promise<void>;addEventListener:(type:'release',listener:()=>void)=>void};
export type WakeLockEnv={
 wakeLock?:{request:(type:'screen')=>Promise<Sentinel>};
 doc:{visibilityState:string;addEventListener:(type:'visibilitychange',listener:()=>void)=>void;removeEventListener:(type:'visibilitychange',listener:()=>void)=>void};
};

/** Keeps the screen awake while started. Re-requests the lock when the page becomes visible again. */
export function createWakeLock(env:WakeLockEnv,onChange:(state:WakeLockState)=>void){
 const supported=!!env.wakeLock;
 let sentinel:Sentinel|null=null,running=false,pending=false;
 const publish=()=>onChange({supported,active:sentinel!==null});
 async function acquire(){
  if(!env.wakeLock||!running||sentinel||pending||env.doc.visibilityState!=='visible')return;
  pending=true;
  try{
   const lock=await env.wakeLock.request('screen');
   if(!running){await lock.release().catch(()=>{});return;}
   sentinel=lock;
   lock.addEventListener('release',()=>{if(sentinel===lock){sentinel=null;publish();}});
  }catch{/* Refused (battery saver, insecure context): stay inactive. */}
  finally{pending=false;publish();}
 }
 const visibility=()=>{void acquire();};
 return {
  state:():WakeLockState=>({supported,active:sentinel!==null}),
  start(){
   if(running)return;
   running=true;env.doc.addEventListener('visibilitychange',visibility);void acquire();
  },
  stop(){
   running=false;env.doc.removeEventListener('visibilitychange',visibility);
   const lock=sentinel;sentinel=null;publish();
   void lock?.release().catch(()=>{});
  },
 };
}
