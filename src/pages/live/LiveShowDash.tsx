import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '#auth';
import {
  getLiveShowState, getLiveShowMember, adminLiveShowControl, saveLiveShowScript, getMe,
  type GetLiveShowStateOutputType, type GetLiveShowMemberOutputType,
} from '#api';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, KeyRound, Loader2, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, ChevronDown,
  ScrollText, Tv, Settings2, Users, Clapperboard, Lock,
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
};

const GUEST_CODE_KEY = 'ashtec-show-code';

const statusMeta: Record<string, { label: string; dot: string; text: string; glow: string; ring: string }> = {
  standby: { label: 'STANDBY', dot: '#ff9f1c', text: 'text-amber-400', glow: 'shadow-[0_0_0_rgba(255,159,28,0)]', ring: 'border-amber-400/40' },
  rehearsal: { label: 'IN REHEARSAL', dot: '#4cc3ff', text: 'text-sky-400', glow: 'shadow-[0_0_0_rgba(76,195,255,0)]', ring: 'border-sky-400/40' },
  live: { label: 'LIVE', dot: '#ff4438', text: 'text-red-500', glow: 'shadow-[0_0_24px_rgba(255,68,56,0.6)]', ring: 'border-red-500/50' },
  intermission: { label: 'INTERMISSION', dot: '#d946ef', text: 'text-fuchsia-400', glow: 'shadow-[0_0_0_rgba(217,70,239,0)]', ring: 'border-fuchsia-400/40' },
  finished: { label: 'FINISHED', dot: '#8b94a3', text: 'text-slate-400', glow: 'shadow-[0_0_0_rgba(139,148,163,0)]', ring: 'border-slate-400/30' },
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

const Panel = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('rounded-2xl border border-[#1e232d] bg-[#10131a]', className)}>{children}</div>
);

