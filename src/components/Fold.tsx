import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@project/components/lib/utils';

/**
 * Foldable settings cards (ticket a2c65ddd).
 *
 * Settings pages had grown into a long scroll of open cards. Each card is now a
 * dropdown: the title stays, the body opens when clicked, and the page remembers
 * which ones were open on this browser. Nothing is stored on the server, so the
 * choice does not follow you to another device.
 */

const EVENT = 'ashtec-folds';
const keyOf = (page: string) => `ashtec-folds-${page}`;

function read(page: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(keyOf(page));
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function write(page: string, map: Record<string, boolean>) {
  try {
    localStorage.setItem(keyOf(page), JSON.stringify(map));
  } catch {
    /* private mode, or storage full: the fold still works for this page view */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: page }));
}

export function useFolds(page: string) {
  const [map, setMap] = useState<Record<string, boolean>>(() => read(page));
  useEffect(() => {
    const sync = () => setMap(read(page));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [page]);
  const isOpen = (id: string, fallback = false) => (id in map ? !!map[id] : fallback);
  const toggle = (id: string, fallback = false) => {
    const next = { ...read(page) };
    next[id] = !(id in next ? !!next[id] : fallback);
    write(page, next);
  };
  return { isOpen, toggle, setAll: (open: boolean, ids: string[]) => {
    const next = { ...read(page) };
    ids.forEach((id) => { next[id] = open; });
    write(page, next);
  } };
}

interface FoldProps {
  page: string;
  id: string;
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  pad?: 'p-5' | 'p-6';
  bodyClass?: string;
}

export default function Fold({ page, id, header, children, defaultOpen = false, pad = 'p-6', bodyClass }: FoldProps) {
  const { isOpen, toggle } = useFolds(page);
  const open = isOpen(id, defaultOpen);
  return (
    <div className="rounded-2xl border bg-card">
      <button
        type="button"
        onClick={() => toggle(id, defaultOpen)}
        aria-expanded={open}
        aria-controls={`fold-${page}-${id}`}
        title={open ? 'Close this section' : 'Open this section'}
        className={cn(
          'flex w-full items-start justify-between gap-3 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          pad,
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">{header}</div>
        <ChevronDown
          className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div id={`fold-${page}-${id}`} className={cn(pad === 'p-5' ? 'px-5 pb-5' : 'px-6 pb-6', bodyClass)}>
          {children}
        </div>
      )}
    </div>
  );
}
