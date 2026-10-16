import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  getShowWorkspace, saveChecklistItem, saveCue, saveProp, saveShowScene, saveRehearsalNote,
  saveSceneTiming, rollCall, signOffShow, sendCueCall, ackCueCall, requestCover, respondCover,
  setTechLock, getRehearsalOrder, getShowMedia, saveShowPhoto, saveDebrief, saveGreenRoomNote,
  saveLostItem, saveAudienceCount, type GetShowWorkspaceOutputType, type GetShowMediaOutputType,
} from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Input } from '@project/components/ui/input';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { ArrowLeft, ClipboardList, Lightbulb, Package, Layers, NotebookPen, Timer, CalendarCheck, Lock, Plus, Trash2, Megaphone, Bell, Camera, MessageSquareHeart, DoorOpen, Search, Ticket, Pin, Printer } from 'lucide-react';

type Ws = GetShowWorkspaceOutputType;
type Media = GetShowMediaOutputType;
type Tab = 'checklist' | 'cues' | 'props' | 'scenes' | 'notes' | 'timings' | 'day' | 'photos' | 'debrief' | 'green' | 'lost' | 'audience';

const TABS: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: 'checklist', label: 'Checklist', icon: ClipboardList },
  { id: 'cues', label: 'Cue sheet', icon: Lightbulb },
  { id: 'props', label: 'Props', icon: Package },
  { id: 'scenes', label: 'Scenes', icon: Layers },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'timings', label: 'Timings', icon: Timer },
  { id: 'day', label: 'Show day', icon: CalendarCheck },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'debrief', label: 'Debrief', icon: MessageSquareHeart },
  { id: 'green', label: 'Green room', icon: DoorOpen },
  { id: 'lost', label: 'Lost property', icon: Search },
  { id: 'audience', label: 'Box office', icon: Ticket },
];

