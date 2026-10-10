import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  adminGetLiveShow, adminSaveLiveShow, adminSaveLiveShowScenes, adminLiveShowControl, saveLiveShowScript,
} from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@project/components/ui/select';
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Tv, DoorOpen, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Save, ScrollText, BellRing } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { useAdminData } from '../../lib/useAdminData';
import { useMe } from '../../lib/me';

const STATUSES = ['standby', 'rehearsal', 'live', 'intermission', 'finished'] as const;
const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type LS = {
  id: string;
  name: string;
  areaName: string;
  status: string;
  open: boolean;
  code: string;
  intermissionMinutes: number;
  timerMode: 'running' | 'stopped';
  timerStartAt: string | null;
  timerElapsedMs: number;
  currentSceneIndex: number;
  crewCanEdit: boolean;
};

type SceneRow = {
  key: string;
  label: string;
  title: string;
  minutes: string;
  castText: string;
  propsText: string;
  notesText: string;
};

type CanScene = {
  id: string;
  label: string;
  title: string;
  minutes: number;
  cast: string[];
  props: string[];
  notes: string[];
  sortIndex: number;
};

const newRow = (): SceneRow => ({ key: Math.random().toString(36).slice(2), label: '', title: '', minutes: '0', castText: '', propsText: '', notesText: '' });

const rowsFrom = (scenes: CanScene[]): SceneRow[] =>
  scenes.map((s) => ({
    key: s.id,
    label: s.label,
    title: s.title,
    minutes: String(s.minutes),
    castText: s.cast.join(', '),
    propsText: (s.props ?? []).join('\n'),
    notesText: s.notes.join('\n'),
  }));

const splitCast = (text: string) =>
  text.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
const splitNotes = (text: string) =>
  text.split('\n').map((p) => p.trim()).filter(Boolean);

type FormState = {
  name: string;
  areaName: string;
  status: string;
  open: boolean;
  code: string;
  intermissionMinutes: number;
  crewCanEdit: boolean;
  movementAlert: boolean;
  movementMessage: string;
  movementSeconds: number;
  movementAdmins: string[];
};

const defaultForm = (name = ''): FormState => ({
  name,
  areaName: '',
  status: 'standby',
  open: false,
  code: '',
  intermissionMinutes: 15,
  crewCanEdit: false,
  movementAlert: false,
  movementMessage: '',
  movementSeconds: 30,
  movementAdmins: [],
});

