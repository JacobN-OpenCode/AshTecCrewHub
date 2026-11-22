/**
 * Themed replacements for window.confirm / alert / prompt.
 *
 * Ticket 9048bb91: the delete button on Admin > MCP looked broken. It was not.
 * It called window.confirm, and the macOS app's web view does not draw those
 * native dialogs, so the promise of a confirmation never appeared and the click
 * did nothing. Anything that asks the user something has to be drawn in the
 * page, not by the browser.
 *
 * `ask()` is called from an event handler and awaited like confirm(), so the
 * call sites stay one line. Confirm resolves true, cancel or Escape resolves
 * false. `say()` is the alert() replacement and always resolves true.
 *
 * Ticket 183f94e4: the Deploy button on Server > Logs did nothing when clicked.
 * The question appeared over the open log dialog, but a modal Radix dialog sets
 * `pointer-events: none` on the body and only re-enables it inside its own
 * layer, so every click on this dialog landed on nothing. The container turns
 * pointer events back on and stops the press reaching the dialog underneath,
 * otherwise Radix reads it as a click outside and closes that dialog, taking
 * the deploy steps with it.
 */
import { useEffect, useRef, useState } from 'react';

export type AskOptions = {
  title: string;
  body?: string;
  /** Label on the confirming button. Defaults to "Yes". */
  confirm?: string;
  /** Label on the button that does nothing. Defaults to "Cancel". */
  cancel?: string;
  /** Paints the confirming button red. Use it for anything destructive. */
  danger?: boolean;
};

type Request = AskOptions & { id: number; resolve: (ok: boolean) => void };

let nextId = 1;
let pending: Request | null = null;
const listeners = new Set<(r: Request | null) => void>();

function publish(r: Request | null) {
  pending = r;
  listeners.forEach((fn) => fn(pending));
}

/** Ask a question. Resolves true if the person agreed. */
export function ask(options: AskOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // A second question while one is open would strand the first promise, so
    // the older one is cancelled rather than silently dropped.
    pending?.resolve(false);
    // ask() always offers a way out; say() is the one that passes cancel: ''.
    publish({ ...options, cancel: options.cancel ?? 'Cancel', id: nextId++, resolve });
  });
}

/** Tell the person something. One button, resolves when it is dismissed. */
export function say(title: string, body?: string): Promise<boolean> {
  return ask({ title, body, confirm: 'OK', cancel: '' });
}

export default function DialogHost() {
  const [request, setRequest] = useState<Request | null>(pending);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const fn = (r: Request | null) => setRequest(r);
    listeners.add(fn);
    setRequest(pending);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      // Capture phase, and stop it here: a dialog underneath is also listening
      // for Escape and would close itself and everything it was showing.
      e.stopPropagation();
      close(e.key === 'Enter');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  function close(ok: boolean) {
    if (!request) return;
    const r = request;
    publish(null);
    r.resolve(ok);
  }

  if (!request) return null;
  const single = !request.cancel;

  return (
    // `pointerEvents` is inline on purpose: a dialog underneath sets `none` on
    // the body, and this is the one rule that has to beat it.
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      style={{ pointerEvents: 'auto' }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => close(false)}
      />
      <div className="relative w-full max-w-md rounded-[var(--radius)] border border-border bg-card p-6 shadow-2xl">
        <h2 id="dialog-title" className="text-lg font-semibold text-card-foreground">
          {request.title}
        </h2>
        {request.body && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{request.body}</p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {!single && (
            <button
              type="button"
              onClick={() => close(false)}
              className="rounded-[var(--radius)] border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {request.cancel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => close(true)}
            className="rounded-[var(--radius)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{
              backgroundColor: request.danger
                ? 'hsl(var(--destructive))'
                : 'hsl(var(--primary))',
              color: request.danger ? 'hsl(var(--destructive-foreground, 0 0% 100%))' : 'hsl(var(--primary-foreground))',
            }}
          >
            {request.confirm ?? 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
}
