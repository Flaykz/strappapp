import { useEffect, useRef, useState } from 'preact/hooks';
import type { Protocol } from '../planner.ts';
import type { Stock } from '../stock.ts';
import { createAppSync } from './index.ts';
import type { SyncState } from './syncEngine.ts';

type Remote = { onProtocol: (p: Protocol) => void; onStock: (s: Stock) => void };

// Suit une valeur de l'UI : `latest` est lisible par le moteur, et toute modification qui ne vient pas
// d'un remplacement par le distant (`applied`) est signalée comme locale.
function useTracked<T>(value: T, onLocalChange: () => void) {
  const latest = useRef(value);
  const applied = useRef(value);
  latest.current = value;
  useEffect(() => {
    if (value === applied.current) return;
    applied.current = value;
    onLocalChange();
  }, [value]);
  return { latest, applied };
}

// Branche le moteur de synchro sur l'état de l'UI : protocole et stock, une seule connexion.
export function useSync(protocol: Protocol, stock: Stock, remote: Remote) {
  const engineRef = useRef<ReturnType<typeof createAppSync>>();
  const p = useTracked(protocol, () => engineRef.current?.localChanged('protocol'));
  const s = useTracked(stock, () => engineRef.current?.localChanged('stock'));
  const [engine] = useState(() => {
    const created = createAppSync({
      getProtocol: () => p.latest.current,
      applyProtocol: next => { p.latest.current = next; p.applied.current = next; remote.onProtocol(next); },
      getStock: () => s.latest.current,
      applyStock: next => { s.latest.current = next; s.applied.current = next; remote.onStock(next); },
    });
    engineRef.current = created;
    return created;
  });
  const [state, setState] = useState<SyncState>(engine.getState());
  useEffect(() => engine.subscribe(() => setState(engine.getState())), [engine]);
  useEffect(() => () => engine.dispose(), [engine]);
  return { engine, state };
}
