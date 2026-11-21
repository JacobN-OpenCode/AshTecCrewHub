/**
 * Feeding the crew cat (ticket f3260834, J So).
 *
 * The request was a snack somewhere in the cat's menu that you drag onto the
 * cat, after which it eats it and says "yummy". The cat that is actually on
 * every page is the corner companion, so the snack lives next to it there.
 *
 * All the thinking is in this file, away from the component, so the rotation and
 * the drop test can be checked without a browser.
 */

export type SnackId = 'burger' | 'steak';

export interface Snack {
  id: SnackId;
  /** Used in the drag hint and the button's accessible name. */
  label: string;
  /** What the cat says once it has eaten this one. */
  line: string;
}

export const SNACKS: Snack[] = [
  { id: 'burger', label: 'burger', line: 'Yummy. Is there another one?' },
  { id: 'steak', label: 'steak', line: 'Yummy. Rare, obviously.' },
];

/** How far outside the cat a drop still counts, so it need not be pixel-perfect. */
export const DROP_MARGIN = 20;

/**
 * The snack that should turn up next: anything but the one just eaten, so the
 * floor does not look frozen. A null current (first load) gives the burger.
 */
export function nextSnack(current: SnackId | null): Snack {
  const index = SNACKS.findIndex((snack) => snack.id === current);
  return SNACKS[(index + 1) % SNACKS.length];
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Point {
  x: number;
  y: number;
}

/** Is the drop inside the cat, give or take the margin? */
export function hitsCat(point: Point, box: Box, margin = DROP_MARGIN): boolean {
  return (
    point.x >= box.left - margin &&
    point.x <= box.right + margin &&
    point.y >= box.top - margin &&
    point.y <= box.bottom + margin
  );
}

/**
 * framer-motion reports a drag's end in page coordinates; a getBoundingClientRect
 * is in viewport ones. Adding the scroll back turns one into the other.
 */
export function pageBox(rect: Box, scroll: Point): Box {
  return {
    left: rect.left + scroll.x,
    right: rect.right + scroll.x,
    top: rect.top + scroll.y,
    bottom: rect.bottom + scroll.y,
  };
}
