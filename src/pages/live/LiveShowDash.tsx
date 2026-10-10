import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '#auth';
import {
  getLiveShowState, getLiveShowMember, adminLiveShowControl,
  liveShowChat, liveShowAnnouncement, liveShowMovement, getMe, getCatLoginAdmins, getLiveShowAdmins,
  type GetLiveShowStateOutputType, type GetLiveShowMemberOutputType,
} from '#api';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, KeyRound, Loader2, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, ChevronDown,
  ScrollText, Tv, Settings2, Users, Clapperboard, Lock, ExternalLink, MessageSquare,
  Send, Megaphone, Radio, Monitor, Smartphone, Tablet, ShieldAlert, LayoutGrid, ListTree, X,
} from 'lucide-react';
import { cn } from '@project/components/lib/utils';

type GuestState = GetLiveShowStateOutputType;
type MemberState = GetLiveShowMemberOutputType;

type Scene = {
  id: string;
  label: string;
  title: string;
  minutes: number;
  cast: string[];
  props: string[];
  notes: string[];
  sortIndex: number;
};

type Board = {
  id: string;
  name: string;
  areaName: string;
  status: string;
  timerMode: 'running' | 'stopped';
  timerStartAt: string | null;
  timerElapsedMs: number;
  currentSceneIndex: number;
  intermissionMinutes: number;
  crewCanEdit?: boolean;
  movementAlert?: boolean;
  movementMessage?: string;
  movementSeconds?: number;
  movementAdmins?: string[];
};

type Scripts = { sharedLink: string } | null;
type ChatMessage = { id: string; author: string | null; authorName: string; body: string; kind: string; createdAt: string | null };
type Announcement = { id: string; body: string; authorName: string; seconds: number; expiresAt: string | null; createdAt: string | null };
type DeviceRow = { id: string; deviceKey: string; name: string; platform: string; userAgent: string; member: string | null; online: boolean; adminView: boolean; lastSeenAt: string | null; lastMovementAt: string | null; connectedSince: string | null };
type AdminRow = { id: string; name: string };
type Identity = { email: string; secret: string } | null;

const GUEST_CODE_KEY = 'ashtec-show-code';
const DEVICE_KEY = 'ashtec-show-device';
const DEVICE_NAME = 'ashtec-show-device-name';
const VIEW_KEY = 'ashtec-show-view';

const statusMeta: Record<string, { label: string; dot: string; text: string; ring: string }> = {
  standby: { label: 'STANDBY', dot: '#ff9f1c', text: 'text-amber-400', ring: 'border-amber-400/40' },
  rehearsal: { label: 'IN REHEARSAL', dot: '#4cc3ff', text: 'text-sky-400', ring: 'border-sky-400/40' },
  live: { label: 'LIVE', dot: '#ff4438', text: 'text-red-500', ring: 'border-red-500/50' },
  intermission: { label: 'INTERMISSION', dot: '#d946ef', text: 'text-fuchsia-400', ring: 'border-fuchsia-400/40' },
  finished: { label: 'FINISHED', dot: '#8b94a3', text: 'text-slate-400', ring: 'border-slate-400/30' },
};
const statusOf = (s: string) => statusMeta[s] ?? statusMeta.standby;

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${m}:${String(ss).padStart(2, '0')}`;
};

const elapsedOf = (b: Board, now: number) => {
  const base = Number(b.timerElapsedMs ?? 0);
  if (b.timerMode === 'running' && b.timerStartAt) {
    const t = new Date(b.timerStartAt).getTime();
    if (Number.isFinite(t)) return base + Math.max(0, now - t);
  }
  return base;
};

const relTime = (iso: string | null) => {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
};

const clockTime = (iso: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

/** A stable per-browser id so the admin device list does not grow per poll. */
function deviceKey(): string {
  try {
    let k = localStorage.getItem(DEVICE_KEY);
    if (!k) {
      k = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(DEVICE_KEY, k);
    }
    return k;
  } catch { return 'unknown-device'; }
}

function deviceName(): string {
  try {
    let n = localStorage.getItem(DEVICE_NAME);
    if (!n) {
      n = platformOf();
      localStorage.setItem(DEVICE_NAME, n);
    }
    return n;
  } catch { return platformOf(); }
}

function platformOf(): string {
  return deviceTypeOf(navigator.userAgent);
}

/** Desktop / Tablet / Mobile, from a user agent. */
function deviceTypeOf(ua: string): string {
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'Tablet';
  if (/Mobi|Android.+Mobile|iPhone|iPod|Windows Phone/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

/** A human OS name, as specific as the user agent allows. */
function osOf(ua: string): string {
  const m = (re: RegExp) => re.exec(ua)?.[1]?.replace(/_/g, '.');
  if (/iPhone|iPad|iPod/i.test(ua)) return `iOS ${m(/OS (\d+[._]\d+)/) ?? ''}`.trim();
  if (/Android/i.test(ua)) return `Android ${m(/Android (\d+(?:\.\d+)?)/) ?? ''}`.trim();
  if (/Windows NT 10/i.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/i.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.1/i.test(ua)) return 'Windows 7';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Mac OS X/i.test(ua)) return `macOS ${(m(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/) ?? '').split('.').slice(0, 2).join('.')}`.trim();
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown OS';
}

/** A human browser name (and major version), from a user agent. */
function browserOf(ua: string): string {
  const ver = (re: RegExp) => re.exec(ua)?.[1] ?? '';
  if (/Edg\//i.test(ua)) return `Edge ${ver(/Edg\/(\d+)/)}`.trim();
  if (/OPR\/|Opera/i.test(ua)) return `Opera ${ver(/OPR\/(\d+)/)}`.trim();
  if (/SamsungBrowser/i.test(ua)) return `Samsung Internet ${ver(/SamsungBrowser\/(\d+)/)}`.trim();
  if (/Firefox\/|FxiOS/i.test(ua)) return `Firefox ${ver(/(?:Firefox|FxiOS)\/(\d+)/)}`.trim();
  if (/CriOS/i.test(ua)) return `Chrome iOS ${ver(/CriOS\/(\d+)/)}`.trim();
  if (/Chrome\//i.test(ua)) return `Chrome ${ver(/Chrome\/(\d+)/)}`.trim();
  if (/Safari\//i.test(ua)) return `Safari ${ver(/Version\/(\d+)/)}`.trim();
  return 'Unknown browser';
}

/** "Desktop · macOS 14 · Chrome 121" for the device list. */
function describeDevice(d: DeviceRow): string {
  const ua = d.userAgent || '';
  const type = deviceTypeOf(ua) || d.platform || 'Device';
  const parts = [type, osOf(ua), browserOf(ua)].filter((p) => p && !p.startsWith('Unknown'));
  return parts.join(' · ');
}

/**
 * Turn whatever OneDrive link an admin pasted into something an iframe can
 * show. A ready-made embed link (onedrive.live.com/embed?...) is used as-is; a
 * view link carrying resid + authkey is rebuilt into the embed form. Anything
 * else is passed through untouched and the board offers an "open in OneDrive"
 * fallback, because a bare short link cannot be embedded.
 */
function oneDriveEmbedUrl(raw: string): string {
  const url = (raw ?? '').trim();
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('onedrive.live.com') && u.pathname.includes('/embed')) return url;
    const resid = u.searchParams.get('resid');
    const authkey = u.searchParams.get('authkey');
    if (resid && authkey) {
      return `https://onedrive.live.com/embed?resid=${encodeURIComponent(resid)}&authkey=${encodeURIComponent(authkey)}`;
    }
    return url;
  } catch {
    return url;
  }
}

