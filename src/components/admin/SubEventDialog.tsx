import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveSubEvent } from 'zitejs/api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { DatePicker } from '@project/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { type AdminShow, type AdminSubEvent, toIso, fromIso } from '../../lib/useAdminData';
import { SUBTYPES } from '../../lib/constants';

type Form = {
  title: string; type: 'Rehearsal' | 'Performance'; subtype: string; showIds: string[]; date: string | null; dateTbc: boolean;
  description: string; meetTime: string; timings: string; thingsToBring: string; importance: 'High' | 'Medium' | 'Low';
  dueDate: string | null; dueUnknown: boolean; hidden: boolean;
};
const blank = (showId?: string): Form => ({
  title: '', type: 'Rehearsal', subtype: 'Part Day Rehearsal', showIds: showId ? [showId] : [], date: null, dateTbc: false,
  description: '', meetTime: '', timings: '', thingsToBring: '', importance: 'Medium', dueDate: null, dueUnknown: true, hidden: false,
});

export default function SubEventDialog({ open, ev, shows, defaultShowId, onClose, onSaved }: {
  open: boolean; ev: AdminSubEvent | null; shows: AdminShow[]; defaultShowId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(ev ? { ...ev, type: ev.type as Form['type'], importance: ev.importance as Form['importance'] } : blank(defaultShowId));
  }, [open, ev, defaultShowId]);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const valid = f.title.trim() && f.showIds.length && (f.dateTbc || f.date);

  const save = async () => {
    setBusy(true);
    try { await adminSaveSubEvent({ id: ev?.id, ...f }); toast.success('Saved'); onSaved(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const L = ({ children }: { children: React.ReactNode }) => <label className="text-sm">{children}</label>;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ev ? 'Edit' : 'Add'} rehearsal / performance</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1"><L>Title *</L><Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Tech run – Act 1" /></div>
          <div className="space-y-1"><L>Type</L>
            <Select value={f.type} onValueChange={(v) => set({ type: v as Form['type'], subtype: SUBTYPES[v][0] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Rehearsal">Rehearsal</SelectItem><SelectItem value="Performance">Performance</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><L>Kind</L>
            <Select value={f.subtype} onValueChange={(v) => set({ subtype: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SUBTYPES[f.type].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1"><L>Show(s) *</L>
            <div className="flex flex-wrap gap-4">{shows.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.showIds.includes(s.id)} onCheckedChange={(c) => set({ showIds: c ? [...f.showIds, s.id] : f.showIds.filter((x) => x !== s.id) })} />
                {s.name}{s.code && ` (${s.code})`}
              </label>))}
            </div>
          </div>
          <div className="space-y-1"><L>Date *</L>
            <label className="flex items-center gap-2 text-sm mb-1"><Checkbox checked={f.dateTbc} onCheckedChange={(c) => set({ dateTbc: !!c })} />TBC</label>
            {!f.dateTbc && <DatePicker value={fromIso(f.date)} onChange={(d) => set({ date: toIso(d) })} />}
          </div>
          <div className="space-y-1"><L>Importance</L>
            <Select value={f.importance} onValueChange={(v) => set({ importance: v as Form['importance'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['High', 'Medium', 'Low'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><L>Meet time</L><Input value={f.meetTime} onChange={(e) => set({ meetTime: e.target.value })} placeholder="08:45, Main Hall stage door" /></div>
          <div className="space-y-1"><L>Timings</L><Input value={f.timings} onChange={(e) => set({ timings: e.target.value })} placeholder="09:00 – 16:00" /></div>
          <div className="sm:col-span-2 space-y-1"><L>Description</L><Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} /></div>
          <div className="sm:col-span-2 space-y-1"><L>Things to bring</L><Textarea rows={2} value={f.thingsToBring} onChange={(e) => set({ thingsToBring: e.target.value })} placeholder="Blacks, torch, packed lunch" /></div>
          <div className="sm:col-span-2 space-y-1"><L>Response due date</L>
            <label className="flex items-center gap-2 text-sm mb-1"><Checkbox checked={f.dueUnknown} onCheckedChange={(c) => set({ dueUnknown: !!c })} />Unknown / to be confirmed</label>
            {!f.dueUnknown && <DatePicker value={fromIso(f.dueDate)} onChange={(d) => set({ dueDate: toIso(d) })} />}
          </div>
          <div className="sm:col-span-2 space-y-1">
            <L>Visibility</L>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.hidden} onCheckedChange={(c) => set({ hidden: !!c })} />Hidden from members</label>
            <p className="text-xs text-muted-foreground">You can still see it in the admin area, and unhide it any time.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !valid} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
