import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveSubEvent } from '#api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { DatePicker } from '@project/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { type AdminShow, type AdminSubEvent, toIso, fromIso } from '../../lib/useAdminData';
import { SUBTYPES, EVENT_TYPES, isClubSession } from '../../lib/constants';

type Form = {
  title: string; type: 'Rehearsal' | 'Performance' | 'Club Session'; subtype: string; showIds: string[]; date: string | null; dateTbc: boolean;
  description: string; meetTime: string; startTime: string; endTime: string; thingsToBring: string; importance: 'High' | 'Medium' | 'Low';
  dueDate: string | null; dueUnknown: boolean; hidden: boolean;
};
const blank = (showId?: string, type: Form['type'] = 'Rehearsal'): Form => ({
  title: '', type, subtype: SUBTYPES[type][0], showIds: showId ? [showId] : [], date: null, dateTbc: false,
  description: '', meetTime: '', startTime: '', endTime: '', thingsToBring: '', importance: 'Medium', dueDate: null, dueUnknown: true, hidden: false,
});

/**
 * Two structured HH:MM fields replace the old free-text "Timings" string, so
 * the calendar feed and every list in the app get a real start/end pair
 * instead of guessing from a meet time.
 *
 * Both-or-neither: leaving one half empty (start with no end, or vice
 * versa) is rejected on save, because a half-range would render as an
 * accidental 1-hour event in subscribers' calendars.
 */
const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const hhmmHint = 'HH:MM (24-hour)';

export default function SubEventDialog({ open, ev, shows, defaultShowId, defaultType, onClose, onSaved }: {
  open: boolean; ev: AdminSubEvent | null; shows: AdminShow[]; defaultShowId?: string; defaultType?: Form['type']; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(ev
      ? {
          ...ev,
          type: ev.type as Form['type'],
          importance: ev.importance as Form['importance'],
          startTime: ev.startTime ?? '',
          endTime: ev.endTime ?? '',
        }
      : blank(defaultShowId, defaultType));
  }, [open, ev, defaultShowId, defaultType]);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  // A club session is not part of a production, so it is the only type that may
  // be saved with no show attached.
  const club = isClubSession(f.type);
  // A half-filled time range is useless on the calendar.
  const halfFilled = (!!f.startTime) !== (!!f.endTime);
  const bothBlank = !f.startTime && !f.endTime;
  const valid =
    f.title.trim() &&
    (club || f.showIds.length) &&
    (f.dateTbc || f.date) &&
    ((f.startTime === '' && f.endTime === '') || (!halfFilled && HHMM_RE.test(f.startTime) && HHMM_RE.test(f.endTime)));
  const timeHelp = f.startTime && !HHMM_RE.test(f.startTime)
    ? `Use ${hhmmHint}, e.g. 09:00 or 19:30.`
    : f.endTime && !HHMM_RE.test(f.endTime)
      ? `Use ${hhmmHint}, e.g. 16:00 or 21:30.`
      : 'Leave both blank if the times are not yet known; the subscribe feed renders them as an all-day block.';

  const save = async () => {
    setBusy(true);
    try {
      await adminSaveSubEvent({
        id: ev?.id,
        ...f,
        startTime: f.startTime || null,
        endTime: f.endTime || null,
      });
      toast.success('Saved');
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const L = ({ children }: { children: React.ReactNode }) => <label className="text-sm">{children}</label>;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ev ? 'Edit' : 'Add'} event</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1"><L>Title *</L><Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Tech run – Act 1" /></div>
          <div className="space-y-1"><L>Type</L>
            <Select value={f.type} onValueChange={(v) => set({ type: v as Form['type'], subtype: SUBTYPES[v][0], showIds: v === 'Club Session' ? [] : f.showIds })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><L>Kind</L>
            <Select value={f.subtype} onValueChange={(v) => set({ subtype: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SUBTYPES[f.type].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <L>Show(s) {club ? '' : '*'}</L>
            {club ? (
              <p className="text-xs text-muted-foreground">Club sessions are scheduled separately and are not part of a show.</p>
            ) : (
              <div className="flex flex-wrap gap-4">{shows.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={f.showIds.includes(s.id)} onCheckedChange={(c) => set({ showIds: c ? [...f.showIds, s.id] : f.showIds.filter((x) => x !== s.id) })} />
                  {s.name}{s.code && ` (${s.code})`}
                </label>))}
              </div>
            )}
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
          <div className="space-y-1 sm:col-span-2">
            <L>Meet time</L>
            <Input value={f.meetTime} onChange={(e) => set({ meetTime: e.target.value })} placeholder="08:45, Main Hall stage door" />
            <p className="text-xs text-muted-foreground">Where the crew should be, and at what time. Free text - "8:45 - Brake Hall" works.</p>
          </div>
          <div className="space-y-1">
            <L>Start time</L>
            <Input value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} placeholder={hhmmHint} />
          </div>
          <div className="space-y-1">
            <L>End time</L>
            <Input value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} placeholder={hhmmHint} />
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">{timeHelp}</p>
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
