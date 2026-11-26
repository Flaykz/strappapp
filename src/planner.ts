export type Band = { id: string; name: string; length: number; side: 'both' | 'left' | 'right'; fullWidth?: boolean };
export type Protocol = { bands: Band[]; sessions: number; roll: number; bandWidth: number; boardLength: number; boardWidth: number };
export type Piece = { key: string; name: string; length: number; width: number; side: string; index: number; fullWidth?: boolean };
/** Consecutive pieces of identical length and width, stacked across the roll width. `x` is measured from the start of the line. */
export type Segment = { x: number; length: number; pieces: Piece[] };
/** One line = one piece of roll, unrolled left to right: segments laid end to end. */
export type Strip = { length: number; segments: Segment[]; pieces: Piece[] };
/** `x` runs along the board length (left to right), `y` along the board width (top to bottom). */
export type Placement = { strip: Strip; x: number; y: number };
/** V: vertical line at x = `fixed`, spanning y from..to. H: horizontal line at y = `fixed`, spanning x from..to. */
export type Cut = { axis: 'H' | 'V'; fixed: number; from: number; to: number };
export type Plan = { errors: string[]; strips: Strip[]; pages: Placement[][]; pageCuts: Cut[][]; cuts: number; total: number; waste: number };
const eps = 1e-8;
export const LINE_GAP = 1;

/** Cuts of one page in reading order: line by line, then horizontal strokes, then vertical cuts left to right. */
export function cutsFor(page: Placement[], roll: number): Cut[] {
  const cuts: Cut[] = [];
  for (const { strip, x, y } of page) {
    const horizontal: Cut[] = [];
    for (const seg of strip.segments) {
      const width = seg.pieces[0].width;
      for (let lane = 1; lane <= seg.pieces.length; lane++) if (lane * width < roll - eps) horizontal.push({ axis: 'H', fixed: y + lane * width, from: x + seg.x, to: x + seg.x + seg.length });
    }
    horizontal.sort((a, b) => a.fixed - b.fixed || a.from - b.from);
    const merged: Cut[] = [];
    for (const cut of horizontal) {
      const last = merged.at(-1);
      if (last && Math.abs(last.fixed - cut.fixed) < eps && cut.from <= last.to + eps) last.to = Math.max(last.to, cut.to);
      else merged.push({ ...cut });
    }
    cuts.push(...merged);
    for (const seg of strip.segments) cuts.push({ axis: 'V', fixed: x + seg.x + seg.length, from: y, to: y + roll });
  }
  return cuts;
}

export function validate(p: Protocol): string[] {
  const errors: string[] = [];
  if (![p.roll,p.boardLength,p.boardWidth].every(n=>Number.isFinite(n)&&n>0&&n<=10000)) errors.push('Les dimensions du matériel doivent être positives et inférieures ou égales à 10 000 cm.');
  if (p.roll > p.boardWidth) errors.push('La largeur du rouleau dépasse la largeur utile de la plaque. Inverse les dimensions de la plaque si nécessaire.');
  if (!Number.isFinite(p.bandWidth)||p.bandWidth<=0||p.bandWidth>10000) errors.push('La largeur commune des bandes doit être positive et inférieure ou égale à 10 000 cm.');
  if (p.bandWidth>p.roll) errors.push('La largeur commune des bandes dépasse celle du rouleau.');
  if (!p.bands.length) errors.push('Ajoute au moins une bande.');
  if (!Number.isInteger(p.sessions)||p.sessions<1||p.sessions>100) errors.push('Le nombre de séances doit être un entier entre 1 et 100.');
  p.bands.forEach((b,i)=>{
    if (!b.name.trim()) errors.push(`La bande ${i+1} doit avoir un nom.`);
    if (!Number.isFinite(b.length)||b.length<=0||b.length>10000) errors.push(`${b.name} : longueur non valide.`);
    if (Number.isFinite(b.length) && !Number.isInteger(b.length)) errors.push(`${b.name} : la longueur doit être un nombre entier de centimètres.`);
    if (b.length>p.boardLength) errors.push(`${b.name} : longueur supérieure à la plaque. Ce MVP ne gère pas les découpes en plusieurs avancées.`);
  });
  return errors;
}

/** Pieces in protocol order: session, band, then side. */
function piecesOf(p: Protocol): Piece[] {
  return Array.from({length:p.sessions},(_,copy)=>p.bands.flatMap((b,index)=>
    (b.side==='both'?['G','D']:[b.side==='left'?'G':'D']).map(side=>({key:`${b.id}-${side}-${copy}`,name:b.name,length:b.length,width:b.fullWidth?p.roll:p.bandWidth,side,index,fullWidth:!!b.fullWidth})))).flat();
}

/** Consecutive pieces (of any band) with exactly the same length and width are stacked across the roll, at most floor(roll / piece width) per segment; extra pieces follow in a new segment. */
function segmentsOf(pieces: Piece[], roll: number): { length: number; pieces: Piece[] }[] {
  const segments: { length: number; pieces: Piece[] }[] = [];
  for (const piece of pieces) {
    const last = segments.at(-1);
    if (last && last.length === piece.length && last.pieces[0].width === piece.width && last.pieces.length < Math.max(1, Math.floor(roll / piece.width + eps))) last.pieces.push(piece);
    else segments.push({ length: piece.length, pieces: [piece] });
  }
  return segments;
}

/**
 * Segments are laid end to end, left to right, on the current line. When the next one does not fit,
 * a new line starts below (1 cm gap); when no line fits on the board, a new page starts.
 * No reordering and no going back.
 */
export function plan(p: Protocol): Plan {
  const errors = validate(p);
  if (errors.length) return {errors,strips:[],pages:[],pageCuts:[],cuts:0,total:0,waste:0};
  const linesPerPage = Math.max(1, Math.floor((p.boardWidth + LINE_GAP + eps) / (p.roll + LINE_GAP)));
  const strips: Strip[] = [];
  const pages: Placement[][] = [];
  let line = -1, used = 0, current: Strip | null = null;
  for (const seg of segmentsOf(piecesOf(p), p.roll)) {
    if (!current || used + seg.length > p.boardLength + eps) {
      line++;
      used = 0;
      current = { length: 0, segments: [], pieces: [] };
      strips.push(current);
      if (!pages.length || line >= linesPerPage) { pages.push([]); line = 0; }
      pages.at(-1)!.push({ strip: current, x: 0, y: line * (p.roll + LINE_GAP) });
    }
    current.segments.push({ x: used, length: seg.length, pieces: seg.pieces });
    current.pieces.push(...seg.pieces);
    used += seg.length;
    current.length = used;
  }
  const pageCuts = pages.map(page => cutsFor(page, p.roll));
  const cuts = pageCuts.reduce((n,c)=>n+c.length,0);
  const total = strips.reduce((n,s)=>n+s.length,0);
  const waste = strips.reduce((n,s)=>n+s.segments.reduce((m,seg)=>m+(p.roll-seg.pieces.reduce((w,piece)=>w+piece.width,0))*seg.length,0),0);
  return {errors,strips,pages,pageCuts,cuts,total,waste};
}
