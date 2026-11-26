/**
 * The plan is computed with x along the board length and y along the board width.
 * Swapping the axes around (0, 0) turns the view without moving the origin to another corner.
 */
export function toView(x:number,y:number,swapped:boolean):{u:number;v:number}{
 return swapped?{u:y,v:x}:{u:x,v:y};
}
