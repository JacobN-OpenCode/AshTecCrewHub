import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '#auth';
import {
  getLiveShowState, getMe, getLiveShowAdmins, enableLiveShowDevice, liveShowUnlockAdmin,
  adminLiveShowControl, adminLiveShowDevice, liveShowChat, liveShowAnnouncement, liveShowMovement,
} from '#api';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, KeyRound, Loader2, Play, Pause, RotateCcw, ChevronLeft, ChevronRight,
  ScrollText, Tv, Settings2, Users, Clapperboard, Lock, MessageSquare, Megaphone, ShieldAlert,
  Send, Monitor, Smartphone, Tablet, X, UserPlus, Pencil, Package,
} from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import ShowIdle from '../../components/ShowIdle';

type Cred = { memberId: string; secret: string; name: string };

type Board = {
  id: string;
  showId: string | null;
  name: string;
  areaName: string;
  status: string;
  open: boolean;
  timerMode: 'running' | 'stopped';
  timerStartAt: string | null;
  timerElapsedMs: number;
  currentSceneIndex: number;
  intermissionMinutes: number;
  movementAlert: boolean;
  movementMessage: string;
  movementSeconds: number;
  movementAdmins: string[];
};

type Scene = {
  id: string; label: string; title: string; minutes: number;
  cast: string[]; props: string[]; notes: string[]; sortIndex: number;
};

type ChatMessage = { id: string; authorName: string; body: string; kind: string; createdAt: string | null };
type Announcement = { id: string; body: string; authorName: string; seconds: number; expiresAt: string | null; createdAt: string | null };
type DeviceInfo = { id: string | null; name: string; movement: { alert: boolean; message: string; seconds: number; admins: string[] } };
type StatePayload = {
  open: boolean;
  hasShow: boolean;
  enabled: boolean;
  liveShow?: Board;
  device?: DeviceInfo;
  scenes?: Scene[];
  messages?: ChatMessage[];
  announcements?: Announcement[];
};

const STATE_KEY = 'ashtec-show-device-key';
const NAME_KEY = 'ashtec-show-device-name';

const statusMeta: Record<string, { label: string; dot: string; text: string }> = {
  standby: { label: 'STANDBY', dot: '#ff9f1c', text: 'text-amber-400' },
  rehearsal: { label: 'IN REHEARSAL', dot: '#4cc3ff', text: 'text-sky-400' },
  live: { label: 'LIVE', dot: '#ff4438', text: 'text-red-500' },
  intermission: { label: 'INTERMISSION', dot: '#d946ef', text: 'text-fuchsia-400' },
  finished: { label: 'FINISHED', dot: '#8b94a3', text: 'text-slate-400' },
};
const statusOf = (s: string) => statusMeta[s] ?? statusMeta.standby;

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};

const elapsedOf = (b: Board, now: number) => {
  const base = Number(b.timerElapsedMs ?? 0);
  if (b.timerMode === 'running' && b.timerStartAt) {
    const t = new Date(b.timerStartAt).getTime();
    if (Number.isFinite(t)) return base + Math.max(0, now - t);
  }
  return base;
};

