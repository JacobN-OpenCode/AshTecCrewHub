/**
 * The two things that turn up on the floor for the cat (ticket f3260834).
 *
 * Drawn rather than emoji so they look the same on every machine and sit in the
 * same hand as the rest of the app's shapes; `lucide-react` has no burger.
 * Sized by className, like an icon, so nothing here sets a font size.
 */

import type { SnackId } from '../lib/catSnack';

interface Props {
  className?: string;
}

export function Burger({ className }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      {/* top bun */}
      <path d="M5 15a11 7.5 0 0 1 22 0z" fill="#E7A85A" />
      {/* sesame */}
      <ellipse cx="11" cy="11.2" rx="1.5" ry="0.9" fill="#FBEBC9" transform="rotate(-18 11 11.2)" />
      <ellipse cx="16" cy="9.6" rx="1.5" ry="0.9" fill="#FBEBC9" />
      <ellipse cx="21" cy="11.2" rx="1.5" ry="0.9" fill="#FBEBC9" transform="rotate(18 21 11.2)" />
      {/* lettuce */}
      <path d="M5 15h22v2.2c0 .8-.7 1.5-1.5 1.5h-19c-.8 0-1.5-.7-1.5-1.5z" fill="#7BBE58" />
      {/* patty */}
      <rect x="6" y="18.2" width="20" height="3.2" rx="1.4" fill="#8A4B2E" />
      {/* bottom bun */}
      <rect x="6" y="21.4" width="20" height="3.9" rx="1.9" fill="#E7A85A" />
    </svg>
  );
}

export function Steak({ className }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      {/* bone */}
      <rect x="2" y="14.6" width="8" height="3.6" rx="1.8" fill="#F4EDE4" />
      <circle cx="3" cy="13.8" r="2.1" fill="#F4EDE4" />
      <circle cx="3" cy="19" r="2.1" fill="#F4EDE4" />
      {/* meat */}
      <path d="M8 11.6c4-2.8 10-2.6 13.6-.4 3.6 2.2 6.4 5.4 5.4 9.2-.9 3.4-4.4 5.2-8.6 5-4.6-.2-9.2-2-11.4-5.2-1.8-2.6-2-6.4 1-8.6z" fill="#A8483A" />
      {/* fat through the middle */}
      <path d="M11 16.4c3-1.9 7.2-1.8 10.2.5" fill="none" stroke="#E4867B" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The right drawing for whichever snack is on the floor. A record rather than a
 * ternary, so a third snack cannot ship without something to draw.
 */
const DRAWINGS: Record<SnackId, (p: Props) => JSX.Element> = { burger: Burger, steak: Steak };

export function SnackIcon({ id, className }: Props & { id: SnackId }) {
  const Drawing = DRAWINGS[id];
  return <Drawing className={className} />;
}
