import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  adminGetLiveShow, adminSaveLiveShow, adminSaveLiveShowScenes, adminLiveShowControl,
  adminLiveShowDevice, liveShowChat, liveShowAnnouncement, saveLiveShowScript, adminImportLiveShowScenes,
} from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@project/components/ui/select';
import {
  Loader2, Plus, Trash2, ArrowUp, ArrowDown, Tv, Play, Pause, RotateCcw, ChevronLeft,
  ChevronRight, Save, ScrollText, BellRing, Megaphone, MessageSquare, Monitor, Smartphone,
  Tablet, Power, Radio, Pencil, X,
} from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { useAdminData } from '../../lib/useAdminData';

const STATUSES = ['standby', 'rehearsal', 'live', 'intermission', 'finished'] as const;
const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type LS = {
  id: string;
  name: string;
  areaName: string;
  status: string;
  open: boolean;
  intermissionMinutes: number;
  timerMode: 'running' | 'stopped';
  timerStartAt: string | null;
  timerElapsedMs: number;
  currentSceneIndex: number;
  movementAlert: boolean;
  movementMessage: string;
  movementSeconds: number;
  movementAdmins: string[];
};

type Scene = {
  id: string; label: string; title: string; minutes: number;
  cast: string[]; props: string[]; notes: string[]; sortIndex: number;
};

type Device = {
  id: string; deviceKey: string; name: string; platform: string;
  enabled: boolean; online: boolean; adminView: boolean;
  movementAlert: boolean; movementMessage: string; movementSeconds: number; movementAdmins: string[];
  lastSeenAt: string | null; connectedSince: string | null;
};

type Touch = { id: string; deviceKey: string; deviceName: string; kind: string; createdAt: string | null };
type Message = { id: string; authorName: string; body: string; kind: string; createdAt: string | null };
type Announcement = { id: string; body: string; authorName: string; seconds: number; expiresAt: string | null; createdAt: string | null };

type SceneRow = {
  key: string; label: string; title: string; minutes: string;
  castText: string; propsText: string; notesText: string;
};

type FormState = {
  name: string; areaName: string; intermissionMinutes: number;
  movementAlert: boolean; movementMessage: string; movementSeconds: number; movementAdmins: string[];
};

const newRow = (): SceneRow => ({ key: Math.random().toString(36).slice(2), label: '', title: '', minutes: '0', castText: '', propsText: '', notesText: '' });
const rowsFrom = (scenes: Scene[]): SceneRow[] =>
  scenes.map((s) => ({ key: s.id, label: s.label, title: s.title, minutes: String(s.minutes), castText: s.cast.join(', '), propsText: (s.props ?? []).join('\n'), notesText: s.notes.join('\n') }));
const splitCast = (t: string) => t.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
const splitLines = (t: string) => t.split('\n').map((p) => p.trim()).filter(Boolean);

const defaultForm = (name = ''): FormState => ({
  name, areaName: '', intermissionMinutes: 15, movementAlert: false, movementMessage: '', movementSeconds: 30, movementAdmins: [],
});

const timeOf = (iso: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; }
};
const platformIcon = (p: string) => (/Mobile/i.test(p) ? <Smartphone className="h-4 w-4" /> : /Tablet/i.test(p) ? <Tablet className="h-4 w-4" /> : <Monitor className="h-4 w-4" />);

/**
 * Live show setup. Standalone it carries its own show picker; pass `showId` to
 * pin it to one show and hide the picker, which is how the show dashboard
 * embeds it.
 */