function DashTopBar({ title, subtitle, right }: { title: string; subtitle: string; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b border-[#1e232d] bg-[#07080a]/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
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
      const r = await getLiveShowState({ code });
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

/** Signed-in dashboard with the timer, scene tracker and the slightly-more access. */
function ShowBoard({
  board, scenes, canEdit, scripts, isAdmin, onRefresh, onControl,
}: {
  board: Board;
  scenes: Scene[];
  canEdit: boolean;
  scripts: { shared: string; private: string } | null;
  isAdmin: boolean;
  onRefresh: () => void;
  onControl: (action: string, extra?: { status?: string; sceneIndex?: number }) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptScope, setScriptScope] = useState<'shared' | 'private'>('shared');
  const [sharedDraft, setSharedDraft] = useState('');
  const [privateDraft, setPrivateDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const meta = statusOf(board.status);
  const elapsed = elapsedOf(board, now);
  const current = scenes.find((s) => s.sortIndex === board.currentSceneIndex);
  const upNext = scenes.find((s) => s.sortIndex === board.currentSceneIndex + 1);

  // The clock ticks locally and the server re-syncs every few seconds, so the
  // timer drifts at most one poll behind.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Pull fresh scripts whenever the poll brings one back, without clobbering
  // the text while someone is typing on the Script tab.
  useEffect(() => {
    if (!scripts) return;
    setSharedDraft((prev) => (prev === '' ? scripts.shared : prev));
    setPrivateDraft((prev) => (prev === '' ? scripts.private : prev));
  }, [scripts]);

  const saveScript = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveLiveShowScript({ scope: scriptScope, content: scriptScope === 'shared' ? sharedDraft : privateDraft });
      toast.success(scriptScope === 'shared' ? 'Shared script saved' : 'Private script saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-6">
      {board.status === 'live' && (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 px-5 py-4 flex items-center gap-3">
          <span className={cn('h-3 w-3 rounded-full bg-red-500 animate-pulse', meta.glow)} />
          <p className="font-bold tracking-widest text-red-400 text-sm">SILENCE BACKSTAGE — THE SHOW IS LIVE</p>
        </div>
      )}
      {board.status === 'rehearsal' && (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-400/5 px-5 py-3 text-sm text-sky-300/80">In rehearsal — getting ready.</div>
      )}

      <Panel className="p-6 relative overflow-hidden">
        <div className={cn('absolute inset-x-0 top-0 h-1', meta.ring, board.status === 'live' && 'animate-pulse')} style={{ background: meta.dot }} />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span
              className={cn('h-4 w-4 rounded-full', board.status === 'live' && 'animate-pulse', meta.glow)}
              style={{ background: meta.dot, boxShadow: board.status === 'live' ? `0 0 24px ${meta.dot}` : `0 0 0 ${meta.dot}` }}
            />
            <div>
              <p className={cn('text-lg font-bold tracking-[0.2em]', meta.text)}>{meta.label}</p>
              <p className="text-xs text-[#9aa3b2]">{board.areaName} · backstage</p>
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#9aa3b2]">Show clock</p>
            <p className="font-mono text-4xl md:text-5xl tabular-nums text-cream leading-none">{fmt(elapsed)}</p>
          </div>
        </div>

        <div className="mt-6 border-t border-[#1e232d] pt-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#00ff88]" />
            <h2 className="text-sm font-bold tracking-[0.25em] text-[#9aa3b2]">ON STAGE NOW</h2>
          </div>
          {current ? (
            <div className="mt-3">
              <p className="font-mono text-sm text-[#9aa3b2]">{current.label || `Scene ${current.sortIndex + 1}`} · {current.minutes} min</p>
              <p className="mt-1 text-2xl sm:text-3xl font-bold text-cream leading-tight">{current.title || 'Untitled scene'}</p>
              {current.cast.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {current.cast.map((c) => (
                    <span key={c} className="rounded-full border-2 border-[#00ff88]/70 bg-[#0b0d12] px-4 py-1.5 text-base font-bold text-[#00ff88]">{c}</span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#9aa3b2]">No cast listed for this scene.</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#9aa3b2]">No scene selected yet. The stage manager advances the show from the controls.</p>
          )}
        </div>
      </Panel>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6 min-w-0">
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
                    {upNext.cast.map((c) => (
                      <span key={c} className="rounded-full border border-[#2a3040] bg-[#161a22] px-3 py-1 text-xs text-cream/60">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#9aa3b2]">Last scene.</p>
            )}
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-cream/60" />
              <h2 className="font-bold text-cream">Tonight's notes</h2>
            </div>
            {current && current.notes.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {current.notes.map((n, i) => (
                  <li key={i} className="text-sm text-cream/80 rounded-xl bg-[#0b0d12] border border-[#1e232d] px-3 py-2">{n}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[#9aa3b2]">No notes for {current?.title || 'the current scene'}.</p>
            )}
          </Panel>

          {isAdmin && (
            <Panel className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-[#9aa3b2] mr-1">Controls</span>
                {(['standby', 'rehearsal', 'live', 'intermission', 'finished'] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={board.status === s ? 'default' : 'outline'}
                    className={board.status === s ? undefined : 'text-xs'}
                    onClick={() => onControl('status', { status: s })}
                  >
                    {statusOf(s).label}
                  </Button>
                ))}
                <span className="mx-2 h-6 w-px bg-[#1e232d]" />
                <Button size="sm" variant="outline" onClick={() => onControl('scene', { sceneIndex: Math.max(0, board.currentSceneIndex - 1) })} disabled={board.currentSceneIndex <= 0}>
                  <ChevronLeft className="h-4 w-4" />Prev
                </Button>
                {board.timerMode === 'running' ? (
                  <Button size="sm" variant="outline" onClick={() => onControl('pause')}><Pause className="h-4 w-4 mr-1" />Pause</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onControl('start')}><Play className="h-4 w-4 mr-1" />Start</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onControl('reset')}><RotateCcw className="h-4 w-4 mr-1" />Reset</Button>
                <Button size="sm" variant="outline" onClick={() => onControl('scene', { sceneIndex: board.currentSceneIndex + 1 })} disabled={board.currentSceneIndex >= scenes.length - 1}>
                  Next<ChevronRight className="h-4 w-4" />
                </Button>
                <a href="/admin/live-show" className="ml-auto text-xs text-cream/60 hover:text-cream flex items-center gap-1">
                  <Settings2 className="h-3.5 w-3.5" />Full setup
                </a>
              </div>
            </Panel>
          )}
        </div>

        <Panel className="p-5 h-fit lg:sticky lg:top-20">
          <h2 className="font-bold text-cream flex items-center gap-2">Running order <span className="text-xs font-normal text-[#9aa3b2]">{scenes.length} scenes</span></h2>
          <div className="mt-3 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {scenes.length === 0 && <p className="text-sm text-[#9aa3b2]">No scenes set up yet. The stage manager can add them in Live Show setup.</p>}
            {scenes.map((s) => {
              const isCurrent = s.sortIndex === board.currentSceneIndex;
              return (
                <div
                  key={s.id}
                  className={cn(
                    'rounded-xl border px-3 py-2.5',
                    isCurrent ? 'border-red-500/50 bg-red-500/5' : 'border-[#1e232d] bg-[#0b0d12]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('font-mono text-xs', isCurrent ? 'text-red-400' : 'text-[#525b6c]')}>{s.label || s.sortIndex + 1}</span>
                    <p className={cn('font-medium text-sm truncate', isCurrent ? 'text-cream' : 'text-cream/75')}>{s.title || 'Untitled'}</p>
                    <span className="ml-auto text-[11px] text-[#9aa3b2]">{s.minutes}m</span>
                  </div>
                  {s.cast.length > 0 && (
                    <p className="mt-1 text-[11px] text-[#9aa3b2] truncate">{s.cast.join(' \u00b7 ')}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {canEdit && (
        <Panel className="p-4">
          <button type="button" onClick={() => setScriptOpen(!scriptOpen)} className="flex w-full items-center gap-2 text-left">
            <ScrollText className="h-4 w-4 text-cream/60" />
            <span className="text-sm font-semibold text-cream">Show script</span>
            {!isAdmin && <span className="text-xs text-[#9aa3b2]">(crew editing is on)</span>}
            <ChevronDown className={cn('ml-auto h-4 w-4 text-cream/50 transition-transform', scriptOpen && 'rotate-180')} />
          </button>
          {scriptOpen && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-1 rounded-lg bg-[#0b0d12] border border-[#1e232d] p-1 w-fit">
                {(['shared', 'private'] as const).map((sc) => (
                  <button key={sc} onClick={() => setScriptScope(sc)} className={cn('px-3 py-1 text-sm rounded-md', scriptScope === sc ? 'bg-[#1e232d] text-cream' : 'text-[#9aa3b2]')}>
                    {sc === 'shared' ? 'Shared version' : 'My private version'}
                  </button>
                ))}
              </div>
              <textarea
                value={scriptScope === 'shared' ? sharedDraft : privateDraft}
                onChange={(e) => (scriptScope === 'shared' ? setSharedDraft(e.target.value) : setPrivateDraft(e.target.value))}
                placeholder="Write the shared script here, or your own private one on the other tab\u2026"
                className="w-full h-72 font-mono text-sm bg-[#0b0d12] border border-[#1e232d] rounded-xl p-3 text-cream outline-none resize-y placeholder:text-[#525b6c]"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={onRefresh}>Reload</Button>
                <Button size="sm" onClick={saveScript} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save {scriptScope === 'shared' ? 'shared' : 'private'} script
                </Button>
              </div>
            </div>
          )}
        </Panel>
      )}
    </main>
  );
}

export default function LiveShowDash() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'boot' | 'closed' | 'gate' | 'board'>('boot');
  const [board, setBoard] = useState<Board | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [scripts, setScripts] = useState<{ shared: string; private: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const guestCode = useRef<string | null>(null);

  const applyMember = useCallback((r: MemberState) => {
    if (!r.open) {
      setPhase('closed');
      return;
    }
    setBoard(r.liveShow as unknown as Board);
    setScenes((r.scenes ?? []) as Scene[]);
    setCanEdit(!!r.canEdit);
    setScripts(r.scripts ? { shared: r.scripts.shared ?? '', private: r.scripts.private ?? '' } : null);
    setPhase('board');
  }, []);

  const applyGuest = useCallback((r: GuestState) => {
    if (!r.open) {
      setPhase('closed');
      return;
    }
    if (!r.authorized || !r.liveShow) {
      setPhase('gate');
      return;
    }
    setBoard(r.liveShow as unknown as Board);
    setScenes((r.scenes ?? []) as Scene[]);
    setPhase('board');
  }, []);

  const loadMember = useCallback(async () => {
    const r = await getLiveShowMember({});
    applyMember(r);
  }, [applyMember]);

  const loadGuest = useCallback(async () => {
    const code = guestCode.current ?? sessionStorage.getItem(GUEST_CODE_KEY) ?? '';
    const r = await getLiveShowState({ code: code || undefined });
    if (r.open && r.authorized && code) guestCode.current = code;
    applyGuest(r);
  }, [applyGuest]);

  const boot = useCallback(async (signedIn: boolean) => {
    setPhase('boot');
    try {
      if (signedIn) {
        const meRes = await getMe({});
        setIsAdmin(!!meRes.member?.isAdmin);
        await loadMember();
      } else {
        setIsAdmin(false);
        await loadGuest();
      }
    } catch {
      // Signed-in but not on the crew list falls back to the public gate.
      try { await loadGuest(); } catch { setPhase('closed'); }
    }
  }, [loadMember, loadGuest]);

  useEffect(() => {
    if (authLoading) return;
    boot(!!user);
  }, [authLoading, user, boot]);

  const refresh = useCallback(() => {
    return (user ? loadMember() : loadGuest()).catch(() => {});
  }, [user, loadMember, loadGuest]);

  // Keep the dashboard roughly live; between polls the local clock ticks over.
  useEffect(() => {
    if (phase !== 'board') return;
    const id = window.setInterval(() => { refresh(); }, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [phase, refresh]);

  const control = useCallback(async (action: string, extra?: { status?: string; sceneIndex?: number }) => {
    if (!board) return;
    try {
      await adminLiveShowControl({ liveShowId: board.id, action, ...extra });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [board, refresh]);

  const title = board?.name || 'Live Show';
  const subtitle = board ? `${board.areaName} \u00b7 backstage` : '';

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
            <p className="text-sm text-[#9aa3b2]">The stage manager opens it up when the production is running. The dashboard and show code go live from here.</p>
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
      <DashTopBar title={title} subtitle={subtitle} />
      <ShowBoard
        board={board!}
        scenes={scenes}
        canEdit={canEdit}
        scripts={scripts}
        isAdmin={isAdmin}
        onRefresh={() => { void refresh(); }}
        onControl={control}
      />
    </div>
  );
}