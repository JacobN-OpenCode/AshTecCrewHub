import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard } from 'lucide-react';
import { MOD_KEY_LABEL } from '../lib/constants';

export interface Shortcut {
  /** A single character pressed after `g`, e.g. 'h'. */
  key: string;
  label: string;
  to: string;
}

/**
 * Batch 6: keyboard navigation.
 *
 * `g` then a letter jumps to a page, `?` opens the list, and Escape closes it.
 * The keys are only handled when the member is not typing, so a shortcut can
 * never eat a character in a form. Every destination is passed in from the
 * shell, so this can only offer pages that actually exist for this account
 * (an Actor, for instance, has no Roster to jump to).
 */
export default function KeyboardShortcuts({ shortcuts }: { shortcuts: Shortcut[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pending = useRef(false);
  const pendingTimer = useRef<number | null>(null);
  // A ref mirrors `shortcuts` so the listener does not have to be re-bound on
  // every render just to read the current list.
  const list = useRef(shortcuts);
  list.current = shortcuts;

  useEffect(() => {
    const clearPending = () => {
      pending.current = false;
      if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    };

    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && open) {
        setOpen(false);
        return;
      }
      if (isTyping(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'g' && !pending.current) {
        pending.current = true;
        // A short window: press the second key within it or the sequence lapses.
        pendingTimer.current = window.setTimeout(clearPending, 1200);
        return;
      }
      if (pending.current) {
        const hit = list.current.find((s) => s.key.toLowerCase() === e.key.toLowerCase());
        clearPending();
        if (hit) {
          e.preventDefault();
          navigate(hit.to);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
    };
  }, [navigate, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl border bg-background p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Search or jump to</dt>
            <dd><Kbd>{MOD_KEY_LABEL}</Kbd> <Kbd>K</Kbd></dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Show this list</dt>
            <dd><Kbd>?</Kbd></dd>
          </div>
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd><Kbd>G</Kbd> <Kbd>{s.key.toUpperCase()}</Kbd></dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">Shortcuts are ignored while you are typing in a field.</p>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border bg-muted px-1.5 font-mono text-xs font-medium text-foreground">
      {children}
    </kbd>
  );
}
