import { useEffect, useState } from 'preact/hooks';
import { createWakeLock, type WakeLockState } from './wakeLock';

/** Requests a screen wake lock while `enabled`; `supported` is false when the browser lacks the API. */
export function useWakeLock(enabled:boolean):WakeLockState{
 const [state,setState]=useState<WakeLockState>({supported:typeof navigator!=='undefined'&&'wakeLock' in navigator,active:false});
 useEffect(()=>{
  const lock=createWakeLock({wakeLock:(navigator as unknown as {wakeLock?:WakeLockEnvLock}).wakeLock,doc:document},setState);
  if(enabled)lock.start();else setState(lock.state());
  return()=>lock.stop();
 },[enabled]);
 return state;
}
type WakeLockEnvLock=NonNullable<Parameters<typeof createWakeLock>[0]['wakeLock']>;