const clockTime = (iso: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

const platformOf = () => {
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'Tablet';
  if (/Mobi|Android.+Mobile|iPhone|iPod|Windows Phone/i.test(ua)) return 'Mobile';
  return 'Desktop';
};

/** A stable per-browser id so the admin device list keys the same screen. */
function deviceKey(): string {
  try {
    let k = window.localStorage.getItem(STATE_KEY);
    if (!k) { k = crypto.randomUUID(); window.localStorage.setItem(STATE_KEY, k); }
    return k;
  } catch { return `d-${Math.random().toString(36).slice(2)}`; }
}
const sessionName = () => { try { return window.sessionStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const setSessionName = (n: string) => { try { window.sessionStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } };

const deviceIcon = (p: string) => (/Mobile/i.test(p) ? <Smartphone className="h-3.5 w-3.5" /> : /Tablet/i.test(p) ? <Tablet className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />);

const Panel = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('rounded-2xl border border-[#1e232d] bg-[#10131a]', className)}>{children}</div>
);

// ---------------------------------------------------------------- overlays

function AnnouncementOverlay({ items, onDismiss }: { items: Announcement[]; onDismiss: (id: string) => void }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setTick((t) => t + 1), 500); return () => window.clearInterval(id); }, []);
  const ann = items.find((a) => !a.expiresAt || new Date(a.expiresAt).getTime() > Date.now());
  if (!ann) return null;
  const left = ann.expiresAt ? Math.max(0, Math.ceil((new Date(ann.expiresAt).getTime() - Date.now()) / 1000)) : null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#050407]/85 p-6 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => onDismiss(ann.id)}>
      {/* Reads like a call over the tannoy: a lit crimson tab with a gold rule,
          not a dialog box. */}
      <div className="w-full max-w-[62vw] min-w-0 overflow-hidden rounded-sm border border-[#d9ab6c]/40 bg-[#7d1f2b] shadow-[0_60px_160px_-40px_rgba(0,0,0,0.95)] animate-in zoom-in-95 duration-300">
        <div className="h-1 w-full bg-[#d9ab6c]" />
        <div className="px-8 py-9 text-center md:px-12 md:py-12">
          <div className="flex items-center justify-center gap-2.5">
            <Megaphone className="h-4 w-4 text-[#f6e3c4]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.45em] text-[#f6e3c4]">Announcement</p>
          </div>
          {/* Ticket 97098a54: a single long word with no spaces must still wrap
              onto new lines, so allow breaking inside words. */}
          <div className="mt-5 text-4xl font-black leading-[1.05] tracking-tight whitespace-pre-wrap break-words text-white [overflow-wrap:anywhere] md:text-6xl">{ann.body}</div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="h-px w-10 bg-white/25" />
            <span className="font-mono text-sm uppercase tracking-[0.3em] text-white/80">{left === null ? 'Until cleared' : `${left}s`}</span>
            <span className="h-px w-10 bg-white/25" />
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-white/45">Tap anywhere to hide on this screen</p>
        </div>
      </div>
    </div>
  );
}

