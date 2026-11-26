import { useEffect, useRef, useState } from 'preact/hooks';
import type { Protocol } from '../planner.ts';
import { createAppSync } from './index.ts';
import type { SyncState } from './syncEngine.ts';

// Branche le moteur de synchro sur l'état React : détecte les modifications locales et applique le distant.
export function useSync(protocol: Protocol, onRemote: (p: Protocol) => void) {
  const current = useRef(protocol);
  const applied = useRef(protocol);
  const [engine] = useState(() => createAppSync(() => current.current, next => {
    current.current = next;
    applied.current = next;
    onRemote(next);
  }));
  const [state, setState] = useState<SyncState>(engine.getState());
  useEffect(() => engine.subscribe(() => setState(engine.getState())), [engine]);
  useEffect(() => () => engine.dispose(), [engine]);
  current.current = protocol;
  useEffect(() => {
    if (protocol === applied.current) return;
    applied.current = protocol;
    engine.localChanged();
  }, [protocol]);
  return { engine, state };
}