export default function LiveShowAdmin({ showId: fixedShowId }: { showId?: string } = {}) {
  const { data } = useAdminData();
  const shows = data?.shows ?? [];
  const admins = (data?.members ?? []).filter((m) => m.isAdmin);

  const [showId, setShowId] = useState<string | null>(fixedShowId ?? null);
  const [ls, setLs] = useState<LS | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [rows, setRows] = useState<SceneRow[]>([]);
  const [sharedLink, setSharedLink] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [devName, setDevName] = useState('');
  const [devAlert, setDevAlert] = useState(false);
  const [devMessage, setDevMessage] = useState('');
  const [devSeconds, setDevSeconds] = useState(30);
  const [devAdmins, setDevAdmins] = useState<string[]>([]);

  const [chatText, setChatText] = useState('');
  const [annText, setAnnText] = useState('');
  const [annSeconds, setAnnSeconds] = useState(30);
  const [annUntilCleared, setAnnUntilCleared] = useState(false);

  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingScenes, setSavingScenes] = useState(false);
  const [savingScript, setSavingScript] = useState(false);
  const [importing, setImporting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    if (fixedShowId) {
      if (showId !== fixedShowId) setShowId(fixedShowId);
      return;
    }
    if (showId || shows.length === 0) return;
    // 331a178a: auto-select the show if one is live/open; else first
    const live = shows.find((s: any) => s.open || s.status === 'live' || s.status === 'rehearsal' || s.status === 'intermission');
    setShowId(String((live ?? shows[0]).id));
  }, [shows, showId, fixedShowId]);

  const loadShow = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const r = (await adminGetLiveShow({ showId: id })) as {
        liveShow: LS | null;
        scenes: Scene[];
        scripts: { sharedLink: string } | null;
        devices: Device[];
        touches: Touch[];
        messages: Message[];
        announcements: Announcement[];
      };
      setLs(r.liveShow ?? null);
      setForm(r.liveShow
        ? {
            name: r.liveShow.name ?? '',
            areaName: r.liveShow.areaName ?? 'Stage',
            intermissionMinutes: Number(r.liveShow.intermissionMinutes ?? 15),
            movementAlert: !!r.liveShow.movementAlert,
            movementMessage: r.liveShow.movementMessage ?? '',
            movementSeconds: Number(r.liveShow.movementSeconds ?? 30),
            movementAdmins: (r.liveShow.movementAdmins ?? []) as string[],
          }
        : defaultForm(shows.find((s) => String(s.id) === id)?.name ?? ''));
      setRows(rowsFrom((r.scenes as Scene[]) ?? []));
      setSharedLink(r.scripts?.sharedLink ?? '');
      setDevices((r.devices as Device[]) ?? []);
      setTouches((r.touches as Touch[]) ?? []);
      setMessages((r.messages as Message[]) ?? []);
      setAnnouncements((r.announcements as Announcement[]) ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [shows]);

  useEffect(() => { if (showId) void loadShow(showId); }, [showId, loadShow]);

  const selectDevice = (d: Device) => {
    setSelectedDevice(d.id);
    setDevName(d.name);
    setDevAlert(d.movementAlert);
    setDevMessage(d.movementMessage);
    setDevSeconds(d.movementSeconds || 30);
    setDevAdmins(d.movementAdmins ?? []);
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const startShow = async () => {
    if (!showId) return;
    setStarting(true);
    try {
      const saved = await adminSaveLiveShow({
        showId, name: form.name, areaName: form.areaName, status: 'live', open: true,
        intermissionMinutes: form.intermissionMinutes, movementAlert: form.movementAlert,
        movementMessage: form.movementMessage, movementSeconds: Math.max(10, Math.min(600, Math.floor(form.movementSeconds) || 30)),
        movementAdmins: form.movementAdmins,
      });
      if (saved.liveShow) await adminLiveShowControl({ liveShowId: saved.liveShow.id, action: 'start' });
      toast.success('Show started. Screens are live.');
      await loadShow(showId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const stopShow = async () => {
    if (!showId) return;
    if (!window.confirm('Stop the show? Every screen goes back to "No show running".')) return;
    setStarting(true);
    try {
      await adminSaveLiveShow({ showId, open: false, status: 'finished' });
      toast.success('Show stopped.');
      await loadShow(showId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const saveConfig = async () => {
    if (!showId) return;
    setSavingConfig(true);
    try {
      await adminSaveLiveShow({
        showId, name: form.name, areaName: form.areaName, intermissionMinutes: form.intermissionMinutes,
        movementAlert: form.movementAlert, movementMessage: form.movementMessage,
        movementSeconds: Math.max(10, Math.min(600, Math.floor(form.movementSeconds) || 30)),
        movementAdmins: form.movementAdmins,
      });
      toast.success('Settings saved');
      await loadShow(showId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingConfig(false);
    }
  };

  const run = async (action: string, extra?: { status?: string; sceneIndex?: number }) => {
    if (!ls) return;
    setBusyAction(action);
    try {
      await adminLiveShowControl({ liveShowId: ls.id, action, ...extra });
      await loadShow(showId!);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyAction('');
    }
  };

  const saveScenes = async () => {
    if (!ls) return;
    setSavingScenes(true);
    try {
      await adminSaveLiveShowScenes({
        liveShowId: ls.id,
        scenes: rows.map((row) => ({
          label: row.label, title: row.title, minutes: Math.max(0, Number(row.minutes) || 0),
          cast: splitCast(row.castText), props: splitLines(row.propsText), notes: splitLines(row.notesText),
        })),
      });
      toast.success('Scene list saved');
      await loadShow(showId!);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingScenes(false);
    }
  };

  const saveScript = async () => {
    if (!ls) return;
    setSavingScript(true);
    try { await saveLiveShowScript({ liveShowId: ls.id, sharedLink }); toast.success('Script link saved'); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSavingScript(false); }
  };

  const saveDevice = async () => {
    if (!selectedDevice) return;
    setSavingDevice(true);
    try {
      await adminLiveShowDevice({
        deviceId: selectedDevice, name: devName.trim(), movementAlert: devAlert, movementMessage: devMessage,
        movementSeconds: Math.max(2, Math.min(600, Math.floor(devSeconds) || 30)), movementAdmins: devAdmins,
      });
      toast.success('Screen updated');
      await loadShow(showId!);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingDevice(false); }
  };

  const removeDevice = async () => {
    if (!selectedDevice) return;
    if (!window.confirm('Remove this screen? It is un-enabled and disappears from the list.')) return;
    setSavingDevice(true);
    try {
      await adminLiveShowDevice({ deviceId: selectedDevice, remove: true });
      toast.success('Screen removed');
      setSelectedDevice(null);
      await loadShow(showId!);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingDevice(false); }
  };

  const sendChat = async () => {
    const body = chatText.trim();
    if (!body || !ls) return;
    try { await liveShowChat({ liveShowId: ls.id, body }); setChatText(''); await loadShow(showId!); }
    catch (e) { toast.error((e as Error).message); }
  };

  const announce = async () => {
    const body = annText.trim();
    if (!body || !ls) return;
    try {
      const seconds = annUntilCleared ? 0 : Math.min(145, Math.max(2, Math.floor(annSeconds) || 30));
      await liveShowAnnouncement({ liveShowId: ls.id, body, seconds });
      setAnnText(''); toast.success('Announcement is on every screen'); await loadShow(showId!);
    } catch (e) { toast.error((e as Error).message); }
  };

  const clearAnnouncements = async () => {
    if (!ls) return;
    try { await liveShowAnnouncement({ liveShowId: ls.id, clear: true }); await loadShow(showId!); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (!fixedShowId && shows.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Tv className="h-5 w-5" />Live Show Setup</h1>
        <p className="text-muted-foreground">Create a show first, then set up its live show.</p>
      </div>
    );
  }

  const selected = devices.find((d) => d.id === selectedDevice) ?? null;

  return (
    <div className="space-y-6">
      {!fixedShowId && (
        <>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Tv className="h-5 w-5" />Live Show Setup</h1>
            <p className="text-muted-foreground">Start tonight's show, watch every screen, and control it from here.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Show</span>
            <Select value={showId ?? undefined} onValueChange={setShowId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Pick a show" /></SelectTrigger>
              <SelectContent>
                {shows.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </>
      )}
      {fixedShowId && loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the live show…</div>
      )}

      {/* Start / stop */}
      <div className={cn('rounded-lg border p-5 space-y-4', ls?.open ? 'border-emerald-500/40 bg-emerald-500/5' : 'bg-card')}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold flex items-center gap-2"><Power className="h-4 w-4" />Show</h2>
          {ls?.open ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />Live now
            </span>
          ) : (
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Not started</span>
          )}
          <div className="ml-auto">
            {ls?.open
              ? <Button variant="destructive" onClick={stopShow} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}Stop Show</Button>
              : <Button onClick={startShow} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Start Show</Button>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {ls?.open
            ? 'Screens are showing the board. Stopping sends them all back to "No show running".'
            : 'Starting saves the settings below, opens the show and starts the clock. Screens that are enabled switch to the board.'}
        </p>
      </div>

      {/* Quick controls */}
      {ls?.open && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Radio className="h-4 w-4" />Quick controls</h2>
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => (
              <Button key={s} size="sm" variant={ls.status === s ? 'default' : 'outline'} disabled={!!busyAction} onClick={() => void run('status', { status: s })}>{statusLabel(s)}</Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={!!busyAction || ls.currentSceneIndex <= 0} onClick={() => void run('scene', { sceneIndex: ls.currentSceneIndex - 1 })}><ChevronLeft className="h-4 w-4" />Prev</Button>
            {ls.timerMode === 'running'
              ? <Button size="sm" variant="outline" disabled={!!busyAction} onClick={() => void run('pause')}><Pause className="h-4 w-4 mr-1" />Pause</Button>
              : <Button size="sm" variant="outline" disabled={!!busyAction} onClick={() => void run('start')}><Play className="h-4 w-4 mr-1" />Start clock</Button>}
            <Button size="sm" variant="outline" disabled={!!busyAction} onClick={() => void run('reset')}><RotateCcw className="h-4 w-4 mr-1" />Reset clock</Button>
            <Button size="sm" variant="outline" disabled={!!busyAction} onClick={() => void run('scene', { sceneIndex: ls.currentSceneIndex + 1 })}>Next<ChevronRight className="h-4 w-4" /></Button>
            <span className="ml-auto text-xs text-muted-foreground">Scene {ls.currentSceneIndex + 1}</span>
          </div>
        </div>
      )}

      {/* Devices */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Monitor className="h-4 w-4" />Screens</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No screens yet. Open /show-dash on a device and enable it to appear here.</p>
        ) : (
          <div className="space-y-4">
            <div className="divide-y rounded-md border">
              {devices.map((d) => (
                <button key={d.id} type="button" onClick={() => selectDevice(d)}
                  className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50', selectedDevice === d.id && 'bg-muted/60')}>
                  <span className="text-muted-foreground">{platformIcon(d.platform)}</span>
                  <span className="font-medium">{d.name || 'Unnamed screen'}</span>
                  <span className={cn('h-2 w-2 rounded-full', d.online ? 'bg-emerald-500' : 'bg-muted-foreground/40')} title={d.online ? 'Online' : 'Offline'} />
                  {!d.enabled && <span className="text-[11px] text-muted-foreground">(not enabled)</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{d.lastSeenAt ? `seen ${timeOf(d.lastSeenAt)}` : ''}</span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">{selected.name || 'Unnamed screen'}</h3>
                  <span className="ml-auto text-xs text-muted-foreground">{selected.platform || 'Unknown'} · since {timeOf(selected.connectedSince)}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedDevice(null)}><X className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Screen name</label>
                    <Input value={devName} maxLength={120} onChange={(e) => setDevName(e.target.value)} placeholder="e.g. Stage Left" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Re-warn after (seconds)</label>
                    <Input type="number" min={2} max={600} value={devSeconds} onChange={(e) => setDevSeconds(Math.max(2, Math.min(600, Number(e.target.value) || 30)))} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={devAlert} onChange={(e) => setDevAlert(e.target.checked)} />
                  Warn this screen when it is moved or a key is pressed
                </label>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Warning message on this screen</label>
                  <Input value={devMessage} maxLength={400} placeholder="Please do not touch this screen" onChange={(e) => setDevMessage(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Special admins who get this screen's alert</label>
                  <div className="flex flex-wrap gap-2">
                    {admins.map((m) => {
                      const on = devAdmins.includes(m.id);
                      return (
                        <button type="button" key={m.id}
                          onClick={() => setDevAdmins(on ? devAdmins.filter((id) => id !== m.id) : [...devAdmins, m.id])}
                          className={cn('rounded-full border px-3 py-1 text-xs transition', on ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50')}>
                          {m.firstName} {m.lastName}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => void saveDevice()} disabled={savingDevice}>
                    {savingDevice ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save screen
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => void removeDevice()} disabled={savingDevice}><Trash2 className="h-4 w-4 mr-1" />Remove</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Touch log */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><BellRing className="h-4 w-4" />Touch log</h2>
        {touches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bumps or key presses yet.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y rounded-md border text-sm">
            {touches.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', t.kind === 'key' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400')}>{t.kind}</span>
                <span className="font-medium">{t.deviceName || 'Unnamed screen'}</span>
                <span className="ml-auto text-xs text-muted-foreground">{timeOf(t.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Announcements */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4" />Announcements</h2>
        <p className="text-xs text-muted-foreground">Shown big on every screen. It is copied into the chat so it is still there after it disappears.</p>
        {announcements.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {announcements.map((a) => <span key={a.id} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs">{a.body}</span>)}
            <Button size="sm" variant="ghost" onClick={() => void clearAnnouncements()} >Clear all</Button>
          </div>
        )}
        <Textarea value={annText} maxLength={500} rows={2} placeholder="Announcement for every screen" onChange={(e) => setAnnText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <Input type="number" min={2} max={145} value={annSeconds} disabled={annUntilCleared} onChange={(e) => setAnnSeconds(Number(e.target.value))} className="w-24" />
          <span className="text-xs text-muted-foreground">seconds</span>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={annUntilCleared} onCheckedChange={(c) => setAnnUntilCleared(!!c)} />until cleared
          </label>
          <Button size="sm" className="ml-auto" disabled={!annText.trim()} onClick={() => void announce()}><Megaphone className="h-4 w-4 mr-1" />Announce</Button>
        </div>
      </div>

      {/* Chat */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" />Live chat</h2>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={cn('rounded-md border px-3 py-2 text-sm', m.kind === 'announcement' && 'border-amber-500/40 bg-amber-500/5')}>
              <span className="font-medium">{m.authorName || 'Admin'}</span>
              <span className="ml-2 text-xs text-muted-foreground">{timeOf(m.createdAt)}</span>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={chatText} maxLength={500} placeholder="Message the cast…" onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void sendChat(); } }} />
          <Button size="sm" disabled={!chatText.trim()} onClick={() => void sendChat()}><MessageSquare className="h-4 w-4 mr-1" />Send</Button>
        </div>
      </div>

      {/* Settings + movement defaults */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Tv className="h-4 w-4" />Show settings</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm">Name shown on screens</label>
            <Input value={form.name} onChange={(e) => setField('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm">Backstage area name</label>
            <Input value={form.areaName} onChange={(e) => setField('areaName', e.target.value)} placeholder="Main Stage" />
          </div>
          <div className="space-y-1">
            <label className="text-sm">Intermission length (minutes)</label>
            <Input type="number" min={0} value={form.intermissionMinutes} onChange={(e) => setField('intermissionMinutes', Math.max(0, Number(e.target.value) || 0))} />
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><BellRing className="h-4 w-4" />Movement alert defaults</h3>
          <p className="text-xs text-muted-foreground">New screens copy these when they are enabled. Changing them does not affect screens that have already customised their own.</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.movementAlert} onCheckedChange={(c) => setField('movementAlert', !!c)} />
            <span className={cn(form.movementAlert && 'font-medium')}>Warn screens when they are moved or a key is pressed</span>
          </label>
          <div className="grid sm:grid-cols-[1fr_140px] gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Default warning message</label>
              <Input value={form.movementMessage} maxLength={400} placeholder="Please do not move this screen" onChange={(e) => setField('movementMessage', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Re-warn after (seconds)</label>
              <Input type="number" min={10} max={600} value={form.movementSeconds} onChange={(e) => setField('movementSeconds', Math.max(10, Math.min(600, Number(e.target.value) || 30)))} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Default special admins for new screens</label>
            <div className="flex flex-wrap gap-2">
              {admins.map((m) => {
                const on = form.movementAdmins.includes(m.id);
                return (
                  <button type="button" key={m.id}
                    onClick={() => setField('movementAdmins', on ? form.movementAdmins.filter((id) => id !== m.id) : [...form.movementAdmins, m.id])}
                    className={cn('rounded-full border px-3 py-1 text-xs transition', on ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50')}>
                    {m.firstName} {m.lastName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveConfig} disabled={savingConfig}>
            {savingConfig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save settings
          </Button>
        </div>
      </div>

      {/* Running order */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4" />Running order</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!ls || importing}
              title="Add any show-workspace scenes the running order is missing"
              onClick={async () => {
                if (!showId) return;
                setImporting(true);
                try {
                  const r = await adminImportLiveShowScenes({ showId });
                  toast.success(r.added ? `Added ${r.added} scene${r.added === 1 ? '' : 's'} from the show` : 'Already up to date');
                  await loadShow(showId);
                } catch (e) { toast.error((e as Error).message); }
                finally { setImporting(false); }
              }}
            >
              {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScrollText className="h-4 w-4 mr-1" />}
              Import from show
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRows((r) => [...r, newRow()])} disabled={!ls}><Plus className="h-4 w-4 mr-1" />Add scene</Button>
          </div>
        </div>
        {!ls ? (
          <p className="text-sm text-muted-foreground">Start the show once to create it, then build the running order.</p>
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
                <div className="grid sm:grid-cols-[120px_1fr_100px] gap-3">
                  <Input value={row.label} placeholder="Label" onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} />
                  <Input value={row.title} placeholder="Scene title" onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)))} />
                  <Input type="number" min={0} value={row.minutes} onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, minutes: e.target.value } : x)))} />
                </div>
                <Input value={row.castText} placeholder="Cast on stage (comma separated)" onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, castText: e.target.value } : x)))} />
                <Textarea value={row.propsText} placeholder="Props on stage / to hand (one per line)" rows={2} onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, propsText: e.target.value } : x)))} />
                <Textarea value={row.notesText} placeholder="Director notes, cues. One note per line." rows={2} onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, notesText: e.target.value } : x)))} />
              </div>
            ))}
            <div className="flex justify-end">
              <Button onClick={saveScenes} disabled={savingScenes}>
                {savingScenes ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save scene list
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Script */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4" />Script</h2>
        {!ls ? (
          <p className="text-sm text-muted-foreground">Start the show once to unlock the script link.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">The script lives in OneDrive. Paste the OneDrive embed link here and the board shows it inline, with an "Open in OneDrive" fallback.</p>
            <Input value={sharedLink} placeholder="https://onedrive.live.com/embed?resid=..." onChange={(e) => setSharedLink(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={saveScript} disabled={savingScript}>
                {savingScript ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save script link
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
