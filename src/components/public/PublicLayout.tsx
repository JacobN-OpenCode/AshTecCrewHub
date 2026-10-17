import { Link, useLocation } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import { Lightbulb, LogIn, Github, MessageCircle } from 'lucide-react';
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
        <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm text-muted-foreground">
          <p>{PLATFORM} · {SCHOOL}</p>
          <div className="flex items-center gap-4">
            <p>Built by the crew, for the crew.</p>
            <a href="/github" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Github className="h-4 w-4" /> GitHub
            </a>
          </div>
        </div>
      </footer>

      <LoginCat />
    </div>
  );
}
