import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@project/components/ui/dialog';
import { Lightbulb, LogIn, Github, MessageCircle, Heart } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { PLATFORM, SCHOOL, WHATSAPP_COMMUNITY_URL } from '../../lib/constants';
import { useAppSettings } from '../../lib/appSettings';
import LoginCat from '../LoginCat';

/** The public site's navigation, in the order it reads to a visitor. */
export const PUBLIC_NAV = [
  { to: '/', label: 'Home' },
  { to: '/productions', label: 'Productions' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/parents', label: 'Parents' },
  { to: '/about', label: 'About' },
  { to: '/join', label: 'Join us' },
];

/** The crew mark plus the platform name, used in the header and footer. */
export function PublicBrand({ className }: { className?: string }) {
  const { platformName } = useAppSettings();
  return (
    <Link to="/" className={cn('flex items-center gap-2.5 font-bold tracking-tight', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/15">
        <Lightbulb className="h-5 w-5 text-primary" />
      </span>
      <span>{platformName}</span>
    </Link>
  );
}

const isActive = (pathname: string, to: string) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);

/**
 * Chrome for every signed-out page: one header, one footer, one cat.
 *
 * The public site is a small multi-page site rather than a single long page, so
 * the nav lives here and each page renders only its own content. The pages that
 * were written before this (calendar, parents) keep their own markup for now.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [credits, setCredits] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <PublicBrand />
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {PUBLIC_NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  'rounded-lg px-3 py-2 font-medium transition-colors',
                  isActive(pathname, n.to) ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Button asChild className="h-10 rounded-full px-5">
            <Link to="/signin">
              <LogIn className="mr-2 h-4 w-4" />
              Sign in
            </Link>
          </Button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 text-sm md:hidden">
          {PUBLIC_NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors',
                isActive(pathname, n.to) ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main>{children}</main>

      <footer className="mt-24 border-t px-4 py-12">
        <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-3 sm:col-span-2">
            <PublicBrand />
            <p className="max-w-xs text-sm text-muted-foreground">
              The stage crew of {SCHOOL}. We run the lights, the sound and the shows, and this is where it all lives.
            </p>
            <a
              href={WHATSAPP_COMMUNITY_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp community
            </a>
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explore</h3>
            {PUBLIC_NAV.map((n) => (
              <Link key={n.to} to={n.to} className="block text-muted-foreground hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">For parents</h3>
            <Link to="/parents" className="block text-muted-foreground hover:text-foreground">Term dates &amp; info</Link>
            <Link to="/calendar" className="block text-muted-foreground hover:text-foreground">Public calendar</Link>
            <Link to="/join" className="block text-muted-foreground hover:text-foreground">How to join</Link>
            <Link to="/signin" className="block text-muted-foreground hover:text-foreground">Crew sign in</Link>
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Apps</h3>
            <Link to="/apps" className="block text-muted-foreground hover:text-foreground">Get the crew apps</Link>
            <Link to="/apps" className="block text-muted-foreground hover:text-foreground">Wear OS</Link>
            <Link to="/apps" className="block text-muted-foreground hover:text-foreground">macOS</Link>
            <button type="button" onClick={() => setCredits(true)} className="block text-muted-foreground hover:text-foreground">
              Credits
            </button>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm text-muted-foreground">
          <div>
            <p>{PLATFORM} · {SCHOOL}</p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              An independent, student-run project. Not affiliated with, endorsed by or controlled by Ashford School or the United Learning Trust.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <p>Built by the crew, for the crew.</p>
            <a href="/github" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Github className="h-4 w-4" /> GitHub
            </a>
          </div>
        </div>
      </footer>

      <CreditsDialog open={credits} onOpenChange={setCredits} />
      <LoginCat />
    </div>
  );
}

/**
 * Who made this, and what each of them did. Grounded in the support tickets
 * and feedback they actually filed: Felix found the bugs, Joshua asked for the
 * features, Leila sent the ideas, Adam filed the reports, Jacob built it.
 */
const CREDITS: { name: string; role: string; what: string }[] = [
  {
    name: 'Jacob Navaratne',
    role: 'Lead Developer & Maintainer',
    what: 'Built the crew hub and keeps it running: the app, the API, the live show, the bots and everything in between.',
  },
  {
    name: 'Felix Moore',
    role: 'Testing & bug reports',
    what: 'Found and reported the bugs that made it better: the support page scaling, attendance not matching between pages, the "NaN days" counter, the mobile and PWA niggles, and the calendar feed request.',
  },
  {
    name: 'Joshua Moore',
    role: 'Features & reviews',
    what: 'The feature requests and reviews that shaped it: support ticket editing, sorting and reminders, ticket notifications, the script viewer and the daily-summary wording.',
  },
  {
    name: 'Leila Paice',
    role: 'Ideas & feedback',
    what: 'Ideas and feedback that pointed the app in the right direction, and kind words along the way.',
  },
  {
    name: 'Adam Mills',
    role: 'Bug reports',
    what: 'Reports that fixed real problems: the emergency admin sign-in, the settings page not opening, and follow spot requests.',
  },
];

function CreditsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Heart className="h-4 w-4 text-primary" /> Credits</DialogTitle>
          <DialogDescription>{PLATFORM} is built by the crew, for the crew. Thank you to:</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {CREDITS.map((c) => (
            <li key={c.name} className="rounded-xl border bg-card p-3">
              <p className="font-semibold">
                {c.name} <span className="font-normal text-primary">· {c.role}</span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.what}</p>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