const Panel = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('rounded-2xl border border-[#1e232d] bg-[#10131a]', className)}>{children}</div>
);

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

/** Signed-out gate: enter the show code an admin set. */
function CodeGate({ onGone }: { onGone: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await getLiveShowState({ code, deviceKey: deviceKey(), deviceName: deviceName(), platform: platformOf(), userAgent: navigator.userAgent });
      if (r.open && r.authorized) {
        sessionStorage.setItem(GUEST_CODE_KEY, code);
        onGone();
      } else {
        setErr('That code is not right. Ask the stage manager for tonight\u2019s show code.');
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl border border-[#2a3040] bg-[#10131a] flex items-center justify-center">
          <KeyRound className="h-6 w-6 text-cream/70" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-cream">Enter the show code</h2>
          <p className="text-sm text-[#9aa3b2] mt-1">This dashboard is behind a code while the show is on. Ask the stage manager if you don’t have it.</p>
        </div>
        <div className="rounded-2xl border border-[#2a3040] bg-[#0b0d12] p-4 space-y-3">
          <input
            autoFocus
            value={code}
            onChange={(e) => { setCode(e.target.value); setErr(''); }}
            placeholder="Show code"
            className="w-full bg-transparent text-center text-2xl tracking-[0.3em] uppercase font-mono text-cream outline-none placeholder:text-[#525b6c] placeholder:tracking-normal"
          />
          {err && <p className="text-sm text-red-400 -mt-1">{err}</p>}
          <Button type="submit" disabled={busy || !code.trim()} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
            Unlock dashboard
          </Button>
        </div>
      </form>
    </div>
  );
}

function AnnouncementBar({ items }: { items: Announcement[] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ann = items[0];
  if (!ann) return null;
  const left = ann.expiresAt ? Math.max(0, Math.ceil((new Date(ann.expiresAt).getTime() - Date.now()) / 1000)) : null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="pointer-events-auto max-w-5xl w-full rounded-3xl px-8 md:px-12 py-8 md:py-10 text-center shadow-[0_60px_160px_-40px_rgba(0,0,0,0.95)] border border-red-400/60 bg-red-600/90 text-white">
        <div className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight tracking-tight whitespace-pre-wrap">{ann.body}</div>
        <div className="mt-4 text-base md:text-lg opacity-90">{left === null ? 'until cleared' : `${left}s left`}</div>
      </div>
    </div>
  );
}

function ChatList({ messages, className }: { messages: ChatMessage[]; className?: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);
  return (
    <div className={cn('space-y-2 overflow-y-auto pr-1', className)}>
      {messages.length === 0 && <p className="text-sm text-[#9aa3b2]">No messages yet.</p>}
      {messages.map((m) => (
        <div key={m.id} className={cn('rounded-xl border px-3 py-2', m.kind === 'announcement' ? 'border-amber-400/40 bg-amber-400/5' : 'border-[#1e232d] bg-[#0b0d12]')}>
          <div className="flex items-center gap-2">
            {m.kind === 'announcement' && <Megaphone className="h-3.5 w-3.5 text-amber-300" />}
            <span className="text-xs font-semibold text-cream/80">{m.authorName || 'Admin'}</span>
            <span className="ml-auto text-[10px] text-[#525b6c]">{clockTime(m.createdAt)}</span>
          </div>
          <p className="mt-0.5 text-sm text-cream/90 whitespace-pre-wrap break-words">{m.body}</p>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/** Post composer: uses the session when admin, otherwise asks for an admin's cat secret. */
function Composer({
  isAdmin, identity, setIdentity, placeholder, onPost, busy,
}: {
  isAdmin: boolean;
  identity: Identity;
  setIdentity: (i: Identity) => void;
  placeholder: string;
  onPost: (body: string, identity: Identity) => Promise<void>;
  busy: boolean;
}) {
  const [text, setText] = useState('');
  const [admins, setAdmins] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');

  useEffect(() => {
    if (isAdmin) return;
    void getCatLoginAdmins({}).then((r) => setAdmins(r.admins)).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { if (identity) { setEmail(identity.email); setSecret(identity.secret); } }, [identity]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    let id = identity;
    if (!isAdmin) {
      if (!email || !secret) { toast.error('Pick an admin and enter their cat-login secret.'); return; }
      id = { email, secret };
    }
    try {
      await onPost(body, id);
      if (!isAdmin && id) setIdentity(id);
      setText('');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-2">
      {!isAdmin && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#0b0d12] border border-[#1e232d] rounded-lg px-2 py-1.5 text-sm text-cream outline-none"
          >
            <option value="">Admin…</option>
            {admins.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Cat-login secret"
            className="bg-[#0b0d12] border border-[#1e232d] rounded-lg px-2 py-1.5 text-sm text-cream outline-none placeholder:text-[#525b6c]"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={placeholder}
          maxLength={500}
          className="flex-1 bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none placeholder:text-[#525b6c]"
        />
        <Button size="sm" onClick={() => void send()} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function DeviceList({ devices }: { devices: DeviceRow[] }) {
  const icon = (p: string) => (/Mobile/i.test(p) ? <Smartphone className="h-3.5 w-3.5" /> : /Tablet/i.test(p) ? <Tablet className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />);
  return (
    <div className="space-y-2">
      {devices.length === 0 && <p className="text-sm text-[#9aa3b2]">No devices seen yet.</p>}
      {devices.map((d) => (
        <div key={d.id} className="rounded-xl border border-[#1e232d] bg-[#0b0d12] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full shrink-0', d.online ? 'bg-emerald-400' : 'bg-[#525b6c]')} />
            {icon(d.userAgent || d.platform)}
            <span className="text-sm text-cream/85 truncate">{d.name || describeDevice(d) || 'Device'}</span>
            <span className={cn('text-[11px] px-1.5 py-0.5 rounded', d.member ? 'bg-emerald-400/10 text-emerald-300' : 'bg-[#1e232d] text-[#9aa3b2]')}>
              {d.member ? 'signed in' : 'guest'}
            </span>
            {d.adminView && <span className="text-[11px] text-[#7aa2f7]">admin</span>}
            <span className={cn('ml-auto text-[11px]', d.online ? 'text-emerald-300' : 'text-[#525b6c]')}>{d.online ? 'online' : relTime(d.lastSeenAt)}</span>
          </div>
          <p className="mt-1 pl-4 text-[11px] text-[#9aa3b2]">{describeDevice(d)}</p>
          <p className="pl-4 text-[11px] text-[#525b6c]">last seen {relTime(d.lastSeenAt)} · connected {relTime(d.connectedSince)}</p>
        </div>
      ))}
    </div>
  );
}

/** Status buttons, then transport, deliberately on separate rows (ticket cae6b1aa). */
function Controls({ board, scenes, busy, onControl, compact }: {
  board: Board;
  scenes: Scene[];
  busy: boolean;
  onControl: (action: string, extra?: { status?: string; sceneIndex?: number }) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-[#9aa3b2] mr-1">Status</span>
        {(['standby', 'rehearsal', 'live', 'intermission', 'finished'] as const).map((s) => (
          <Button key={s} size="sm" variant={board.status === s ? 'default' : 'outline'} disabled={busy} onClick={() => onControl('status', { status: s })}>
            {statusOf(s).label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[#1e232d] pt-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-[#9aa3b2] mr-1">Transport</span>
        <Button size="sm" variant="outline" disabled={busy || board.currentSceneIndex <= 0} onClick={() => onControl('scene', { sceneIndex: board.currentSceneIndex - 1 })}>
          <ChevronLeft className="h-4 w-4" />Prev
        </Button>
        {board.timerMode === 'running' ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onControl('pause')}><Pause className="h-4 w-4 mr-1" />Pause</Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onControl('start')}><Play className="h-4 w-4 mr-1" />Start</Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onControl('reset')}><RotateCcw className="h-4 w-4 mr-1" />Reset clock</Button>
        <Button size="sm" variant="outline" disabled={busy || board.currentSceneIndex >= scenes.length - 1} onClick={() => onControl('scene', { sceneIndex: board.currentSceneIndex + 1 })}>
          Next<ChevronRight className="h-4 w-4" />
        </Button>
        {!compact && <span className="text-xs text-[#525b6c]">Space = pause/play · ← → change scene</span>}
      </div>
    </div>
  );
}

function ScriptEmbed({ link }: { link: string }) {
  if (!link) {
    return <p className="text-sm text-[#9aa3b2]">No script link set. An admin adds the OneDrive script link in Live Show setup.</p>;
  }
  const embed = oneDriveEmbedUrl(link);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#7aa2f7] hover:underline">
          Open in OneDrive <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <iframe
        title="Show script"
        src={embed}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="w-full h-[70vh] rounded-xl border border-[#1e232d] bg-white"
      />
    </div>
  );
}

/** Movement warning: shown when a screen reports a bump, until someone accepts. */
function MovementOverlay({ message, onAccept }: { message: string; onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-[#07080a]/90 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border-2 border-amber-400/70 bg-[#12141c] p-7 text-center space-y-5 shadow-[0_0_60px_rgba(245,158,11,0.35)]">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-amber-400/15 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-amber-300" />
        </div>
        <h2 className="text-xl font-bold text-amber-100">Screen moved</h2>
        <p className="text-cream/90 whitespace-pre-wrap">{message}</p>
        <Button onClick={onAccept} className="w-full">Accept and hide</Button>
      </div>
    </div>
  );
}

/** Asks for the show code before unlocking the quick controls (ticket f75f7b40). */
function CodePrompt({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true);
    setErr('');
    try { await onSubmit(code.trim()); }
    catch (e) { setErr((e as Error).message || 'That code is not right.'); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-[#2a3040] bg-[#10131a] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-cream/60" />
          <h2 className="font-bold text-cream">Enter the show code</h2>
        </div>
        <p className="text-xs text-[#9aa3b2]">The same code the stage manager shared to open the show.</p>
        <input
          autoFocus
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onCancel(); }}
          placeholder="Show code"
          className="w-full bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none focus:border-[#3a4356]"
        />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={busy || !code.trim()} onClick={() => void submit()}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Unlock
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The stage-manager board: fills the viewport, one page. */
function ShowBoard({
  board, scenes, scripts, isAdmin, identity, setIdentity, messages, announcements, devices,
  onControl, onPost, onAnnounce, onClearAnnounce, onPosting,
  viewMode, onViewMode,
}: {
  board: Board;
  scenes: Scene[];
  scripts: Scripts;
  isAdmin: boolean;
  identity: Identity;
  setIdentity: (i: Identity) => void;
  messages: ChatMessage[];
  announcements: Announcement[];
  devices: DeviceRow[];
  onControl: (action: string, extra?: { status?: string; sceneIndex?: number }) => void;
  onPost: (body: string, identity: Identity) => Promise<void>;
  onAnnounce: (body: string, seconds: number, identity: Identity) => Promise<void>;
  onClearAnnounce: (identity: Identity) => Promise<void>;
  onPosting: boolean;
  viewMode: 'dashboard' | 'admin';
  onViewMode: (m: 'dashboard' | 'admin') => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const meta = statusOf(board.status);
  const elapsed = elapsedOf(board, now);
  const current = scenes.find((s) => s.sortIndex === board.currentSceneIndex);
  const upNext = scenes.find((s) => s.sortIndex === board.currentSceneIndex + 1);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // full-screen dashboard layout for everyone
  if (viewMode === 'dashboard') {
    return (
      <main className="flex-1 min-h-0 w-full max-w-[1800px] mx-auto px-3 md:px-4 py-3 md:py-4 flex flex-col gap-3 md:gap-4">
        <AnnouncementBar items={announcements} />
        {board.status === 'live' && (
          <div className="rounded-2xl border border-red-500/50 bg-red-500/10 px-5 py-3 flex items-center gap-3">
            <span className={cn('h-3 w-3 rounded-full bg-red-500 animate-pulse')} />
            <p className="font-bold tracking-widest text-red-400 text-sm">SILENCE BACKSTAGE — THE SHOW IS LIVE</p>
          </div>
        )}

        <div className="grid gap-3 md:gap-4 grid-cols-1 lg:grid-cols-3 flex-1 min-h-0">
          {/* Left / main: clock + on stage now */}
          <div className="lg:col-span-2 flex flex-col gap-3 md:gap-4 min-h-0">
            <Panel className="p-5 md:p-6 relative overflow-hidden">
              <div className={cn('absolute inset-x-0 top-0 h-1', board.status === 'live' && 'animate-pulse')} style={{ background: meta.dot }} />
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className={cn('h-4 w-4 rounded-full', board.status === 'live' && 'animate-pulse')} style={{ background: meta.dot, boxShadow: board.status === 'live' ? `0 0 24px ${meta.dot}` : 'none' }} />
                  <div>
                    <p className={cn('text-lg font-bold tracking-[0.2em]', meta.text)}>{meta.label}</p>
                    <p className="text-xs text-[#9aa3b2]">{board.areaName} · backstage</p>
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#9aa3b2]">Show clock</p>
                  <p className="font-mono text-4xl md:text-6xl tabular-nums text-cream leading-none">{fmt(elapsed)}</p>
                </div>
              </div>
              <div className="mt-5 border-t border-[#1e232d] pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#00ff88]" />
                  <h2 className="text-sm font-bold tracking-[0.25em] text-[#9aa3b2]">ON STAGE NOW</h2>
                </div>
                {current ? (
                  <div className="mt-3">
                    <p className="font-mono text-sm text-[#9aa3b2]">{current.label || `Scene ${current.sortIndex + 1}`} · {current.minutes} min</p>
                    <p className="mt-1 text-2xl sm:text-4xl font-bold text-cream leading-tight">{current.title || 'Untitled scene'}</p>
                    {current.cast.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2.5">
                        {current.cast.map((c) => (
                          <span key={c} className="rounded-full border-2 border-[#00ff88]/70 bg-[#0b0d12] px-4 py-1.5 text-base font-bold text-[#00ff88]">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#9aa3b2]">No scene selected yet.</p>
                )}
              </div>
            </Panel>

            <div className="grid gap-3 md:gap-4 sm:grid-cols-2">
              <Panel className="p-5">
                <div className="flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-cream/60" />
                  <h2 className="text-sm font-bold tracking-[0.2em] text-[#9aa3b2]">UP NEXT</h2>
                </div>
                {upNext ? (
                  <div className="mt-3">
                    <p className="font-mono text-xs text-[#9aa3b2]">{upNext.label || `Scene ${upNext.sortIndex + 1}`} · {upNext.minutes} min</p>
                    <p className="mt-1 text-xl font-bold text-cream leading-tight">{upNext.title || 'Untitled scene'}</p>
                    {upNext.cast.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {upNext.cast.map((c) => <span key={c} className="rounded-full border border-[#2a3040] bg-[#161a22] px-3 py-1 text-xs text-cream/60">{c}</span>)}
                      </div>
                    )}
                  </div>
                ) : <p className="mt-3 text-sm text-[#9aa3b2]">Last scene.</p>}
              </Panel>

              <Panel className="p-5">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-cream/60" />
                  <h2 className="font-bold text-cream">Notes</h2>
                </div>
                {current && current.notes.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {current.notes.map((n, i) => <li key={i} className="text-sm text-cream/80 rounded-xl bg-[#0b0d12] border border-[#1e232d] px-3 py-2">{n}</li>)}
                  </ul>
                ) : <p className="mt-3 text-sm text-[#9aa3b2]">No notes for {current?.title || 'the current scene'}.</p>}
              </Panel>
            </div>

            {isAdmin && (
              <Panel className="p-4">
                <Controls board={board} scenes={scenes} busy={false} onControl={onControl} />
                <div className="mt-3 flex items-center justify-between border-t border-[#1e232d] pt-3">
                  <span className="text-xs text-[#9aa3b2]">Announcement & chat need an admin; use the ⚙ admin view to post.</span>
                  <button onClick={() => onViewMode('admin')} className="text-xs text-cream/60 hover:text-cream flex items-center gap-1">
                    <Settings2 className="h-3.5 w-3.5" />Admin view
                  </button>
                </div>
              </Panel>
            )}
          </div>

          {/* Right column: chat + running order */}
          <div className="flex flex-col gap-3 md:gap-4 min-h-0">
            <Panel className="p-4 flex flex-col min-h-0 flex-1">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-cream/60" />
                <h2 className="font-bold text-cream">Live chat</h2>
                <span className="ml-auto text-[11px] text-[#525b6c]">admins post</span>
              </div>
              <ChatList messages={messages} className="mt-3 flex-1 min-h-[160px]" />
              {(isAdmin || identity || !isAdmin) && (
                <div className="mt-3 border-t border-[#1e232d] pt-3">
                  <Composer isAdmin={isAdmin} identity={identity} setIdentity={setIdentity} placeholder="Message the cast…" onPost={onPost} busy={onPosting} />
                </div>
              )}
            </Panel>

            <Panel className="p-4 max-h-[38vh] overflow-y-auto">
              <h2 className="font-bold text-cream flex items-center gap-2">Running order <span className="text-xs font-normal text-[#9aa3b2]">{scenes.length} scenes</span></h2>
              <div className="mt-3 space-y-2">
                {scenes.map((s) => {
                  const isCurrent = s.sortIndex === board.currentSceneIndex;
                  return (
                    <div key={s.id} className={cn('rounded-xl border px-3 py-2', isCurrent ? 'border-red-500/50 bg-red-500/5' : 'border-[#1e232d] bg-[#0b0d12]')}>
                      <div className="flex items-center gap-2">
                        <span className={cn('font-mono text-xs', isCurrent ? 'text-red-400' : 'text-[#525b6c]')}>{s.label || s.sortIndex + 1}</span>
                        <p className={cn('font-medium text-sm truncate', isCurrent ? 'text-cream' : 'text-cream/75')}>{s.title || 'Untitled'}</p>
                        <span className="ml-auto text-[11px] text-[#9aa3b2]">{s.minutes}m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      </main>
    );
  }

  // admin / details view: dense, works on mobile and desktop
  return (
    <main className="flex-1 w-full max-w-[1400px] mx-auto px-3 md:px-4 py-4 space-y-4">
      <AnnouncementBar items={announcements} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-full" style={{ background: meta.dot }} />
              <div>
                <p className={cn('text-lg font-bold tracking-[0.2em]', meta.text)}>{meta.label}</p>
                <p className="text-xs text-[#9aa3b2]">{board.name} · {board.areaName}</p>
              </div>
            </div>
            <p className="font-mono text-3xl tabular-nums text-cream">{fmt(elapsed)}</p>
          </div>
          <Controls board={board} scenes={scenes} busy={false} onControl={onControl} />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-amber-300" />
            <h2 className="font-bold text-cream">Announcement</h2>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void onClearAnnounce(identity)}>Clear all</Button>
          </div>
          <AnnounceComposer onAnnounce={onAnnounce} identity={identity} busy={onPosting} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cream/60" />
            <h2 className="font-bold text-cream">Connected devices <span className="text-xs font-normal text-[#9aa3b2]">{devices.filter((d) => d.online).length} online</span></h2>
          </div>
          <DeviceList devices={devices} />
          <p className="text-[11px] text-[#525b6c]">Movement alerts {board.movementAlert ? `on · re-warn every ${board.movementSeconds ?? 30}s` : 'off'}.</p>
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-cream/60" />
            <h2 className="font-bold text-cream">Live chat</h2>
          </div>
          <ChatList messages={messages} className="max-h-64" />
          <Composer isAdmin={isAdmin} identity={identity} setIdentity={setIdentity} placeholder="Message the cast…" onPost={onPost} busy={onPosting} />
        </Panel>
      </div>

      <Panel className="p-5 space-y-3">
        <Section title="Show script (OneDrive)" icon={<ScrollText className="h-4 w-4 text-cream/60" />} defaultOpen>
          <ScriptEmbed link={scripts?.sharedLink ?? ''} />
        </Section>
      </Panel>

      <Panel className="p-5">
        <Section title={`Running order (${scenes.length})`} icon={<ListTree className="h-4 w-4 text-cream/60" />} defaultOpen>
          <div className="space-y-2">
            {scenes.map((s) => (
              <div key={s.id} className={cn('rounded-xl border px-3 py-2', s.sortIndex === board.currentSceneIndex ? 'border-red-500/50 bg-red-500/5' : 'border-[#1e232d] bg-[#0b0d12]')}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#525b6c]">{s.label || s.sortIndex + 1}</span>
                  <p className="font-medium text-sm text-cream/85 truncate">{s.title || 'Untitled'}</p>
                  <span className="ml-auto text-[11px] text-[#9aa3b2]">{s.minutes}m</span>
                </div>
                {s.cast.length > 0 && <p className="mt-1 text-[11px] text-[#9aa3b2] truncate">{s.cast.join(' · ')}</p>}
              </div>
            ))}
          </div>
        </Section>
      </Panel>
    </main>
  );
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        {icon}
        <span className="text-sm font-semibold text-cream">{title}</span>
        <ChevronDown className={cn('ml-auto h-4 w-4 text-cream/50 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function AnnounceComposer({ onAnnounce, identity, busy }: { onAnnounce: (body: string, seconds: number, identity: Identity) => Promise<void>; identity: Identity; busy: boolean }) {
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(30);
  const [untilCleared, setUntilCleared] = useState(false);
  const secs = untilCleared ? 0 : Math.min(145, Math.max(2, Math.floor(seconds) || 30));
  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Broadcast to every dashboard…"
        className="w-full bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-2 text-sm text-cream outline-none resize-y placeholder:text-[#525b6c]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[#9aa3b2]">Show for</label>
        <input
          type="number"
          min={2}
          max={145}
          value={seconds}
          disabled={untilCleared}
          onChange={(e) => setSeconds(Number(e.target.value))}
          className="w-20 bg-[#0b0d12] border border-[#1e232d] rounded-lg px-2 py-1.5 text-sm text-cream outline-none disabled:opacity-40"
        />
        <span className="text-xs text-[#9aa3b2]">seconds</span>
        <label className="flex items-center gap-1 text-xs text-[#9aa3b2]">
          <input type="checkbox" checked={untilCleared} onChange={(e) => setUntilCleared(e.target.checked)} />
          until cleared
        </label>
        <Button size="sm" className="ml-auto" disabled={busy || !text.trim()} onClick={() => void onAnnounce(text, secs, identity)}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Megaphone className="h-4 w-4 mr-1" />}Announce
        </Button>
      </div>
    </div>
  );
}

function ViewChooser({ onPick }: { onPick: (m: 'dashboard' | 'admin') => void }) {
  return (
    <div className="fixed inset-0 z-[70] bg-[#07080a]/90 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-[#2a3040] bg-[#12141c] p-7 space-y-5 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center">
          <Settings2 className="h-6 w-6 text-cream/70" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-cream">Open the live show</h2>
          <p className="text-sm text-[#9aa3b2] mt-1">You are signed in as an admin. Pick how this screen should show the show.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => onPick('dashboard')} className="rounded-xl border border-[#2a3040] bg-[#0b0d12] p-4 text-left hover:border-red-500/60 transition-colors">
            <LayoutGrid className="h-5 w-5 text-red-400" />
            <p className="mt-2 font-semibold text-cream">Dashboard</p>
            <p className="text-xs text-[#9aa3b2] mt-1">Full-screen board for the stage. Big clock, scenes, chat.</p>
          </button>
          <button onClick={() => onPick('admin')} className="rounded-xl border border-[#2a3040] bg-[#0b0d12] p-4 text-left hover:border-[#7aa2f7]/60 transition-colors">
            <ListTree className="h-5 w-5 text-[#7aa2f7]" />
            <p className="mt-2 font-semibold text-cream">Admin view</p>
            <p className="text-xs text-[#9aa3b2] mt-1">Just the details: devices, controls, chat, script. Works on mobile.</p>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LiveShowDash() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'boot' | 'closed' | 'gate' | 'board'>('boot');
  const [board, setBoard] = useState<Board | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scripts, setScripts] = useState<Scripts>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [viewMode, setViewMode] = useState<'dashboard' | 'admin'>('dashboard');
  const [askView, setAskView] = useState(false);
  const [identity, setIdentity] = useState<Identity>(null);
  const [posting, setPosting] = useState(false);
  const [move, setMove] = useState<{ message: string; seconds: number } | null>(null);
  const [quick, setQuick] = useState(false);
  const [askCode, setAskCode] = useState(false);
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [moveForm, setMoveForm] = useState<{ alert: boolean; message: string; seconds: number; admins: string[] } | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const guestCode = useRef<string | null>(null);
  const didChooseView = useRef(false);

  const applyCommon = useCallback((r: Partial<MemberState & GuestState>) => {
    setBoard(r.liveShow as unknown as Board);
    setScenes((r.scenes ?? []) as Scene[]);
    setMessages((r.messages ?? []) as ChatMessage[]);
    setAnnouncements((r.announcements ?? []) as Announcement[]);
    setScripts((r.scripts as unknown as Scripts) ?? null);
  }, []);

  const applyMember = useCallback((r: MemberState) => {
    if (!r.open) { setPhase('closed'); return; }
    applyCommon(r as unknown as Partial<MemberState & GuestState>);
    setDevices((r.devices ?? []) as DeviceRow[]);
    setPhase('board');
  }, [applyCommon]);

  const applyGuest = useCallback((r: GuestState) => {
    if (!r.open) { setPhase('closed'); return; }
    if (!r.authorized || !r.liveShow) { setPhase('gate'); return; }
    applyCommon(r as unknown as Partial<MemberState & GuestState>);
    setPhase('board');
  }, [applyCommon]);

  const devicePayload = () => ({
    deviceKey: deviceKey(),
    deviceName: deviceName(),
    platform: platformOf(),
    userAgent: navigator.userAgent,
    adminView: viewMode === 'admin',
  });

  const loadMember = useCallback(async () => {
    const r = await getLiveShowMember(devicePayload());
    applyMember(r);
    return r;
  }, [applyMember, viewMode]);

  const loadGuest = useCallback(async () => {
    const c = guestCode.current ?? sessionStorage.getItem(GUEST_CODE_KEY) ?? '';
    const r = await getLiveShowState({ code: c || undefined, deviceKey: deviceKey(), deviceName: deviceName(), platform: platformOf(), userAgent: navigator.userAgent });
    if (r.open && r.authorized && c) guestCode.current = c;
    applyGuest(r);
    return r;
  }, [applyGuest]);

  const refresh = useCallback(() => (user ? loadMember() : loadGuest()).catch(() => {}), [user, loadMember, loadGuest]);

  const boot = useCallback(async (signedIn: boolean) => {
    setPhase('boot');
    try {
      if (signedIn) {
        const meRes = await getMe({});
        const admin = !!meRes.member?.isAdmin;
        setIsAdmin(admin);
        await loadMember();
        if (admin && !didChooseView.current) {
          didChooseView.current = true;
          const stored = localStorage.getItem(VIEW_KEY);
          if (stored === 'dashboard' || stored === 'admin') setViewMode(stored);
          else setAskView(true);
        }
      } else {
        setIsAdmin(false);
        await loadGuest();
      }
    } catch {
      try { await loadGuest(); } catch { setPhase('closed'); }
    }
  }, [loadMember, loadGuest]);

  useEffect(() => {
    if (authLoading) return;
    void boot(!!user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    if (phase !== 'board') return;
    const id = window.setInterval(() => { void refresh(); }, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [phase, refresh]);

  const control = useCallback(async (action: string, extra?: { status?: string; sceneIndex?: number }) => {
    if (!board) return;
    try {
      await adminLiveShowControl({ liveShowId: board.id, action, ...extra, code: guestCode.current ?? sessionStorage.getItem(GUEST_CODE_KEY) ?? undefined });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }, [board, refresh]);

  const postChat = useCallback(async (body: string, id: Identity) => {
    if (!board) return;
    setPosting(true);
    try {
      const r = await liveShowChat({ body, email: id?.email, secret: id?.secret });
      setMessages((r.messages ?? []) as ChatMessage[]);
    } finally { setPosting(false); }
  }, [board]);

  const announce = useCallback(async (body: string, seconds: number, id: Identity) => {
    if (!board) return;
    setPosting(true);
    try {
      const r = await liveShowAnnouncement({ body, seconds, email: id?.email, secret: id?.secret });
      setAnnouncements((r.announcements ?? []) as Announcement[]);
      if (r.messages) setMessages(r.messages as ChatMessage[]);
      toast.success('Announcement is on every dashboard');
    } finally { setPosting(false); }
  }, [board]);

  const clearAnnounce = useCallback(async (id: Identity) => {
    if (!board) return;
    try {
      await liveShowAnnouncement({ clear: true, email: id?.email, secret: id?.secret });
      setAnnouncements([]);
      toast.success('Announcement cleared');
    } catch (e) { toast.error((e as Error).message); }
  }, [board]);

  // -- quick controls: triple-space on the normal dashboard -------------------
  const openQuick = useCallback(() => {
    if (board) {
      setMoveForm({
        alert: !!board.movementAlert,
        message: board.movementMessage ?? '',
        seconds: board.movementSeconds ?? 30,
        admins: board.movementAdmins ?? [],
      });
    }
    void getLiveShowAdmins({})
      .then((r) => setAdmins((r.admins ?? []) as { id: string; name: string }[]))
      .catch(() => {});
    setQuick(true);
  }, [board]);

  const submitCode = useCallback(async (code: string) => {
    const r = await getLiveShowState({ code, deviceKey: deviceKey(), deviceName: deviceName(), platform: platformOf(), userAgent: navigator.userAgent });
    if (!r.open || !r.authorized) throw new Error('That code is not right.');
    guestCode.current = code;
    try { sessionStorage.setItem(GUEST_CODE_KEY, code); } catch { /* ignore */ }
    setAskCode(false);
    openQuick();
  }, [openQuick]);

  const saveMove = useCallback(async () => {
    if (!board || !moveForm) return;
    setSavingMove(true);
    try {
      await adminLiveShowControl({
        liveShowId: board.id,
        code: guestCode.current ?? undefined,
        action: 'movement',
        movementAlert: moveForm.alert,
        movementMessage: moveForm.message,
        movementSeconds: Math.min(145, Math.max(2, Math.floor(moveForm.seconds) || 30)),
        movementAdmins: moveForm.admins,
      });
      toast.success('Movement alert saved');
      void refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingMove(false); }
  }, [board, moveForm, refresh]);

  useEffect(() => {
    if (phase !== 'board' || quick || askCode || viewMode !== 'dashboard') return;
    let times: number[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT')) return;
      const now = Date.now();
      // Reset the run after an >800ms gap so a slow triple still counts.
      times = times.filter((x) => now - x < 800);
      times.push(now);
      if (times.length >= 3) {
        times = [];
        e.preventDefault();
        if (isAdmin || guestCode.current) openQuick();
        else setAskCode(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, quick, askCode, viewMode, isAdmin, openQuick]);

  useEffect(() => {
    if (!quick) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT')) return;
      if (e.code === 'Space') { e.preventDefault(); void control(board?.timerMode === 'running' ? 'pause' : 'start'); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); void control('scene', { sceneIndex: Math.max(0, (board?.currentSceneIndex ?? 0) - 1) }); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); void control('scene', { sceneIndex: (board?.currentSceneIndex ?? 0) + 1 }); }
      else if (e.code === 'Escape') { setQuick(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quick, board, control]);

  // -- movement detection -----------------------------------------------------
  const triggerMove = useCallback(async () => {
    try {
      const r = await liveShowMovement({ deviceKey: deviceKey(), action: 'moved' });
      const rr = r as { ok?: boolean; message?: string; seconds?: number };
      if (rr.ok) setMove({ message: rr.message || 'This screen has been moved. Please put it back.', seconds: rr.seconds || 30 });
    } catch { /* movement is best-effort */ }
  }, []);

  useEffect(() => {
    if (phase !== 'board' || !board?.movementAlert || quick || move) return;
    const cooldown = Math.max(2, board.movementSeconds ?? 30) * 1000;
    let last = 0;
    // Throttle to one sample per cooldown; the server decides if it is a new
    // move or already acknowledged. Motion must be sustained past the cooldown
    // to re-warn, so an accepted nudge stays quiet until the screen moves again.
    const fire = () => {
      const now = Date.now();
      if (now - last < cooldown) return;
      last = now;
      void triggerMove();
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0) + Math.abs(a.z ?? 0);
      if (mag > 32) fire();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') return; // spacebar drives the show, it is not movement
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT')) return;
      fire();
    };
    const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (DM?.requestPermission) void DM.requestPermission().catch(() => 'denied');
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase, board?.movementAlert, board?.movementSeconds, quick, move, triggerMove]);

  const acceptMove = useCallback(async () => {
    setMove(null);
    try { await liveShowMovement({ deviceKey: deviceKey(), action: 'ack' }); } catch { /* ignore */ }
  }, []);

  const chooseView = (m: 'dashboard' | 'admin') => {
    setViewMode(m);
    try { localStorage.setItem(VIEW_KEY, m); } catch { /* ignore */ }
    setAskView(false);
    void refresh();
  };

  const title = board?.name || 'Live Show';
  const subtitle = board ? `${board.areaName} · backstage` : '';

  if (phase === 'boot') {
    return (
      <div className="min-h-screen bg-[#07080a] text-cream flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cream/60" />
      </div>
    );
  }

  if (phase === 'closed') {
    return (
      <div className="min-h-screen bg-[#07080a] text-cream flex flex-col">
        <DashTopBar title="Live Show" subtitle="" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-sm">
            <div className="mx-auto h-14 w-14 rounded-2xl border border-[#2a3040] bg-[#10131a] flex items-center justify-center">
              <Tv className="h-6 w-6 text-cream/50" />
            </div>
            <h2 className="text-2xl font-bold">The live show isn’t open right now</h2>
            <p className="text-sm text-[#9aa3b2]">The stage manager opens it up when the production is running.</p>
            {isAdmin && (
              <Button onClick={() => navigate('/admin/live-show')} className="mx-auto">
                <Settings2 className="h-4 w-4 mr-2" />Open the live show
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'gate') {
    return (
      <div className="min-h-screen bg-[#07080a] text-cream flex flex-col">
        <DashTopBar title="Live Show" subtitle="" />
        <CodeGate onGone={() => { void refresh(); }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080a] text-cream flex flex-col">
      <DashTopBar
        title={title}
        subtitle={subtitle}
        right={isAdmin ? (
          <Button size="sm" variant="outline" onClick={() => setViewMode(viewMode === 'admin' ? 'dashboard' : 'admin')}>
            {viewMode === 'admin' ? <LayoutGrid className="h-4 w-4 mr-1.5" /> : <ListTree className="h-4 w-4 mr-1.5" />}
            {viewMode === 'admin' ? 'Dashboard' : 'Admin view'}
          </Button>
        ) : undefined}
      />

      <ShowBoard
        board={board!}
        scenes={scenes}
        scripts={scripts}
        isAdmin={isAdmin}
        identity={identity}
        setIdentity={setIdentity}
        messages={messages}
        announcements={announcements}
        devices={devices}
        onControl={control}
        onPost={postChat}
        onAnnounce={announce}
        onClearAnnounce={clearAnnounce}
        onPosting={posting}
        viewMode={viewMode}
        onViewMode={setViewMode}
      />

      {askView && <ViewChooser onPick={chooseView} />}
      {askCode && <CodePrompt onCancel={() => setAskCode(false)} onSubmit={submitCode} />}

      {move && <MovementOverlay message={move.message} onAccept={acceptMove} />}

      {quick && board && (
        <div className="fixed inset-x-0 bottom-0 z-[55] border-t border-[#2a3040] bg-[#0b0d12]/97 backdrop-blur p-4">
          <div className="max-w-4xl mx-auto space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <Radio className="h-4 w-4 text-red-400" />
              <span className="text-sm font-bold tracking-widest text-red-400">QUICK CONTROLS</span>
              <span className="text-xs text-[#9aa3b2]">Space = pause/play · ← → scene · Esc to close</span>
              <button onClick={() => setQuick(false)} className="ml-auto text-cream/60 hover:text-cream"><X className="h-4 w-4" /></button>
            </div>
            <Controls board={board} scenes={scenes} busy={posting} onControl={control} compact />
            {!isAdmin && (
              <p className="text-xs text-[#9aa3b2]">
                {guestCode.current || sessionStorage.getItem(GUEST_CODE_KEY) ? 'Quick controls unlocked with the show code.' : 'Enter the show code to unlock quick controls.'}
              </p>
            )}
            {moveForm && (
              <div className="rounded-xl border border-[#2a3040] bg-[#0f1219] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-300" />
                  <span className="text-xs uppercase tracking-widest text-[#9aa3b2]">Movement alert</span>
                  <label className="ml-auto flex items-center gap-1 text-xs text-[#9aa3b2]">
                    <input type="checkbox" checked={moveForm.alert} onChange={(e) => setMoveForm({ ...moveForm, alert: e.target.checked })} /> enabled
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={moveForm.message}
                    maxLength={300}
                    onChange={(e) => setMoveForm({ ...moveForm, message: e.target.value })}
                    placeholder="Message shown when a screen moves"
                    className="flex-1 min-w-[220px] bg-[#0b0d12] border border-[#1e232d] rounded-lg px-3 py-1.5 text-sm text-cream outline-none"
                  />
                  <input
                    type="number"
                    min={2}
                    max={145}
                    value={moveForm.seconds}
                    onChange={(e) => setMoveForm({ ...moveForm, seconds: Number(e.target.value) })}
                    className="w-20 bg-[#0b0d12] border border-[#1e232d] rounded-lg px-2 py-1.5 text-sm text-cream outline-none"
                  />
                  <span className="text-xs text-[#9aa3b2]">sec</span>
                  <Button size="sm" disabled={savingMove} onClick={() => void saveMove()}>
                    {savingMove && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {admins.map((a) => {
                    const on = moveForm.admins.includes(a.id);
                    return (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => setMoveForm({ ...moveForm, admins: on ? moveForm.admins.filter((id) => id !== a.id) : [...moveForm.admins, a.id] })}
                        className={cn('rounded-full border px-2.5 py-1 text-[11px] transition', on ? 'border-amber-400/70 bg-amber-400/15 text-amber-200 font-medium' : 'border-[#2a3040] text-[#9aa3b2] hover:border-amber-400/50')}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                  {admins.length === 0 && <span className="text-[11px] text-[#525b6c]">No admins found.</span>}
                </div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-[#9aa3b2]">Announce</p>
                <AnnounceComposer onAnnounce={announce} identity={identity} busy={posting} />
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-[#9aa3b2]">Chat</p>
                <Composer isAdmin={isAdmin} identity={identity} setIdentity={setIdentity} placeholder="Message the cast…" onPost={postChat} busy={posting} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
