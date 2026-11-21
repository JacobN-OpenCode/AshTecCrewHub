import { Link, useLocation } from 'react-router-dom';
import { useMe } from '../lib/me';
import { useTheme } from '../lib/theme';

/**
 * Ticket 1bbe2d65: the band at the top of the page.
 *
 * Each of the pins opens with something before the content proper: a greeting
 * card with the mascot in it, a line of trees, a "welcome back". That piece is
 * what makes a look feel like an interface rather than a recolour, so it lives
 * here and the original theme simply renders nothing.
 */

const DAY = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function QuickLink({ to, children, tint }: { to: string; children: string; tint: string }) {
  return (
    <Link
      to={to}
      className="rounded-full px-4 py-2 text-sm font-medium text-foreground/85 transition-transform hover:-translate-y-0.5"
      style={{ background: `hsl(var(${tint}) / 0.9)` }}
    >
      {children}
    </Link>
  );
}

/** A run of simple line-drawn pines, wide enough to stretch across the page. */
function Pines() {
  const trees = Array.from({ length: 26 }, (_, i) => i);
  return (
    <svg viewBox="0 0 780 64" preserveAspectRatio="none" className="h-12 w-full" aria-hidden>
      {trees.map((i) => {
        const x = i * 30 + 8;
        const h = 30 + ((i * 37) % 22);
        return (
          <g key={i} stroke="hsl(var(--primary) / 0.5)" strokeWidth="1.2" fill="none" strokeLinejoin="round">
            <path d={`M${x} ${64} L${x} ${64 - h}`} />
            <path d={`M${x - 11} ${64 - h * 0.15} L${x} ${64 - h} L${x + 11} ${64 - h * 0.15}`} />
            <path d={`M${x - 8} ${64 - h * 0.45} L${x} ${64 - h * 0.85} L${x + 8} ${64 - h * 0.45}`} />
          </g>
        );
      })}
    </svg>
  );
}

export default function ThemeBand() {
  const { me } = useMe();
  const { choice } = useTheme();
  const { pathname } = useLocation();

  if (choice.theme === 'periwinkle') {
    if (pathname !== '/') return null;
    return (
      <section className="mb-6 overflow-hidden rounded-[28px] bg-white p-6 shadow-[0_28px_60px_-48px_rgba(38,48,120,0.95)] sm:flex sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">Hi, {me.firstName}!</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">What are we making today?</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickLink to="/calendar" tint="--tint-1">The calendar</QuickLink>
            <QuickLink to="/my-events" tint="--tint-2">My events</QuickLink>
            <QuickLink to="/attendance" tint="--tint-3">Check-in</QuickLink>
            <QuickLink to="/documents" tint="--tint-4">Documents</QuickLink>
          </div>
        </div>
        <img
          src="/cat.png"
          alt=""
          className="mt-5 h-24 w-24 shrink-0 drop-shadow-sm sm:mt-0 sm:h-32 sm:w-32"
        />
      </section>
    );
  }

  if (choice.theme === 'quiet') {
    return (
      <section className="mb-6">
        <p className="text-sm text-muted-foreground">{DAY}</p>
        <h1 className="mt-1 text-2xl font-medium">Good to see you, {me.firstName}.</h1>
        <Pines />
      </section>
    );
  }

  if (choice.theme === 'school') {
    if (pathname !== '/') return null;
    return (
      <section className="mb-6 flex items-center gap-4 rounded-[28px] bg-white p-5 shadow-[0_26px_60px_-48px_rgba(60,40,90,0.8)]">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl" style={{ background: 'hsl(var(--tint-2))' }}>
          <span aria-hidden>👋</span>
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Welcome back, {me.firstName}</h1>
          <p className="text-sm text-muted-foreground">{DAY}</p>
        </div>
      </section>
    );
  }

  return null;
}
