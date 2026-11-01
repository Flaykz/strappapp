import type { Cut, Placement } from './planner.ts';

// Swap axes around (0, 0) so a top-aligned layout stays left-aligned.
// Unlike a quarter turn, this never moves the origin to another corner.
export function boardPlacement({strip,x,y}:Placement,swapped:boolean){
 return swapped?{x:y,y:x}:{x,y};
}
export function boardCut(cut:Cut,swapped:boolean):Cut{
 return swapped?{...cut,axis:cut.axis==='H'?'V':'H'}:cut;
}
export function boardLabel(x:number,y:number,swapped:boolean){
 // Cancel the parent's axis swap for text, keeping labels readable.
 return swapped?`matrix(0 1 1 0 ${x} ${y})`:`translate(${x} ${y})`;
}
