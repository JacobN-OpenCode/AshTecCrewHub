import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveContractorInvites } from '#api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { type AdminShow, type AdminSubEvent, type AdminMember } from '../../lib/useAdminData';
import { isContractor, fmtDate } from '../../lib/constants';

/**
 * Ticket 9f966aab "Contractor Invite": invite one contractor across the events
 * of a production at once. The admin picks a contractor, ticks which of the
 * show's events they are needed for (the checklist), and writes a single
 * overall message that rides on each invited event. Their invite then shows on
 * their home page, and they appear in the stage layout for the crew.
 */
export default function ContractorInviteDialog({ open, show, events, members, onClose, onSaved }: {
  open: boolean; show: AdminShow | null; events: AdminSubEvent[]; members: AdminMember[];
  onClose: () => void; onSaved: () => void;
}) {
  // Only real contractor accounts can be invited (preview accounts cannot sign in).
  const contractors = members.filter((m) => isContractor(m.memberType) && !m.isPreview);
  const [selectedId, setSelectedId] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setSelectedId(contractors[0]?.id ?? ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  // Load the chosen contractor's current invite from the events whenever the
  // dialog opens or the contractor changes. Keyed on selectedId only, so
  // typing the message does not clobber the form.
  useEffect(() => {
    if (!open || !selectedId) { setChecked(new Set()); setMessage(''); return; }
    const mine = events.filter((e) => e.contractorIds.includes(selectedId));
    setChecked(new Set(mine.map((e) => e.id)));
    setMessage(mine[0]?.contractorMessage ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId]);

  const toggle = (id: string) => setChecked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const save = async () => {
    if (!show || !selectedId) return;
    setBusy(true);
    try {
      const r = await adminSaveContractorInvites({ showId: show.id, contractorId: selectedId, eventIds: [...checked], message });
      const bits = [
        r.invited ? `invited to ${r.invited} event${r.invited === 1 ? '' : 's'}` : '',
        r.removed ? `removed from ${r.removed}` : '',
      ].filter(Boolean).join(', ') || 'no change';
      toast.success('Contractor invite saved', { description: bits });
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const L = ({ children }: { children: React.ReactNode }) => <label className="text-sm">{children}</label>;
  const current = contractors.find((m) => m.id === selectedId);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Contractor invites{show ? ` · ${show.name}` : ''}</DialogTitle></DialogHeader>
        {contractors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No contractor accounts yet. Add someone with member type “Contractor” in Crew, then invite them here.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <L>Contractor</L>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger><SelectValue placeholder="Pick a contractor" /></SelectTrigger>
                <SelectContent>
                  {contractors.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <L>Which parts of the production need them</L>
              <p className="text-xs text-muted-foreground">Tick the events this contractor is needed for. They see each ticked event and the message below on their home page.</p>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">This production has no events yet. Add rehearsals or performances first.</p>
              ) : (
                <div className="rounded-xl border divide-y">
                  {events.map((e) => (
                    <label key={e.id} className="flex items-start gap-3 p-3 text-sm cursor-pointer hover:bg-muted/40">
                      <Checkbox className="mt-0.5" checked={checked.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{e.title}</span>
                        <span className="block text-xs text-muted-foreground">{fmtDate(e.date, e.dateTbc)}{e.subtype ? ` · ${e.subtype}` : ''}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <L>Overall message for {current ? `${current.firstName} ${current.lastName}` : 'the contractor'}</L>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                placeholder="What we need you for across the production, where to go and when, who to ask for…" />
            </div>

            <p className="text-xs text-muted-foreground">
              Contractors can sign in and see their own attendance, but never the stage layout or any student information.
              Crew see them listed in the stage layout by name only; their email is never shown to members.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={busy || !selectedId || !show} onClick={save}>
            {checked.size ? `Save invite (${checked.size})` : 'Save (no events)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