export default function LiveShowAdmin() {
  const { data, reload: reloadShows } = useAdminData();
  const { refreshMe } = useMe();
  const shows = data?.shows ?? [];
  const admins = (data?.members ?? []).filter((m) => m.isAdmin);

  const [showId, setShowId] = useState<string | null>(null);
  const [ls, setLs] = useState<LS | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [rows, setRows] = useState<SceneRow[]>([]);
  const [sharedLink, setSharedLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingScenes, setSavingScenes] = useState(false);
  const [savingScript, setSavingScript] = useState(false);
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    if (!showId && shows.length > 0) setShowId(String(shows[0].id));
  }, [shows, showId]);

  const loadAll = useCallback(async (id: string, seedName: string) => {
    setLoading(true);
    try {
      const r = await adminGetLiveShow({ showId: id });
      setLs(r.liveShow as LS | null);
      setForm(r.liveShow
        ? {
            name: r.liveShow.name ?? '',
            areaName: r.liveShow.areaName ?? 'Stage',
            status: r.liveShow.status ?? 'standby',
            open: !!r.liveShow.open,
            code: r.liveShow.code ?? '',
            intermissionMinutes: Number(r.liveShow.intermissionMinutes ?? 15),
            crewCanEdit: !!r.liveShow.crewCanEdit,
            movementAlert: !!r.liveShow.movementAlert,
            movementMessage: r.liveShow.movementMessage ?? '',
            movementSeconds: Number(r.liveShow.movementSeconds ?? 30),
            movementAdmins: (r.liveShow.movementAdmins ?? []) as string[],
          }
        : defaultForm(seedName));
      setRows(rowsFrom((r.scenes as CanScene[]) ?? []));
      setSharedLink(r.scripts?.sharedLink ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLiveShow = useCallback(async (id: string) => {
    const r = await adminGetLiveShow({ showId: id });
    if (r.liveShow) setLs(r.liveShow as LS);
  }, []);

  const selected = shows.find((s) => String(s.id) === showId);

  useEffect(() => {
    if (showId) void loadAll(showId, selected?.name ?? '');
  }, [showId, selected, loadAll]);

  const saveConfig = async () => {
    if (!showId) return;
    setSavingConfig(true);
    try {
      const r = await adminSaveLiveShow({
        showId,
        name: form.name,
        areaName: form.areaName,
        status: form.status,
        open: form.open,
        code: form.code,
        intermissionMinutes: form.intermissionMinutes,
        crewCanEdit: form.crewCanEdit,
        movementAlert: form.movementAlert,
        movementMessage: form.movementMessage,
        movementSeconds: form.movementSeconds,
        movementAdmins: form.movementAdmins,
      });
      setLs(r.liveShow as LS);
      setForm({
        name: r.liveShow.name ?? '',
        areaName: r.liveShow.areaName ?? 'Stage',
        status: r.liveShow.status ?? 'standby',
        open: !!r.liveShow.open,
        code: r.liveShow.code ?? '',
        intermissionMinutes: Number(r.liveShow.intermissionMinutes ?? 15),
        crewCanEdit: !!r.liveShow.crewCanEdit,
        movementAlert: !!r.liveShow.movementAlert,
        movementMessage: r.liveShow.movementMessage ?? '',
        movementSeconds: Number(r.liveShow.movementSeconds ?? 30),
        movementAdmins: (r.liveShow.movementAdmins ?? []) as string[],
      });
      toast.success(form.open ? 'Live show is open, dashboard is live' : 'Live show settings saved');
      await refreshMe();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingConfig(false);
    }
  };

  const saveScenes = async () => {
    if (!ls) return;
    setSavingScenes(true);
    try {
      const r = await adminSaveLiveShowScenes({
        liveShowId: ls.id,
        scenes: rows.map((row) => ({
          label: row.label,
          title: row.title,
          minutes: Math.max(0, Number(row.minutes) || 0),
          cast: splitCast(row.castText),
          props: splitNotes(row.propsText),
          notes: splitNotes(row.notesText),
        })),
      });
      setRows(rowsFrom((r.scenes as CanScene[]) ?? []));
      toast.success('Scene list saved');
      await loadLiveShow(showId!);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingScenes(false);
    }
  };

  const saveScript = async () => {
    if (!ls) return;
    setSavingScript(true);
    try {
      await saveLiveShowScript({ liveShowId: ls.id, sharedLink });
      toast.success('Script link saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingScript(false);
    }
  };

  const run = async (action: string, extra?: { status?: string; sceneIndex?: number }) => {
    if (!ls) return;
    setBusyAction(action + (extra?.status ?? extra?.sceneIndex ?? ''));
    try {
      await adminLiveShowControl({ liveShowId: ls.id, action, ...extra });
      await loadLiveShow(showId!);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyAction('');
    }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  if (shows.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Tv className="h-5 w-5" />Live Show Setup</h1>
        <p className="text-muted-foreground">Create a show first, then set up the live show dashboard for it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Tv className="h-5 w-5" />Live Show Setup</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure which show goes live, the show code, the clock and the running order. Save settings first, then the controls and scene list unlock for that show.</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Tie this setup to</label>
        <Select value={showId ?? undefined} onValueChange={(v) => setShowId(v)}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Choose a show" /></SelectTrigger>
          <SelectContent>
            {shows.map((s) => (
              <SelectItem key={String(s.id)} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void reloadShows()}>Refresh</Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading setup</div>
      )}

      {!loading && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Tv className="h-4 w-4" />Settings</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm">Show name shown on the dashboard</label>
                <Input value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm">Backstage area name</label>
                <Input value={form.areaName} onChange={(e) => setField('areaName', e.target.value)} placeholder="Main Stage" />
              </div>
              <div className="space-y-1">
                <label className="text-sm">Show code (guests need this)</label>
                <Input value={form.code} onChange={(e) => setField('code', e.target.value)} placeholder="e.g. HSM" className="uppercase" />
              </div>
              <div className="space-y-1">
                <label className="text-sm">Intermission length (minutes)</label>
                <Input type="number" min={0} value={form.intermissionMinutes} onChange={(e) => setField('intermissionMinutes', Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.open}
                  onCheckedChange={(c) => {
                    if (c && !window.confirm('Opening this live show closes any other open live show and makes the Live Show page public. Continue?')) return;
                    setField('open', !!c);
                  }}
                />
                <span className={cn(form.open && 'text-primary font-medium')}>{form.open ? 'This show is OPEN, the dashboard is live now' : 'Open this show (turns the dashboard on)'}</span>
              </label>
            </div>
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><BellRing className="h-4 w-4" />Movement alerts</h3>
              <p className="text-xs text-muted-foreground">If someone picks up or moves a screen showing the live board, that device shows a full-screen warning, and the special admins below get a push notification. Space bar does not count as movement.</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.movementAlert} onCheckedChange={(c) => setField('movementAlert', !!c)} />
                <span className={cn(form.movementAlert && 'font-medium')}>Turn movement alerts on for this show</span>
              </label>
              <div className="grid sm:grid-cols-[1fr_140px] gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Warning message shown on the moved screen</label>
                  <Input value={form.movementMessage} placeholder="Please do not move this screen" onChange={(e) => setField('movementMessage', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Re-warn after (seconds)</label>
                  <Input type="number" min={10} max={600} value={form.movementSeconds} onChange={(e) => setField('movementSeconds', Math.max(10, Math.min(600, Number(e.target.value) || 30)))} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Special admins who get the alert</label>
                {admins.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No admins found.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {admins.map((m) => {
                      const on = form.movementAdmins.includes(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => setField('movementAdmins', on ? form.movementAdmins.filter((id) => id !== m.id) : [...form.movementAdmins, m.id])}
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs transition',
                            on ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50',
                          )}
                        >
                          {m.firstName} {m.lastName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveConfig} disabled={savingConfig}>
                {savingConfig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save settings
              </Button>
              {ls?.open && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />Live now
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><DoorOpen className="h-4 w-4" />Quick controls {ls?.open && <span className="text-xs font-normal text-emerald-400">(also on the dashboard while you are signed in)</span>}</h2>
            {ls ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {STATUSES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={ls.status === s ? 'default' : 'outline'}
                      onClick={() => void run('status', { status: s })}
                      disabled={!!busyAction}
                    >
                      {statusLabel(s)}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void run('scene', { sceneIndex: Math.max(0, ls.currentSceneIndex - 1) })} disabled={!!busyAction || ls.currentSceneIndex <= 0}><ChevronLeft className="h-4 w-4" />Prev</Button>
                  {ls.timerMode === 'running'
                    ? <Button size="sm" variant="outline" onClick={() => void run('pause')} disabled={!!busyAction}><Pause className="h-4 w-4 mr-1" />Pause</Button>
                    : <Button size="sm" variant="outline" onClick={() => void run('start')} disabled={!!busyAction}><Play className="h-4 w-4 mr-1" />Start</Button>}
                  <Button size="sm" variant="outline" onClick={() => void run('reset')} disabled={!!busyAction}><RotateCcw className="h-4 w-4 mr-1" />Reset clock</Button>
                  <Button size="sm" variant="outline" onClick={() => void run('scene', { sceneIndex: ls.currentSceneIndex + 1 })} disabled={!!busyAction}><ChevronRight className="h-4 w-4" />Next</Button>
                </div>
                <p className="text-xs text-muted-foreground">Current scene index {ls.currentSceneIndex}. Start the clock and press Next as each scene goes on.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Save the settings above once to create the live show for this production, then the clock controls and scene list unlock.</p>
            )}
          </div>

          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4" />Running order</h2>
              <Button size="sm" variant="outline" onClick={() => setRows((r) => [...r, newRow()])} disabled={!ls}><Plus className="h-4 w-4 mr-1" />Add scene</Button>
            </div>
            {!ls ? (
              <p className="text-sm text-muted-foreground">Save the settings above once to unlock the scene list.</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scenes yet. Add the running order for tonight, one scene per row.</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row, i) => (
                  <div key={row.key} className="rounded-lg border bg-muted/40 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{i + 1}</span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => setRows((r) => { const c = [...r]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === rows.length - 1} onClick={() => setRows((r) => { const c = [...r]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; })}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="flex items-center gap-1 ml-auto">
                        {ls.currentSceneIndex === i && <span className="text-[10px] uppercase tracking-wide text-primary font-semibold px-1.5 py-0.5 rounded bg-primary/10">On stage</span>}
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-[80px_1fr_70px] gap-3">
                      <Input value={row.label} placeholder="Scene 1" onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} />
                      <Input value={row.title} placeholder="Scene title" onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)))} />
                      <Input type="number" min={0} value={row.minutes} placeholder="mins" onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, minutes: e.target.value } : x)))} />
                    </div>
                    <Input value={row.castText} placeholder="Cast on stage (comma separated)" onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, castText: e.target.value } : x)))} />
                    <Textarea value={row.propsText} placeholder="Props on stage / to hand (one per line)" rows={2} onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, propsText: e.target.value } : x)))} />
                    <Textarea value={row.notesText} placeholder="Director notes, cues. One note per line." rows={2} onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, notesText: e.target.value } : x)))} />
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button onClick={saveScenes} disabled={savingScenes}>
                    {savingScenes ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save scene list
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4" />Script</h2>
            {!ls ? (
              <p className="text-sm text-muted-foreground">Save the settings above once to unlock the script link.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">The script lives in OneDrive. Paste the OneDrive embed link here and the board shows it inline, with an "Open in OneDrive" fallback. There is only ever one script link.</p>
                <div className="space-y-1">
                  <label className="text-xs font-medium">OneDrive script link</label>
                  <Input value={sharedLink} placeholder="https://onedrive.live.com/embed?resid=..." onChange={(e) => setSharedLink(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Use the embed link (onedrive.live.com/embed...). A plain share link is shown as an "Open in OneDrive" button instead. Short 1drv.ms links cannot be embedded.</p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveScript} disabled={savingScript}>
                    {savingScript ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save script link
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}