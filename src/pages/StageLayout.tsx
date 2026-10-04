import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
  pointerWithin, rectIntersection, type CollisionDetection, type DragEndEvent,
} from '@dnd-kit/core';
import { getStageLayout, adminMoveRole, type GetStageLayoutOutputType } from '#api';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { Crown, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@project/components/ui/dialog';
import { useMe } from '../lib/me';

type Data = GetStageLayoutOutputType;
type Person = Data['members'][number] & { maybe: boolean };
const AREAS = ['Stage Left', 'Stage Right', 'Microphone Management', 'Lighting', 'Sound', 'Unassigned'];
const collision: CollisionDetection = (a) => { const p = pointerWithin(a); return p.length ? p : rectIntersection(a); };

function Card({ p, area, canDrag, overlay }: { p: Person; area: string; canDrag: boolean; overlay?: boolean }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `${area}|${p.id}`, disabled: !canDrag || overlay });
  return (
    <div ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : attributes)} {...(overlay ? {} : listeners)}
      className={cn('rounded-lg px-3 py-2 text-sm bg-secondary border-2 select-none',
        p.maybe ? 'border-orange-500' : 'border-transparent', canDrag && 'cursor-grab', isDragging && 'opacity-30', overlay && 'shadow-xl rotate-2')}>
      <div className="flex items-center gap-1.5 font-medium">
        {p.headOf.includes(area) && <Crown className="h-3.5 w-3.5 text-primary" />}{p.name}
      </div>
      <div className="text-[11px] text-muted-foreground">{p.year}{p.maybe && ' · Maybe'}</div>
    </div>
  );
}

function Area({ area, people, canDrag, className, onContact }: { area: string; people: Person[]; canDrag: boolean; className?: string; onContact: (a: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: area, disabled: !canDrag });
  return (
    <div ref={setNodeRef} className={cn('rounded-2xl border bg-card/80 p-3 min-h-[140px] transition-colors', isOver && 'border-primary bg-primary/10', className)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{area} <span className="font-mono">({people.length})</span></p>
        {area !== 'Unassigned' && (
          <button onClick={() => onContact(area)} className="text-xs flex items-center gap-1 text-primary hover:underline"><Mail className="h-3 w-3" />Who to contact</button>
        )}
      </div>
      <div className="grid gap-2">{people.map((p) => <Card key={p.id} p={p} area={area} canDrag={canDrag} />)}</div>
    </div>
  );
}

export default function StageLayout() {
  const { me } = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [showId, setShowId] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const load = useCallback(async () => { const d = await getStageLayout({}); setData(d); setShowId((s) => s || d.shows[0]?.id || ''); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;

  const resp = new Map(data.responses.filter((r) => r.showId === showId).map((r) => [r.memberId, r.response]));
  const people: Person[] = data.members.filter((m) => resp.has(m.id) && m.memberType !== 'Actor').map((m) => ({ ...m, maybe: resp.get(m.id) === 'Maybe' }));
  const inArea = (a: string) => people.filter((p) => (a === 'Unassigned' ? p.roles.length === 0 : p.roles.includes(a)));

  const onEnd = async (e: DragEndEvent) => {
    setActive(null);
    const [from, memberId] = String(e.active.id).split('|');
    const to = e.over ? String(e.over.id) : null;
    if (!to || to === from) return;
    const prev = data;
    setData({ ...data, members: data.members.map((m) => m.id !== memberId ? m : { ...m, roles: [...m.roles.filter((r) => r !== from), ...(to !== 'Unassigned' && !m.roles.includes(to) ? [to] : [])] }) });
    try { await adminMoveRole({ memberId, from, to }); } catch (err) { setData(prev); toast.error((err as Error).message); }
  };
  const activeP = active ? people.find((p) => p.id === active.split('|')[1]) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stage Layout</h1>
        <p className="text-muted-foreground mt-1">
          {me.memberType === 'Actor' ? 'Click “Who to contact” on any area to email its lead.' : me.isAdmin ? 'Drag crew between areas to reassign them.' : 'View only.'} <span className="inline-block w-3 h-3 rounded border-2 border-orange-500 align-middle ml-2" /> = Maybe
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {data.shows.map((s) => (
          <button key={s.id} onClick={() => setShowId(s.id)} className={cn('px-4 py-2 rounded-xl border text-sm font-medium', s.id === showId ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>{s.name}</button>
        ))}
      </div>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={(e) => setActive(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
        <div className="grid gap-3 md:grid-cols-3">
          <Area area="Lighting" people={inArea('Lighting')} canDrag={me.isAdmin} onContact={setContact} />
          <Area area="Sound" people={inArea('Sound')} canDrag={me.isAdmin} onContact={setContact} />
          <Area area="Microphone Management" people={inArea('Microphone Management')} canDrag={me.isAdmin} onContact={setContact} />
          <Area area="Stage Left" people={inArea('Stage Left')} canDrag={me.isAdmin} onContact={setContact} />
          <div className="rounded-2xl border-2 border-dashed flex items-center justify-center min-h-[140px] text-muted-foreground font-mono tracking-[0.3em] text-sm">STAGE</div>
          <Area area="Stage Right" people={inArea('Stage Right')} canDrag={me.isAdmin} onContact={setContact} />
          <Area area="Unassigned" people={inArea('Unassigned')} canDrag={me.isAdmin} onContact={setContact} className="md:col-span-3" />
        </div>
        <DragOverlay>{activeP && active ? <Card p={activeP} area={active.split('|')[0]} canDrag overlay /> : null}</DragOverlay>
      </DndContext>
      <Dialog open={!!contact} onOpenChange={(o) => !o && setContact(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{contact}</DialogTitle><DialogDescription>Head(s) of this area</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {data.members.filter((m) => contact && m.headOf.includes(contact)).map((m) => (
              <a key={m.id} href={`mailto:${m.email}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted">
                <span className="font-medium flex items-center gap-1.5"><Crown className="h-4 w-4 text-primary" />{m.name}</span>
                <span className="text-sm text-primary flex items-center gap-1"><Mail className="h-4 w-4" />{m.email}</span>
              </a>
            ))}
            {contact && !data.members.some((m) => m.headOf.includes(contact)) && <p className="text-sm text-muted-foreground">No head has been assigned to this area yet.</p>}
          </div>
        </DialogContent>
      </Dialog>
      {people.length === 0 && <p className="text-sm text-muted-foreground">Nobody has said Yes or Maybe to this show yet.</p>}
    </div>
  );
}
