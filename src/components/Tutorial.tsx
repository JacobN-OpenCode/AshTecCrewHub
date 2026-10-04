import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { HelpCircle, MousePointerClick } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { TOUR, SEEN_KEY, type Step } from '../lib/tutorial';
import { useMe } from '../lib/me';
import { pwaWelcomeOpen } from './PwaWelcome';

type Rect = { top: number; left: number; width: number; height: number };

export default function Tutorial() {
  const { me } = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  // Phones get a docked card instead of one anchored beside the target.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // The measured rect is read inside scroll/resize listeners, so it has to be a
  // ref. Putting it in state re-runs the measure effect, which re-registers the
  // listeners, which re-measures.
  const stepRef = useRef<Step | undefined>(undefined);

  // Role filtering happens here, not in TOUR. Otherwise an Actor gets shown steps
  // about show-response buttons they do not have, and an admin-only step would
  // point at a dropdown that does not exist for them.
  //
  // Memoised because this array feeds effect dependencies below. A fresh array
  // on every render made the auto-open effect re-run constantly and re-open the
  // tour the moment you closed it.
  const steps = useMemo(
    () =>
      TOUR.filter((s) => {
        if (s.adminOnly && !me.isAdmin) return false;
        if (s.actorOnly && me.memberType !== 'Actor') return false;
        if (s.notActorOnly && me.memberType === 'Actor') return false;
        return true;
      }),
    [me.isAdmin, me.memberType],
  );

  const step: Step | undefined = steps[i];
  stepRef.current = step;
  const seenKey = SEEN_KEY(me.id);
  const last = i === steps.length - 1;
  // 'target' steps accept a click on the highlighted control to move on.
  const waiting = step?.advance === 'target';

  const close = useCallback(() => {
    setOpen(false);
    localStorage.setItem(seenKey, '1');
  }, [seenKey]);

  const go = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(steps.length - 1, n));
      setI(clamped);
      const target = steps[clamped];
      if (target && target.path !== loc.pathname) nav(target.path);
    },
    [steps, loc.pathname, nav],
  );

  const start = useCallback(() => {
    const at = steps.findIndex((s) => s.path === loc.pathname);
    setI(at >= 0 ? at : 0);
    setOpen(true);
  }, [loc.pathname, steps]);

  useEffect(() => {
    // Auto-open once per member per browser, and only on a page the tour covers.
    // Also hold off while the PWA welcome is up: when the installed app first
    // opens, both used to fire at once and the tour landed on top of the
    // welcome before it could ask about notifications.
    if (localStorage.getItem(seenKey)) return;
    if (pwaWelcomeOpen()) return;
    const at = steps.findIndex((s) => s.path === loc.pathname);
    if (at < 0) return;
    setI(at);
    setOpen(true);
    // `steps` and `i` are deliberately not dependencies: this must fire once per
    // page, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname, seenKey]);

  // Track the highlighted element and keep it on screen.
  useEffect(() => {
    if (!open) return;
    const sel = step?.target;
    if (!sel) {
      setRect(null);
      setMissing(false);
      return;
    }

    const find = () => document.querySelector<HTMLElement>(`[data-tour="${sel}"]`);

    const measure = () => {
      const el = find();
      if (!el || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') {
        setRect(null);
        setMissing(true);
        return false;
      }
      const r = el.getBoundingClientRect();
      // A zero-size box means it is still collapsed or hidden; treat it as not
      // ready rather than drawing a highlight around nothing.
      if (r.width === 0 || r.height === 0) {
        setRect(null);
        setMissing(true);
        return false;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setMissing(false);
      return true;
    };

    // Wait for the element instead of assuming it is there. Pages that fetch
    // their data render the target well after the route mounts, so a single
    // 60ms check found nothing and gave up - which is why the tour kept landing
    // on "that control is not on this page" for perfectly good buttons.
    let settled = false;
    let attempts = 0;
    const centre = () => {
      const el = find();
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
      return true;
    };

    const trySettle = () => {
      attempts += 1;
      centre();
      if (measure()) {
        settled = true;
        window.clearInterval(poll);
        mo.disconnect();
        return;
      }
      if (attempts >= 40) {
        // ~4s. Give up waiting and leave the "missing" state showing.
        window.clearInterval(poll);
        mo.disconnect();
      }
    };

    // Poll for late-mounting targets, and also react to the DOM changing.
    const poll = window.setInterval(trySettle, 100);
    const mo = new MutationObserver(() => {
      if (!settled) trySettle();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    trySettle();

    // Once settled, keep the hole over the element on scroll and resize. Never
    // scroll from here: doing so made the page fight the user, since each scroll
    // event fired another smooth scroll which fired another scroll event.
    const onScroll = () => {
      if (settled) measure();
    };
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);

    // Late layout shifts: webfonts loading, images decoding, list rows arriving.
    const settleLate = window.setTimeout(() => {
      if (settled) measure();
    }, 400);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(settleLate);
      mo.disconnect();
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, step?.target, loc.pathname]);

  // 'target' steps advance on a click anywhere in the highlighted element. The
  // listener goes on the document rather than the element, so it survives React
  // re-rendering the node out from under us.
  useEffect(() => {
    if (!open || !waiting || !step?.target) return;
    const onClick = (e: MouseEvent) => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el || !el.contains(e.target as Node)) return;
      if (last) close();
      else go(i + 1);
    };
    // Capture: the page still handles the click, we only observe it.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [open, waiting, step?.target, i, last, go, close]);

  // Escape always exits. Without it there was no keyboard way out of a step whose
  // control was missing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && !waiting && !last) go(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, waiting, last, i, go, close]);

  if (!step) return null;

  const card = (
    <div className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto rounded-2xl border bg-card p-4 shadow-2xl space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-primary tracking-wide uppercase">
          Step {i + 1} of {steps.length}
        </p>
        <h2 className="font-semibold leading-snug">{step.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
      </div>
      {waiting && (
        <p className="text-xs text-primary flex items-center gap-1.5">
          <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
          {missing ? 'That control is not on this page, so use Next.' : 'Click the highlighted control to continue.'}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={close}>Skip tour</Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" disabled={i === 0} onClick={() => go(i - 1)}>Back</Button>
        {/* Always offer Next, even on a click-driven step. Hiding it is what made
            the tour feel broken: no target, no way forward. */}
        <Button size="sm" onClick={() => (last ? close() : go(i + 1))}>
          {last ? 'Finish' : 'Next'}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Button
        data-tour="tutorial"
        variant="ghost"
        size="icon"
        title="Restart the tour"
        aria-label="Restart the tour"
        onClick={start}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      {/*
        Portalled to <body>. The button lives in the header, which carries
        backdrop-blur; backdrop-filter makes an element a containing block for
        position:fixed descendants, so without the portal this overlay was
        trapped inside the 56px-tall header and every step was mispositioned.
      */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100]" role="dialog" aria-label="Guided tour">
          {rect ? (
            <>
              {/* Four panels dim the page around the hole; the hole itself stays clickable. */}
              <div className="absolute bg-black/70" style={{ top: 0, left: 0, right: 0, height: rect.top }} />
              <div className="absolute bg-black/70" style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
              <div className="absolute bg-black/70" style={{ top: rect.top, height: rect.height, left: 0, width: rect.left }} />
              <div className="absolute bg-black/70" style={{ top: rect.top, height: rect.height, left: rect.left + rect.width, right: 0 }} />
              <div
                className="absolute rounded-xl ring-2 ring-primary pointer-events-none"
                style={{ top: rect.top - 3, left: rect.left - 3, width: rect.width + 6, height: rect.height + 6 }}
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-black/70" />
          )}

          {narrow ? (
            // A phone has no room to anchor a card beside a target, and the
            // measured-anchor maths put it off-screen. Dock it to the bottom.
            <div className="absolute inset-x-3 bottom-3">{card}</div>
          ) : rect ? (
            (() => {
              // Prefer below the element, fall back to above, and clamp to the
              // viewport last. The old fall-back was `rect.top - 214` with only a
              // Math.max(12) guard, so a target near the top of a short page
              // pushed the card off the top of the screen entirely.
              const CARD_H = 214;
              const CARD_W = 332;
              const GAP = 14;
              const PAD = 12;
              const below = rect.top + rect.height + GAP;
              const above = rect.top - CARD_H - GAP;
              const fitsBelow = below + CARD_H <= window.innerHeight - PAD;
              const fitsAbove = above >= PAD;
              const top = fitsBelow
                ? below
                : fitsAbove
                  ? above
                  : Math.max(PAD, Math.min(below, window.innerHeight - CARD_H - PAD));
              const left = Math.max(PAD, Math.min(rect.left, window.innerWidth - CARD_W - PAD));
              return (
                <div className="absolute" style={{ top, left }}>
                  {card}
                </div>
              );
            })()
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4">{card}</div>
          )}
          </div>,
          document.body,
        )}
    </>
  );
}