export default function ShowWorkspace() {
  const { showId = '' } = useParams();
  const [ws, setWs] = useState<Ws | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [tab, setTab] = useState<Tab>('checklist');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await getShowWorkspace({ showId });
      setWs(d);
    } catch (e) {
      setError((e as Error).message || 'Could not load this show.');
    }
  }, [showId]);

  useEffect(() => { void load(); }, [load]);

  const loadMedia = useCallback(async () => {
    try {
      setMedia(await getShowMedia({ showId }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [showId]);

  useEffect(() => {
    if (MEDIA_TABS.includes(tab) && !media) void loadMedia();
  }, [tab, media, loadMedia]);

  if (error) {
    return (
      <div className="space-y-3">
        <Link to="/calendar" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Back to calendar</Link>
        <div className="rounded-2xl border bg-card p-6">{error}</div>
      </div>
    );
  }

  if (!ws) return <div className="space-y-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;

  const done = ws.checklist.filter((c) => c.done).length;
  const openCovers = ws.coverRequests.filter((c) => c.status === 'Open').length;

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    try { await fn(); await load(); if (media) await loadMedia(); if (msg) toast.success(msg); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-6 hc-stagger">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/calendar" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Back</Link>
          <h1 className="text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
            {ws.show.name}
            {ws.show.code && <Badge variant="outline" className="font-mono">{ws.show.code}</Badge>}
            {ws.techLocked && <Badge className="bg-amber-500 text-black gap-1"><Lock className="h-3 w-3" />Tech locked</Badge>}
          </h1>
          {ws.show.description && <p className="text-muted-foreground mt-1 max-w-2xl">{ws.show.description}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            {done}/{ws.checklist.length} checklist · {ws.cues.length} cues · {ws.props.length} props · {ws.scenes.length} scenes
            {openCovers > 0 && <> · <span className="text-amber-500">{openCovers} cover needed</span></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Batch 6: printable call sheet for the show day. */}
          <Link
            to={`/show/${showId}/sheet`}
            className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Printer className="mr-1 h-4 w-4" />Call sheet
          </Link>
          {ws.isAdmin && (
            <Button variant="outline" size="sm" onClick={() => act(() => setTechLock({ showId, locked: !ws.techLocked }), ws.techLocked ? 'Unlocked' : 'Tech Week locked')}>
              <Lock className="h-4 w-4 mr-1" />{ws.techLocked ? 'Unlock show' : 'Lock for Tech Week'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-3.5 py-2 rounded-xl border text-sm font-medium inline-flex items-center gap-1.5', tab === t.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'checklist' && <Checklist ws={ws} act={act} />}
      {tab === 'cues' && <Cues ws={ws} act={act} />}
      {tab === 'props' && <Props ws={ws} act={act} />}
      {tab === 'scenes' && <Scenes ws={ws} act={act} />}
      {tab === 'notes' && <Notes ws={ws} act={act} />}
      {tab === 'timings' && <Timings ws={ws} act={act} />}
      {tab === 'day' && <ShowDay ws={ws} act={act} />}
      {MEDIA_TABS.includes(tab) && (!media
        ? <div className="space-y-3"><Skeleton className="h-40 rounded-2xl" /></div>
        : <>
            {tab === 'photos' && <Photos media={media} act={act} />}
            {tab === 'debrief' && <Debrief media={media} act={act} />}
            {tab === 'green' && <GreenRoom media={media} act={act} />}
            {tab === 'lost' && <LostProperty media={media} act={act} />}
            {tab === 'audience' && <Audience media={media} act={act} />}
          </>)}
    </div>
  );
}

type ActFn = (fn: () => Promise<unknown>, msg?: string) => Promise<void>;

function Section({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-card p-5 space-y-4">{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Checklist({ ws, act }: { ws: Ws; act: ActFn }) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const groups = useMemo(() => {
    const map = new Map<string, Ws['checklist']>();
    for (const c of ws.checklist) {
      const k = c.category || 'General';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return [...map.entries()];
  }, [ws.checklist]);

  return (
    <Section>
      <div className="flex flex-wrap gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add an item (e.g. charge radio mics)" className="max-w-sm" />
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="w-32" />
        <Button disabled={!label.trim()} onClick={() => act(async () => { await saveChecklistItem({ showId: ws.show.id, label, category }); setLabel(''); }, 'Added')}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>
      {!ws.checklist.length && <Empty>Nothing on the list yet. Add the first thing that must not be forgotten.</Empty>}
      {groups.map(([cat, items]) => (
        <div key={cat} className="space-y-1.5">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{cat}</h3>
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <input type="checkbox" checked={c.done} className="h-4 w-4 accent-primary" onChange={(e) => act(() => saveChecklistItem({ showId: ws.show.id, id: c.id, done: e.target.checked }))} />
              <span className={cn('flex-1 text-sm', c.done && 'line-through text-muted-foreground')}>{c.label}{c.notes && <span className="text-muted-foreground"> · {c.notes}</span>}</span>
              {c.done && c.doneByName && <span className="text-xs text-muted-foreground">{c.doneByName}</span>}
              {ws.canDelete && <button onClick={() => act(() => saveChecklistItem({ showId: ws.show.id, id: c.id, remove: true }))} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      ))}
    </Section>
  );
}

function Cues({ ws, act }: { ws: Ws; act: ActFn }) {
  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState<'Lighting' | 'Sound' | 'AV' | 'Stage' | 'Other'>('Lighting');
  return (
    <Section>
      <div className="flex flex-wrap gap-2">
        <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Cue #" className="w-24" />
        <select value={department} onChange={(e) => setDepartment(e.target.value as typeof department)} className="rounded-md border bg-background px-3 text-sm">
          {['Lighting', 'Sound', 'AV', 'Stage', 'Other'].map((d) => <option key={d}>{d}</option>)}
        </select>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happens" className="max-w-sm" />
        <Button disabled={!number.trim() && !description.trim()} onClick={() => act(async () => { await saveCue({ showId: ws.show.id, number, description, department }); setNumber(''); setDescription(''); }, 'Cue added')}><Plus className="h-4 w-4 mr-1" />Add cue</Button>
      </div>
      {!ws.cues.length && <Empty>No cues yet. Add the lighting and sound cues as you build them.</Empty>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Dept</th><th className="py-2 pr-3">Scene</th><th className="py-2 pr-3">Cue</th><th className="py-2 pr-3">Standby</th><th className="py-2">Go</th></tr></thead>
          <tbody>
            {ws.cues.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2 pr-3 font-mono">{c.number}</td>
                <td className="py-2 pr-3">{c.department}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.scene}</td>
                <td className="py-2 pr-3">{c.description}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.standby}</td>
                <td className="py-2 text-muted-foreground">
                  {c.go}
                  {ws.canDelete && <button onClick={() => act(() => saveCue({ showId: ws.show.id, id: c.id, remove: true }))} className="ml-2 text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5 inline" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Props({ ws, act }: { ws: Ws; act: ActFn }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'Prop' | 'Costume' | 'Set' | 'Kit' | 'Other'>('Prop');
  return (
    <Section>
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="max-w-xs" />
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="rounded-md border bg-background px-3 text-sm">
          {['Prop', 'Costume', 'Set', 'Kit', 'Other'].map((c) => <option key={c}>{c}</option>)}
        </select>
        <Button disabled={!name.trim()} onClick={() => act(async () => { await saveProp({ showId: ws.show.id, name, category }); setName(''); }, 'Added to inventory')}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>
      {!ws.props.length && <Empty>No props or costumes tracked yet.</Empty>}
      <div className="grid gap-2 sm:grid-cols-2">
        {ws.props.map((p) => (
          <div key={p.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{p.name} {p.quantity > 1 && <span className="text-muted-foreground">×{p.quantity}</span>}</span>
              <Badge variant="outline" className={cn(p.status === 'Missing' && 'border-red-500 text-red-500', p.status === 'Available' && 'border-emerald-500 text-emerald-500')}>{p.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{p.category}{p.location && ` · ${p.location}`}{p.holderName && ` · with ${p.holderName}`}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              <select value={p.status} onChange={(e) => act(() => saveProp({ showId: ws.show.id, id: p.id, status: e.target.value as typeof p.status }))} className="rounded-md border bg-background px-2 py-1 text-xs">
                {['Available', 'In use', 'Missing', 'Broken', 'Returned'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={p.holder ?? ''} onChange={(e) => act(() => saveProp({ showId: ws.show.id, id: p.id, holder: e.target.value }))} className="rounded-md border bg-background px-2 py-1 text-xs">
                <option value="">No holder</option>
                {ws.members.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
              </select>
              {ws.canDelete && <button onClick={() => act(() => saveProp({ showId: ws.show.id, id: p.id, remove: true }))} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Scenes({ ws, act }: { ws: Ws; act: ActFn }) {
  const [label, setLabel] = useState('');
  const [title, setTitle] = useState('');
  const [order, setOrder] = useState<{ label: string; title: string; cast: string[]; minutes: number; block: number }[] | null>(null);
  const [blocks, setBlocks] = useState(0);
  return (
    <Section>
      <div className="flex flex-wrap gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Scene no. (S1)" className="w-32" />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scene title" className="max-w-xs" />
        <Button disabled={!label.trim() && !title.trim()} onClick={() => act(async () => { await saveShowScene({ showId: ws.show.id, label, title }); setLabel(''); setTitle(''); }, 'Scene added')}><Plus className="h-4 w-4 mr-1" />Add scene</Button>
        <Button variant="outline" disabled={!ws.scenes.length} onClick={() => act(async () => {
          const r = await getRehearsalOrder({ showId: ws.show.id });
          setOrder(r.order.map((s) => ({ label: s.label, title: s.title, cast: s.cast, minutes: s.minutes, block: s.block })));
          setBlocks(r.blocks);
        })}>Suggest rehearsal order</Button>
      </div>
      {!ws.scenes.length && <Empty>No scenes yet. Add scenes and who is in them to get a rehearsal order.</Empty>}
      <div className="space-y-2">
        {ws.scenes.map((s) => (
          <div key={s.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.label}{s.label && s.title ? ' · ' : ''}{s.title}</span>
              <span className="text-xs text-muted-foreground">{s.minutes}m</span>
              {ws.canDelete && <button onClick={() => act(() => saveShowScene({ showId: ws.show.id, id: s.id, remove: true }))} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {s.cast.length > 0 && <div className="text-xs text-muted-foreground mt-1">Cast: {s.cast.join(', ')}</div>}
          </div>
        ))}
      </div>
      {order && order.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="font-semibold text-sm mb-2">Suggested rehearsal order ({blocks} block{blocks === 1 ? '' : 's'})</h3>
          <ol className="list-decimal ml-5 text-sm space-y-0.5">
            {order.map((s, i) => (
              <li key={i}><span className="font-mono">{s.label}</span>{s.title && ` ${s.title}`}{s.cast.length > 0 && <span className="text-muted-foreground"> — {s.cast.join(', ')}</span>}</li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  );
}

function Notes({ ws, act }: { ws: Ws; act: ActFn }) {
  const [body, setBody] = useState('');
  const [scene, setScene] = useState('');
  return (
    <Section>
      <div className="space-y-2">
        <Input value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Scene (optional)" className="max-w-xs" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notes and blocking…" rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <Button disabled={!body.trim()} onClick={() => act(async () => { await saveRehearsalNote({ showId: ws.show.id, scene, body }); setBody(''); setScene(''); }, 'Note saved')}><Plus className="h-4 w-4 mr-1" />Add note</Button>
      </div>
      {!ws.notes.length && <Empty>No rehearsal notes yet.</Empty>}
      <div className="space-y-2">
        {ws.notes.map((n) => (
          <div key={n.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{n.scene && <span className="font-mono">{n.scene} · </span>}{n.authorName}</span>
              <span>{n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-GB') : ''}</span>
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{n.body}</p>
            <button onClick={() => act(() => saveRehearsalNote({ showId: ws.show.id, id: n.id, remove: true }))} className="text-xs text-muted-foreground hover:text-red-500 mt-1">Delete</button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Timings({ ws, act }: { ws: Ws; act: ActFn }) {
  const [scene, setScene] = useState('');
  const [minutes, setMinutes] = useState('');
  const byScene = useMemo(() => {
    const map = new Map<string, { actuals: number[]; estimate: number[] }>();
    for (const t of ws.timings) {
      if (!map.has(t.scene)) map.set(t.scene, { actuals: [], estimate: [] });
      const e = map.get(t.scene)!;
      (t.kind === 'Estimate' ? e.estimate : e.actuals).push(t.minutes);
    }
    return [...map.entries()];
  }, [ws.timings]);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  return (
    <Section>
      <div className="flex flex-wrap gap-2">
        <Input value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Scene" className="w-32" />
        <Input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Minutes" className="w-24" inputMode="numeric" />
        <Button disabled={!scene.trim() || !minutes} onClick={() => act(async () => { await saveSceneTiming({ showId: ws.show.id, scene, minutes: Number(minutes) }); setMinutes(''); }, 'Timing recorded')}><Plus className="h-4 w-4 mr-1" />Record run-time</Button>
      </div>
      {!byScene.length && <Empty>No run-times yet. Record how long each scene actually ran and the average builds itself.</Empty>}
      <div className="space-y-2">
        {byScene.map(([s, v]) => {
          const a = v.actuals;
          return (
            <div key={s} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span className="font-mono">{s}</span>
              <span className="text-muted-foreground">
                {a.length ? `avg ${avg(a)}m from ${a.length} run${a.length === 1 ? '' : 's'}` : 'no actual runs yet'}
                {v.estimate.length ? ` · est ${avg(v.estimate)}m` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function ShowDay({ ws, act }: { ws: Ws; act: ActFn }) {
  const [eventId, setEventId] = useState(ws.events[0]?.id ?? '');
  const [callMsg, setCallMsg] = useState('');
  const [coverRole, setCoverRole] = useState('');
  const ev = ws.events.find((e) => e.id === eventId);
  const rolls = ws.rollCalls.filter((r) => r.subEvent === eventId);
  const signs = ws.signoffs.filter((s) => s.subEvent === eventId);
  const calls = ws.cueCalls.filter((c) => c.subEvent === eventId);
  const covers = ws.coverRequests.filter((c) => c.subEvent === eventId);

  return (
    <Section>
      <div>
        <label className="text-sm font-medium">Event</label>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="mt-1 block w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm">
          {ws.events.map((e) => <option key={e.id} value={e.id}>{e.type} · {e.title} {e.date ? `(${e.date})` : ''}</option>)}
        </select>
        {!ws.events.length && <Empty>No events scheduled for this show yet. Add them under Admin → Events.</Empty>}
      </div>

      {ev && <>
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><CalendarCheck className="h-4 w-4" />Roll call <span className="text-muted-foreground font-normal">({rolls.length} present)</span></h3>
          <div className="flex flex-wrap gap-2">
            {ws.members.map((m) => {
              const on = rolls.some((r) => r.member === m.id);
              return (
                <button key={m.id} onClick={() => {
                  const set = new Set(rolls.map((r) => r.member));
                  if (on) set.delete(m.id); else set.add(m.id);
                  act(() => rollCall({ subEventId: eventId, memberIds: [...set] }));
                }} className={cn('px-3 py-1.5 rounded-lg border text-xs font-medium', on ? 'bg-emerald-500 text-white border-emerald-500' : 'hover:bg-muted')}>
                  {m.firstName} {m.lastName}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">Pre-show sign-off <span className="text-muted-foreground font-normal">({signs.length} signed)</span></h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={signs.some((s) => s.member === ws.meId) ? 'default' : 'outline'}
              onClick={() => act(() => signOffShow({ subEventId: eventId, remove: signs.some((s) => s.member === ws.meId) }), 'Updated')}>
              {signs.some((s) => s.member === ws.meId) ? 'You are signed off' : 'Sign off ready'}
            </Button>
            {signs.map((s) => <span key={s.member} className="text-xs text-muted-foreground">{s.memberName}{s.role && ` (${s.role})`}</span>)}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Bell className="h-4 w-4" />Cue calls</h3>
          <div className="flex flex-wrap gap-2">
            <Input value={callMsg} onChange={(e) => setCallMsg(e.target.value)} placeholder="Standby LX 12…" className="max-w-xs" />
            <Button size="sm" disabled={!callMsg.trim()} onClick={() => act(async () => { await sendCueCall({ subEventId: eventId, memberIds: [ws.meId], message: callMsg }); setCallMsg(''); }, 'Cue call sent')}><Megaphone className="h-4 w-4 mr-1" />Send to me</Button>
          </div>
          {calls.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm mt-2">
              <span>{c.byName} → {c.memberName}: {c.message}{c.ackedAt ? <span className="text-emerald-500"> · acked</span> : ''}</span>
              {c.member === ws.meId && !c.ackedAt && <Button size="sm" variant="outline" onClick={() => act(() => ackCueCall({ id: c.id }), 'Acknowledged')}>Ack</Button>}
            </div>
          ))}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">Cover</h3>
          <div className="flex flex-wrap gap-2">
            <Input value={coverRole} onChange={(e) => setCoverRole(e.target.value)} placeholder="Your role (optional)" className="max-w-xs" />
            <Button size="sm" variant="outline" onClick={() => act(async () => { await requestCover({ subEventId: eventId, role: coverRole }); setCoverRole(''); }, 'Cover requested')}>I can’t make it — ask for cover</Button>
          </div>
          {covers.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm mt-2">
              <span>{c.memberName} · <Badge variant="outline" className={cn(c.status === 'Open' && 'border-amber-500 text-amber-500')}>{c.status}</Badge> {c.role}{c.filledByName && ` → ${c.filledByName}`}</span>
              <span className="flex gap-2">
                {c.status === 'Open' && c.member !== ws.meId && <Button size="sm" onClick={() => act(() => respondCover({ id: c.id }), 'You are covering')}>I’ll cover</Button>}
                {c.status === 'Open' && c.member === ws.meId && <Button size="sm" variant="outline" onClick={() => act(() => requestCover({ subEventId: eventId, id: c.id, remove: true }), 'Cancelled')}>Cancel</Button>}
                {c.status === 'Filled' && c.filledBy === ws.meId && <Button size="sm" variant="outline" onClick={() => act(() => respondCover({ id: c.id, release: true }), 'Released')}>Step down</Button>}
              </span>
            </div>
          ))}
        </div>
      </>}
    </Section>
  );
}

const MEDIA_TABS: Tab[] = ['photos', 'debrief', 'green', 'lost', 'audience'];

function Photos({ media, act }: { media: Media; act: ActFn }) {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [scene, setScene] = useState('');
  return (
    <Section>
      <div className="flex flex-wrap gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a photo link (https://…)" className="max-w-sm" />
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption" className="max-w-xs" />
        <Input value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Scene" className="w-28" />
        <Button disabled={!url.trim()} onClick={() => act(async () => { await saveShowPhoto({ showId: media.showId, url, caption, scene }); setUrl(''); setCaption(''); setScene(''); }, 'Photo added')}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>
      {!media.photos.length && <Empty>No photos yet. Paste a link to a shot from the wings and it will gallery here.</Empty>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {media.photos.map((p) => (
          <figure key={p.id} className="group overflow-hidden rounded-xl border bg-muted/30">
            <img src={p.url} alt={p.caption || 'Backstage photo'} loading="lazy" className="aspect-[4/3] w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
            <figcaption className="p-2 text-xs">
              <div className="truncate font-medium">{p.caption || p.scene || 'Backstage'}</div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="truncate">{p.byName}</span>
                {(media.canDelete || p.createdBy === media.meId) && <button onClick={() => act(() => saveShowPhoto({ showId: media.showId, id: p.id, remove: true }))} className="hover:text-red-500"><Trash2 className="h-3 w-3" /></button>}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function Debrief({ media, act }: { media: Media; act: ActFn }) {
  const [body, setBody] = useState('');
  const [subEventId, setSubEventId] = useState('');
  return (
    <Section>
      <div className="space-y-2">
        <select value={subEventId} onChange={(e) => setSubEventId(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm max-w-md">
          <option value="">Whole run</option>
          {media.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="How did it go? What should we change next time?" rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <Button disabled={!body.trim()} onClick={() => act(async () => { await saveDebrief({ showId: media.showId, subEventId: subEventId || undefined, body }); setBody(''); }, 'Added to debrief')}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>
      {!media.debriefs.length && <Empty>No debrief notes yet. Add the first after the run.</Empty>}
      <div className="space-y-2">
        {media.debriefs.map((d) => (
          <div key={d.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{d.eventName || 'Whole run'} · {d.authorName}</span>
              <span>{d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-GB') : ''}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{d.body}</p>
            {(media.canDelete || d.createdBy === media.meId) && <button onClick={() => act(() => saveDebrief({ showId: media.showId, id: d.id, remove: true }))} className="mt-1 text-xs text-muted-foreground hover:text-red-500">Delete</button>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function GreenRoom({ media, act }: { media: Media; act: ActFn }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  return (
    <Section>
      <div className="space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Call time tonight is 5:30pm)" className="max-w-lg" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message for the cast…" rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-primary" />Pin to top</label>
          <Button disabled={!body.trim()} onClick={() => act(async () => { await saveGreenRoomNote({ showId: media.showId, title, body, pinned }); setTitle(''); setBody(''); setPinned(false); }, 'Posted')}><Plus className="h-4 w-4 mr-1" />Post</Button>
        </div>
      </div>
      {!media.greenRoom.length && <Empty>The noticeboard is empty. Pin the call time so everyone sees it.</Empty>}
      <div className="space-y-2">
        {media.greenRoom.map((g) => (
          <div key={g.id} className={cn('rounded-lg border p-3', g.pinned && 'border-primary/40 bg-primary/5')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                {g.title && <div className="font-semibold text-sm">{g.title}</div>}
                <p className="whitespace-pre-wrap text-sm">{g.body}</p>
                <div className="mt-1 text-xs text-muted-foreground">{g.byName} · {g.createdAt ? new Date(g.createdAt).toLocaleDateString('en-GB') : ''}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => act(() => saveGreenRoomNote({ showId: media.showId, id: g.id, pinned: !g.pinned }))} title={g.pinned ? 'Unpin' : 'Pin'} className={cn('rounded p-1 hover:bg-muted', g.pinned ? 'text-primary' : 'text-muted-foreground')}><Pin className="h-3.5 w-3.5" /></button>
                {(media.canDelete || g.createdBy === media.meId) && <button onClick={() => act(() => saveGreenRoomNote({ showId: media.showId, id: g.id, remove: true }))} className="rounded p-1 text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function LostProperty({ media, act }: { media: Media; act: ActFn }) {
  const [item, setItem] = useState('');
  const [location, setLocation] = useState('');
  return (
    <Section>
      <div className="flex flex-wrap gap-2">
        <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="What is missing?" className="max-w-xs" />
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Last seen" className="w-40" />
        <Button disabled={!item.trim()} onClick={() => act(async () => { await saveLostItem({ showId: media.showId, item, location, status: 'Lost' }); setItem(''); setLocation(''); }, 'Logged')}><Plus className="h-4 w-4 mr-1" />Log item</Button>
      </div>
      {!media.lost.length && <Empty>Nothing logged. When the good sword vanishes, it gets logged here.</Empty>}
      <div className="space-y-2">
        {media.lost.map((l) => (
          <div key={l.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{l.item}</span>
              <Badge variant="outline" className={cn(l.status === 'Lost' && 'border-red-500 text-red-500', l.status === 'Found' && 'border-amber-500 text-amber-500', l.status === 'Returned' && 'border-emerald-500 text-emerald-500')}>{l.status}</Badge>
            </div>
            {l.location && <div className="text-xs text-muted-foreground mt-0.5">Last seen: {l.location}</div>}
            {l.holderName && <div className="text-xs text-muted-foreground">Now with {l.holderName}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select value={l.status} onChange={(e) => act(() => saveLostItem({ showId: media.showId, id: l.id, status: e.target.value as typeof l.status }))} className="rounded-md border bg-background px-2 py-1 text-xs">
                {['Lost', 'Found', 'Returned'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={l.holder ?? ''} onChange={(e) => act(() => saveLostItem({ showId: media.showId, id: l.id, holder: e.target.value }))} className="rounded-md border bg-background px-2 py-1 text-xs">
                <option value="">Nobody yet</option>
                {media.members.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
              </select>
              {media.canDelete && <button onClick={() => act(() => saveLostItem({ showId: media.showId, id: l.id, remove: true }))} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Audience({ media, act }: { media: Media; act: ActFn }) {
  const [eventId, setEventId] = useState(media.events[0]?.id ?? '');
  const [count, setCount] = useState('');
  const [capacity, setCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const perfs = media.events.filter((e) => e.type === 'Performance');
  const list = perfs.length ? perfs : media.events;
  const recorded = media.audience;
  const total = recorded.reduce((s, a) => s + a.count, 0);
  const best = recorded.reduce((m, a) => Math.max(m, a.count), 0);
  return (
    <Section>
      <div className="flex flex-wrap gap-2">
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
          <option value="">Pick a night</option>
          {list.map((e) => <option key={e.id} value={e.id}>{e.title}{e.date ? ` · ${e.date}` : ''}</option>)}
        </select>
        <Input value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Headcount" inputMode="numeric" className="w-28" />
        <Input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Capacity" inputMode="numeric" className="w-28" />
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="max-w-xs" />
        <Button disabled={!eventId || !count} onClick={() => act(async () => { await saveAudienceCount({ showId: media.showId, subEventId: eventId, count: Number(count), capacity: capacity ? Number(capacity) : 0, notes }); setCount(''); setNotes(''); }, 'Headcount saved')}><Plus className="h-4 w-4 mr-1" />Save</Button>
      </div>
      {!recorded.length && <Empty>No headcounts yet. Record tonight's audience and the run total builds up.</Empty>}
      {recorded.length > 0 && (
        <div className="flex gap-6 rounded-xl border bg-muted/30 p-4 text-sm">
          <div><div className="text-2xl font-bold">{total}</div><div className="text-muted-foreground">seats over {recorded.length} night{recorded.length === 1 ? '' : 's'}</div></div>
          <div><div className="text-2xl font-bold">{best}</div><div className="text-muted-foreground">best night</div></div>
        </div>
      )}
      <div className="space-y-2">
        {recorded.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>{a.eventName}{a.notes && <span className="text-muted-foreground"> · {a.notes}</span>}</span>
            <span className="flex items-center gap-3">
              <span className="font-mono">{a.count}{a.capacity ? `/${a.capacity}` : ''}</span>
              {a.capacity > 0 && <span className="text-xs text-muted-foreground">{Math.round((a.count / a.capacity) * 100)}%</span>}
              <button onClick={() => act(() => saveAudienceCount({ showId: media.showId, subEventId: a.subEvent, remove: true }))} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