function MovementOverlay({ message, onAccept }: { message: string; onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#07060a]/92 p-6 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-sm border border-[#d9ab6c]/40 bg-[#141017] shadow-[0_0_80px_rgba(217,171,108,0.18)] animate-in zoom-in-95 duration-300">
        <div className="h-1 w-full bg-[#d9ab6c]" />
        <div className="space-y-4 p-7 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-[#d9ab6c]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-[#d9ab6c]">Screen moved</p>
          </div>
          <h2 className="text-2xl font-black leading-tight text-[#f8f3ea]">Please do not touch this screen</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#c8c2cd]">{message}</p>
          <Button onClick={onAccept} className="w-full">Accept and hide</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- enable / unlock

function EnableScreen({ showName, onEnabled }: { showName: string; onEnabled: (r: StatePayload) => void }) {
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [memberId, setMemberId] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState(sessionName() || platformOf());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { void getLiveShowAdmins({}).then((r) => setAdmins(r.admins)).catch(() => {}); }, []);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!memberId) { setErr('Pick which admin is setting up this screen.'); return; }
    if (!pin) { setErr('Enter that admin\'s cat-login PIN.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await enableLiveShowDevice({ deviceKey: deviceKey(), name: name.trim() || platformOf(), platform: platformOf(), userAgent: navigator.userAgent, memberId, pin });
      setSessionName(name.trim() || platformOf());
      onEnabled(r as StatePayload);
    } catch (e2) { setErr((e2 as Error).message); setBusy(false); }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-5">
        <div className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl border border-[#2a3040] bg-[#10131a] flex items-center justify-center">
            <Lock className="h-6 w-6 text-cream/60" />
          </div>
          <h2 className="text-2xl font-bold text-cream">Set up this screen</h2>
          <p className="text-sm text-[#9aa3b2]">Enable this device to show the live board{showName ? ` for ${showName}` : ''}. An admin must confirm with their cat-login PIN.</p>
        </div>
        <div className="rounded-2xl border border-[#2a3040] bg-[#0f1219] p-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-widest text-[#9aa3b2]">Admin</span>
            <select value={memberId} onChange={(e) => { setMemberId(e.target.value); setErr(''); }}
              className="w-full bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none">
              <option value="">Select an admin…</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-widest text-[#9aa3b2]">Cat-login PIN</span>
            <input type="password" value={pin} onChange={(e) => { setPin(e.target.value); setErr(''); }} autoComplete="off"
              placeholder="The admin's cat-login PIN"
              className="w-full bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none focus:border-[#3a4356]" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-widest text-[#9aa3b2]">Screen name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Stage Left"
              className="w-full bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none focus:border-[#3a4356]" />
          </label>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}Enable this screen
          </Button>
          {admins.length === 0 && <p className="text-[11px] text-[#525b6c]">No admins with a cat-login PIN could be found.</p>}
        </div>
      </form>
    </div>
  );
}

function UnlockModal({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: (c: Cred) => void }) {
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [memberId, setMemberId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { void getLiveShowAdmins({}).then((r) => setAdmins(r.admins)).catch(() => {}); }, []);
  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const r = await liveShowUnlockAdmin({ memberId, pin });
      onUnlocked({ memberId, secret: pin, name: r.admin.name });
    } catch (e) { setErr((e as Error).message || 'Those details are not right.'); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-[#2a3040] bg-[#10131a] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-cream/60" />
          <h2 className="font-bold text-cream">Unlock the controls</h2>
        </div>
        <p className="text-xs text-[#9aa3b2]">Pick an admin and enter their cat-login PIN. A second admin can unlock too.</p>
        <select value={memberId} onChange={(e) => { setMemberId(e.target.value); setErr(''); }} autoFocus
          className="w-full bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none">
          <option value="">Select an admin…</option>
          {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="password" value={pin} onChange={(e) => { setPin(e.target.value); setErr(''); }} autoComplete="off"
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onClose(); }}
          placeholder="Cat-login PIN"
          className="w-full bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none focus:border-[#3a4356]" />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || !memberId || !pin} onClick={() => void submit()}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Unlock controls
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- board

function BoardView({
  board, scenes, messages, canSend, onSend,
}: {
  board: Board;
  scenes: Scene[];
  messages: ChatMessage[];
  canSend: boolean;
  onSend: (body: string) => Promise<void>;
}) {
  // Ticket a7bb2d2c: admins wanted to type from the board itself instead of
  // unlocking the control panel, which hides half the screen mid-show.
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try { await onSend(body); setDraft(''); } catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);

  const meta = statusOf(board.status);
  const live = board.status === 'live';
  const current: Scene | undefined = scenes[board.currentSceneIndex];
  const upNext = scenes[board.currentSceneIndex + 1];
  const sceneNo = board.currentSceneIndex + 1;
  const total = scenes.length;

  // Ticket f873ba01: the on-screen chat is newest-first, so a new message lands
  // at the top instead of pushing everything down. When one arrives, ease back
  // to the top; older messages stay reachable by scrolling down.
  const listRef = useRef<HTMLDivElement | null>(null);
  const newestId = messages.length ? messages[messages.length - 1].id : null;
  const seenFirst = useRef(false);
  useEffect(() => {
    if (!seenFirst.current) { seenFirst.current = true; return; }
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [newestId]);
  const ordered = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <main className="relative flex-1 min-h-0 overflow-hidden">
      {/* One painted layer rather than a stack of cards: a warm pool of light
          from above the pros arch, falling off to ink. These screens are looked
          at from the wings, so the light does the sectioning, not borders. */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(135% 90% at 50% -30%, #241b21 0%, #141016 45%, #08070a 100%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[26px] border border-[#f3ece1]/10 md:inset-5 md:rounded-[34px]" />

      <div className="relative mx-auto flex h-full w-full max-w-[1900px] flex-col gap-4 px-5 py-4 md:gap-6 md:px-10 md:py-6">
        <header className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', live && 'animate-pulse')} style={{ background: meta.dot, boxShadow: live ? `0 0 18px ${meta.dot}` : 'none' }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.42em]" style={{ color: meta.dot }}>{meta.label}</span>
            </div>
            <h1 className="mt-1.5 truncate text-xl font-semibold tracking-tight text-[#f6f0e6] md:text-2xl">{board.name}</h1>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.32em] text-[#7e7a86]">
              {board.areaName}{total > 0 ? ` · Scene ${Math.max(1, sceneNo)} of ${total}` : ''}
            </p>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#7e7a86]">Show clock</p>
            <p key={board.timerMode} className={cn('font-mono text-5xl leading-none tabular-nums md:text-7xl', board.timerMode === 'running' ? 'text-[#f8f3ea]' : 'text-[#9b96a3]')}>{fmt(elapsedOf(board, now))}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-[#5d5964]">{board.timerMode === 'running' ? 'Running' : 'Stopped'}</p>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 md:gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          {/* ---- the scene, as big as the glass allows ---- */}
          <section className="relative flex min-h-0 flex-col">
            {sceneNo > 0 && (
              <span aria-hidden className="pointer-events-none absolute -top-6 right-0 select-none font-black leading-none text-[#f3ece1]/[0.04]" style={{ fontSize: 'clamp(5rem, 16vw, 15rem)' }}>
                {String(sceneNo).padStart(2, '0')}
              </span>
            )}

            {current ? (
              <>
                <div className="relative flex items-baseline gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.4em] text-[#d9ab6c]">{current.label || `Scene ${sceneNo}`}</span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7e7a86]">{current.minutes} min</span>
                </div>
                {/* Keyed on the scene so switching scenes animates the title in. */}
                <h2 key={current.id} className="relative mt-2 text-[clamp(2rem,5.4vw,4.5rem)] font-black leading-[0.94] tracking-[-0.02em] text-[#f8f3ea] animate-in fade-in slide-in-from-bottom-1 duration-500">
                  {current.title || 'Untitled scene'}
                </h2>

                {current.cast.length > 0 && (
                  <div className="mt-5">
                    <p className="text-[10px] uppercase tracking-[0.4em] text-[#7e7a86]">On stage</p>
                    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1.5">
                      {current.cast.map((c) => (
                        <span key={c} className="rounded-full border border-[#f3ece1]/20 px-3 py-1 text-sm font-medium text-[#efe6d8] md:text-base">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {current.props.length > 0 && (
                  <div className="mt-5 border-t border-[#d9ab6c]/25 pt-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-[#d9ab6c]" />
                      <p className="text-[10px] uppercase tracking-[0.4em] text-[#d9ab6c]">Props</p>
                    </div>
                    <div key={current.id} className="mt-2 flex flex-wrap gap-2 animate-in fade-in duration-500">
                      {current.props.map((p) => (
                        <span key={p} className="rounded-md bg-[#d9ab6c]/12 px-2.5 py-1 text-sm font-semibold text-[#f0dcbb] md:text-base">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {current.notes.length > 0 && (
                  <ul className="mt-5 space-y-1.5 border-t border-[#f3ece1]/10 pt-3">
                    {current.notes.map((n, i) => (
                      <li key={i} className="flex gap-2.5 text-sm leading-snug text-[#c8c2cd] md:text-base">
                        <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rotate-45 bg-[#d9ab6c]/70" />
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="mt-4 max-w-md text-lg leading-snug text-[#7e7a86]">
                No scene set yet. The board fills in as soon as the show is running.
              </p>
            )}

            {/* Where we are in the evening, at a glance from across the wings. */}
            {scenes.length > 1 && (
              <div className="mt-auto pt-5">
                <div className="flex items-baseline justify-between">
                  <p className="text-[10px] uppercase tracking-[0.4em] text-[#7e7a86]">Running order</p>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-[#5d5964]">{Math.max(1, sceneNo)} / {total}</p>
                </div>
                <div className="mt-2 flex gap-1">
                  {scenes.map((s, i) => (
                    <div
                      key={s.id}
                      title={`${s.label || `Scene ${i + 1}`} · ${s.title}`}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors duration-500',
                        i === board.currentSceneIndex ? 'bg-[#d9ab6c]' : i < board.currentSceneIndex ? 'bg-[#f3ece1]/25' : 'bg-[#f3ece1]/10',
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="flex min-h-0 flex-col gap-4">
            <div className="border-l-2 border-[#d9ab6c]/50 pl-3.5">
              <div className="flex items-center gap-2 text-[#7e7a86]">
                <Clapperboard className="h-3.5 w-3.5" />
                <p className="text-[10px] uppercase tracking-[0.4em]">Up next</p>
              </div>
              {upNext ? (
                <>
                  <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#7e7a86]">{upNext.label || `Scene ${sceneNo + 1}`} · {upNext.minutes} min</p>
                  <p key={upNext.id} className="text-xl font-bold leading-tight text-[#efe6d8] md:text-2xl animate-in fade-in duration-300">{upNext.title || 'Untitled scene'}</p>
                  {upNext.cast.length > 0 && <p className="mt-1 text-xs leading-snug text-[#8f8a97]">{upNext.cast.join(' · ')}</p>}
                </>
              ) : (
                <p className="mt-1.5 text-sm text-[#8f8a97]">Last scene of the show.</p>
              )}
            </div>

            <div className="flex min-h-[8rem] flex-1 flex-col border-t border-[#f3ece1]/10 pt-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-[#7e7a86]" />
                <p className="text-[10px] uppercase tracking-[0.4em] text-[#7e7a86]">Crew channel</p>
                {live && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-[#5d5964]">Newest first</span>
              </div>
              <div ref={listRef} className="mt-2 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                {ordered.length === 0 && <p className="text-sm text-[#6f6a77]">Nothing said yet.</p>}
                {ordered.map((m) => (
                  <div
                    key={m.id}
                    className={cn('border-l-2 pl-2.5 animate-in fade-in slide-in-from-top-1 duration-300', m.kind === 'announcement' ? 'border-[#d9ab6c]' : 'border-[#f3ece1]/12')}
                  >
                    <div className="flex items-baseline gap-2">
                      {m.kind === 'announcement' && <Megaphone className="h-3 w-3 shrink-0 text-[#d9ab6c]" />}
                      <span className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a9a3b0]">{m.authorName || 'Admin'}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-[#5d5964]">{clockTime(m.createdAt)}</span>
                    </div>
                    <p className={cn('mt-0.5 text-sm leading-snug whitespace-pre-wrap break-words', m.kind === 'announcement' ? 'text-[#f0dcbb]' : 'text-[#e3dde7]')}>{m.body}</p>
                  </div>
                ))}
              </div>
              {canSend && (
                <div className="mt-2 flex items-center gap-2 border-t border-[#f3ece1]/10 pt-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={500}
                    placeholder="Message the cast…"
                    aria-label="Send a chat message"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-[#f6f0e6] outline-none placeholder:text-[#5d5964]"
                  />
                  <Button size="sm" variant="ghost" disabled={sending || !draft.trim()} onClick={() => void send()} aria-label="Send">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- control panel

function ControlPanel({
  board, scenes, messages, device, cred, onAddAdmin, onClose, onRefresh,
}: {
  board: Board;
  scenes: Scene[];
  messages: ChatMessage[];
  device: DeviceInfo;
  cred: Cred;
  onAddAdmin: () => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [text, setText] = useState('');
  const [annText, setAnnText] = useState('');
  const [annSeconds, setAnnSeconds] = useState(30);
  const [annUntilCleared, setAnnUntilCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState(device.name);
  const [movement, setMovement] = useState(device.movement);
  const [savingScreen, setSavingScreen] = useState(false);

  useEffect(() => { void getLiveShowAdmins({}).then((r) => setAdmins(r.admins.map((a) => ({ id: a.id, name: a.name })))).catch(() => {}); }, []);
  useEffect(() => { setName(device.name); setMovement(device.movement); }, [device]);

  const control = async (action: string, extra?: { status?: string; sceneIndex?: number }) => {
    try { await adminLiveShowControl({ liveShowId: board.id, action, ...extra, memberId: cred.memberId, secret: cred.secret }); onRefresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const sendChat = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try { await liveShowChat({ liveShowId: board.id, body, memberId: cred.memberId, secret: cred.secret }); setText(''); onRefresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const announce = async () => {
    const body = annText.trim();
    if (!body) return;
    setBusy(true);
    try {
      const seconds = annUntilCleared ? 0 : Math.min(145, Math.max(2, Math.floor(annSeconds) || 30));
      await liveShowAnnouncement({ liveShowId: board.id, body, seconds, memberId: cred.memberId, secret: cred.secret });
      setAnnText(''); toast.success('Announcement is on every screen'); onRefresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const saveScreen = async () => {
    setSavingScreen(true);
    try {
      await adminLiveShowDevice({
        deviceId: device.id ?? undefined, deviceKey: deviceKey(), name: name.trim(),
        movementAlert: movement.alert, movementMessage: movement.message,
        movementSeconds: Math.min(600, Math.max(2, Math.floor(movement.seconds) || 30)),
        movementAdmins: movement.admins, memberId: cred.memberId, secret: cred.secret,
      });
      toast.success('This screen was updated'); onRefresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingScreen(false); }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] border-t border-[#2a3040] bg-[#0b0d12]/98 backdrop-blur">
      <div className="max-w-5xl mx-auto p-4 space-y-4 max-h-[82vh] overflow-y-auto">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-cream/60" />
          <h2 className="font-bold text-cream">Controls</h2>
          <div className="ml-2 flex flex-wrap items-center gap-1.5">
            {cred && <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">{cred.name}</span>}
          </div>
          <button onClick={onAddAdmin} className="ml-auto flex items-center gap-1 text-xs text-cream/60 hover:text-cream"><UserPlus className="h-3.5 w-3.5" />Add admin</button>
          <button onClick={onClose} className="text-cream/60 hover:text-cream" aria-label="Close controls"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-[#9aa3b2] mr-1">Status</span>
          {(['standby', 'rehearsal', 'live', 'intermission', 'finished'] as const).map((s) => (
            <Button key={s} size="sm" variant={board.status === s ? 'default' : 'outline'} onClick={() => void control('status', { status: s })}>{statusOf(s).label}</Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[#1e232d] pt-3">
          <Button size="sm" variant="outline" disabled={board.currentSceneIndex <= 0} onClick={() => void control('scene', { sceneIndex: board.currentSceneIndex - 1 })}>
            <ChevronLeft className="h-4 w-4" />Prev
          </Button>
          {board.timerMode === 'running'
            ? <Button size="sm" variant="outline" onClick={() => void control('pause')}><Pause className="h-4 w-4 mr-1" />Pause</Button>
            : <Button size="sm" variant="outline" onClick={() => void control('start')}><Play className="h-4 w-4 mr-1" />Start</Button>}
          <Button size="sm" variant="outline" onClick={() => void control('reset')}><RotateCcw className="h-4 w-4 mr-1" />Reset clock</Button>
          <Button size="sm" variant="outline" onClick={() => void control('scene', { sceneIndex: board.currentSceneIndex + 1 })}>Next<ChevronRight className="h-4 w-4" /></Button>
          <span className="ml-auto text-xs text-[#525b6c]">Space play/pause · ← → scene · Esc close</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-[#9aa3b2]">Announcement</p>
            <textarea value={annText} onChange={(e) => setAnnText(e.target.value)} rows={2} maxLength={500}
              placeholder="Broadcast to every screen…"
              className="w-full bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none resize-y placeholder:text-[#525b6c]" />
            <div className="flex flex-wrap items-center gap-2">
              <input type="number" min={2} max={145} value={annSeconds} disabled={annUntilCleared} onChange={(e) => setAnnSeconds(Number(e.target.value))}
                className="w-20 bg-[#0b0d12] border border-[#1e232d] rounded-lg px-2 py-1.5 text-sm text-cream outline-none disabled:opacity-40" />
              <span className="text-xs text-[#9aa3b2]">sec</span>
              <label className="flex items-center gap-1 text-xs text-[#9aa3b2]">
                <input type="checkbox" checked={annUntilCleared} onChange={(e) => setAnnUntilCleared(e.target.checked)} />until cleared
              </label>
              <Button size="sm" className="ml-auto" disabled={busy || !annText.trim()} onClick={() => void announce()}>
                <Megaphone className="h-4 w-4 mr-1" />Announce
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-[#9aa3b2]">Chat</p>
            <div className="flex items-center gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Message the cast…"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
                className="flex-1 bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none placeholder:text-[#525b6c]" />
              <Button size="sm" disabled={busy || !text.trim()} onClick={() => void sendChat()}><Send className="h-4 w-4" /></Button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {messages.slice(-8).map((m) => <p key={m.id} className="text-xs text-[#9aa3b2]"><span className="text-cream/70">{m.authorName}:</span> {m.body}</p>)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#2a3040] bg-[#0f1219] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            <span className="text-xs uppercase tracking-widest text-[#9aa3b2]">This screen</span>
            <label className="ml-auto flex items-center gap-1 text-xs text-[#9aa3b2]">
              <input type="checkbox" checked={movement.alert} onChange={(e) => setMovement({ ...movement, alert: e.target.checked })} />alerts on
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Screen name (e.g. Stage Left)"
              className="w-44 bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-1.5 text-sm text-cream outline-none" />
            <input value={movement.message} maxLength={400} onChange={(e) => setMovement({ ...movement, message: e.target.value })} placeholder="Message shown when bumped"
              className="flex-1 min-w-[200px] bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-1.5 text-sm text-cream outline-none" />
            <input type="number" min={2} max={600} value={movement.seconds} onChange={(e) => setMovement({ ...movement, seconds: Number(e.target.value) })}
              className="w-20 bg-[#0b0d12] border border-[#1e232d] rounded-lg px-2 py-1.5 text-sm text-cream outline-none" />
            <span className="text-xs text-[#9aa3b2]">sec</span>
            <Button size="sm" disabled={savingScreen} onClick={() => void saveScreen()}>
              {savingScreen ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Pencil className="h-3.5 w-3.5 mr-1" />}Save
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {admins.map((a) => {
              const on = movement.admins.includes(a.id);
              return (
                <button type="button" key={a.id}
                  onClick={() => setMovement({ ...movement, admins: on ? movement.admins.filter((id) => id !== a.id) : [...movement.admins, a.id] })}
                  className={cn('rounded-full border px-2.5 py-1 text-[11px] transition', on ? 'border-amber-400/70 bg-amber-400/15 font-medium text-amber-200' : 'border-[#2a3040] text-[#9aa3b2] hover:border-amber-400/50')}>
                  {a.name}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[#525b6c]">Push a bump/key warning to the selected admins for THIS screen.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- top bar

function DashTopBar({ title, subtitle, right }: { title: string; subtitle: string; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="dash-topbar sticky top-0 z-30 border-b border-[#1e232d] bg-[#07080a]/90 backdrop-blur">
      <div className="max-w-[1800px] mx-auto px-4 h-14 flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => (window.history.state?.idx ? navigate(-1) : navigate('/'))}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-baseline gap-2 min-w-0">
          <Tv className="h-4 w-4 text-cream/50 shrink-0" />
          <h1 className="font-bold truncate text-cream">{title}</h1>
          <span className="text-xs text-[#9aa3b2] truncate">{subtitle}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">{right}</div>
      </div>
    </header>
  );
}

export default function LiveShowDash() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'boot' | 'idle' | 'enable' | 'board'>('boot');
  const [board, setBoard] = useState<Board | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [panel, setPanel] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [move, setMove] = useState<{ message: string } | null>(null);

  const cred = creds[0] ?? null;

  const apply = useCallback((r: StatePayload) => {
    // No show running (or none set up at all): show only the cat idle screen -
    // no board, no scenes, no enable/PIN. An open-but-unenabled show still gets
    // the enable screen below so a screen can be brought online before it starts.
    if (!r.open) { setPhase('idle'); setDevice(null); setBoard(null); return; }
    if (!r.enabled) { setPhase('enable'); setBoard(r.liveShow ?? null); return; }
    setBoard(r.liveShow as Board);
    setScenes((r.scenes ?? []) as Scene[]);
    setMessages((r.messages ?? []) as ChatMessage[]);
    setAnnouncements((r.announcements ?? []) as Announcement[]);
    setDevice((r.device as DeviceInfo) ?? null);
    setPhase('board');
  }, []);

  // Chat straight from the board: the unlocked device credentials if the panel
  // is open, otherwise the signed-in admin session (the server rejects anyone
  // who is not an admin, so a crew phone simply gets the error).
  const refreshRef = useRef<() => Promise<unknown>>(async () => null);
  const sendBoardChat = useCallback(async (body: string) => {
    if (!board) return;
    await liveShowChat({ liveShowId: board.id, body, ...(cred ? { memberId: cred.memberId, secret: cred.secret } : {}) });
    await refreshRef.current();
  }, [board, cred]);

  const refresh = useCallback(async () => {
    try {
      const r = await getLiveShowState({ deviceKey: deviceKey(), platform: platformOf(), userAgent: navigator.userAgent });
      apply(r as StatePayload);
    } catch { return null; }
  }, [apply]);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  const control = useCallback(async (action: string, extra?: { status?: string; sceneIndex?: number }) => {
    if (!cred || !board) return;
    const act = action === 'start' && board.timerMode === 'running' ? 'pause' : action;
    try {
      await adminLiveShowControl({ liveShowId: board.id, action: act, ...extra, memberId: cred.memberId, secret: cred.secret });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }, [cred, board, refresh]);
  const controlRef = useRef(control);
  useEffect(() => { controlRef.current = control; }, [control]);

  // Movement alert bookkeeping, kept in refs so they survive effect re-runs.
  const moveRef = useRef<{ message: string } | null>(null);
  const armedRef = useRef(true);
  const idleRef = useRef<number | null>(null);
  useEffect(() => { moveRef.current = move; }, [move]);

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      if (user) { try { const me = await getMe({}); setIsAdmin(!!me.member?.isAdmin); } catch { /* ignore */ } }
      await refresh();
    })();
  }, [authLoading, user, refresh]);

  useEffect(() => {
    if (phase === 'boot' || phase === 'idle' || phase === 'enable' || phase === 'board') {
      const id = window.setInterval(() => { void refresh(); }, 5000);
      const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
      document.addEventListener('visibilitychange', onVis);
      return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
    }
  }, [phase, refresh]);

  // Closing the panel always discards the admin credentials, so the next
  // unlock (or a "close" that just tidies up) can never reuse a stale login.
  const closePanel = useCallback(() => { setPanel(false); setCreds([]); }, []);

  // 3x spacebar opens the controls. Every unlock requires a fresh admin login:
  // any credentials from a previous unlock are dropped and the PIN prompt is
  // always shown, so a device left unattended cannot be driven without a PIN.
  useEffect(() => {
    if (phase !== 'board' || panel) return;
    const times: number[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT')) return;
      const now = Date.now();
      while (times.length && now - times[0] > 800) times.shift();
      times.push(now);
      if (times.length >= 3) {
        times.length = 0; e.preventDefault();
        setCreds([]);
        setUnlock(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, panel]);

  // Movement / key alerts for THIS screen (suppressed while the panel is open).
  // Cursor movement, a physical bump and any key press all count. Once the
  // warning is accepted the screen stays quiet while it keeps being used, and
  // only re-arms after `movement.seconds` of no activity.
  useEffect(() => {
    if (phase !== 'board' || panel || !device?.movement.alert) return;
    const idleMs = Math.max(2, device.movement.seconds) * 1000;
    const noteActivity = (kind: 'movement' | 'key') => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
      idleRef.current = window.setTimeout(() => { armedRef.current = true; }, idleMs);
      if (!armedRef.current || moveRef.current) return;
      armedRef.current = false;
      void liveShowMovement({ deviceKey: deviceKey(), action: 'moved', kind })
        .then((r) => { const rr = r as { ok?: boolean; alert?: boolean; message?: string }; if (rr.ok && rr.alert === true) setMove({ message: rr.message || 'Please do not touch this screen.' }); })
        .catch(() => {});
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0) + Math.abs(a.z ?? 0);
      if (mag > 32) noteActivity('movement');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT')) return;
      noteActivity('key');
    };
    const onPointer = () => noteActivity('movement');
    const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (DM?.requestPermission) void DM.requestPermission().catch(() => 'denied');
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onPointer);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [phase, panel, device?.movement.alert, device?.movement.seconds]);

  // Esc closes the panel and also is the panel idle-timeout (20s).
  useEffect(() => {
    if (!panel) return;
    let idle = window.setTimeout(() => closePanel(), 20_000);
    const bump = () => { window.clearTimeout(idle); idle = window.setTimeout(() => closePanel(), 20_000); };
    const onKey = (e: KeyboardEvent) => {
      bump();
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT');
      if (e.code === 'Escape') { closePanel(); return; }
      if (typing) return;
      if (e.code === 'Space') { e.preventDefault(); void controlRef.current?.('start'); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); void controlRef.current?.('scene', { sceneIndex: Math.max(0, (board?.currentSceneIndex ?? 0) - 1) }); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); void controlRef.current?.('scene', { sceneIndex: (board?.currentSceneIndex ?? 0) + 1 }); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', bump);
    window.addEventListener('touchstart', bump);
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('touchstart', bump);
    };
  }, [panel, board?.currentSceneIndex, closePanel]);

  const acceptMove = useCallback(async () => {
    setMove(null);
    try { await liveShowMovement({ deviceKey: deviceKey(), action: 'ack' }); } catch { /* ignore */ }
  }, []);

  const onEnabled = (r: StatePayload) => { apply({ ...r, hasShow: true, enabled: true }); };

  if (phase === 'boot') {
    return (
      <div className="min-h-screen bg-[#07080a] text-cream flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cream/60" />
      </div>
    );
  }

  const title = board?.name || 'Live Show';
  const subtitle = board ? board.areaName : '';
  const visibleAnnouncements = announcements.filter((a) => !dismissed.includes(a.id));

  return (
    <div className="min-h-screen bg-[#07080a] text-cream flex flex-col">
      {/* No show running: the idle screen is all there is, so it gets the whole
          page with no top bar competing with it. */}
      {phase === 'idle' && <ShowIdle />}

      {phase !== 'idle' && (
        <DashTopBar title={title} subtitle={subtitle} right={
          isAdmin && phase === 'enable' ? (
            <Button size="sm" variant="outline" onClick={() => navigate('/admin/live-show')}>
              <Settings2 className="h-4 w-4 mr-1.5" />Show Setup
            </Button>
          ) : undefined
        } />
      )}

      {phase === 'enable' && <EnableScreen showName={board?.name ?? ''} onEnabled={onEnabled} />}

      {phase === 'board' && board && (
        <BoardView
          board={board}
          scenes={scenes}
          messages={messages}
          canSend={!!cred || isAdmin}
          onSend={sendBoardChat}
        />
      )}

      {board && !board.open && phase === 'board' && (
        <div className="border-t border-[#1e232d] bg-[#0b0d12]/80 px-4 py-1.5 text-center text-[11px] text-[#9aa3b2]">Show not started yet</div>
      )}

      {visibleAnnouncements.length > 0 && (
        <AnnouncementOverlay items={visibleAnnouncements} onDismiss={(id) => setDismissed((d) => [...d, id])} />
      )}
      {move && <MovementOverlay message={move.message} onAccept={() => void acceptMove()} />}

      {unlock && (
        <UnlockModal onClose={() => setUnlock(false)} onUnlocked={(c) => { setCreds((cs) => cs.some((x) => x.memberId === c.memberId) ? cs : [...cs, c]); setUnlock(false); setPanel(true); }} />
      )}

      {panel && board && device && cred && (
        <ControlPanel
          board={board} scenes={scenes} messages={messages} device={device} cred={cred}
          onAddAdmin={() => { setPanel(false); setUnlock(true); }}
          onClose={closePanel}
          onRefresh={() => { void refresh(); }}
        />
      )}
    </div>
  );
}
