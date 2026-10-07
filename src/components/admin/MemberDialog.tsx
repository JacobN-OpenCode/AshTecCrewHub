import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveMember, setShowResponse } from '#api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import type { AdminData, AdminMember } from '../../lib/useAdminData';
import { MEMBER_TYPES, ROLES, YEARS } from '../../lib/constants';

type F = Omit<AdminMember, 'id'>;
const blank: F = { firstName: '', lastName: '', shortUsername: '', year: '', email: '', isAdmin: false, isStaff: false, memberType: 'Normal Member', roles: [], headOf: [], preferredRole1: '', preferredRole2: '', adminNotes: '', isMaintainer: false, isPreview: false, adminNotifications: false };

export default function MemberDialog({ open, member, data, onClose, onSaved, preview }: { open: boolean; member: AdminMember | null; data: AdminData; onClose: () => void; onSaved: () => void; preview?: boolean }) {
  const [f, setF] = useState<F>(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(member ? { ...member } : { ...blank, isPreview: !!preview }); }, [open, member, preview]);
  const set = (p: Partial<F>) => setF((x) => ({ ...x, ...p }));
  const toggle = (k: 'roles' | 'headOf', r: string) => set({ [k]: f[k].includes(r) ? f[k].filter((x) => x !== r) : [...f[k], r] });
  const valid = f.firstName.trim() && (f.isPreview ? !f.email || /^\S+@\S+\.\S+$/.test(f.email) : /^\S+@\S+\.\S+$/.test(f.email));

  const save = async () => {
    setBusy(true);
    try { await adminSaveMember({ id: member?.id, ...f }); toast.success('Member saved'); onSaved(); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const respond = async (showId: string, response: 'Yes' | 'No' | 'Maybe') => {
    try { await setShowResponse({ showId, response, memberId: member!.id }); toast.success('Response recorded'); onSaved(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const Pick = ({ v, on, opts, ph }: { v: string; on: (v: string) => void; opts: string[]; ph: string }) => (
    <Select value={v || undefined} onValueChange={on}>
      <SelectTrigger><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{member ? `${member.firstName} ${member.lastName}` : f.isPreview ? 'Add preview account' : 'Add crew member'}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><label className="text-sm">First initial *</label><Input value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} maxLength={2} /></div>
          <div className="space-y-1"><label className="text-sm">Last name</label><Input value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></div>
          <div className="space-y-1"><label className="text-sm">School email {f.isPreview ? '(optional — made up automatically)' : '*'}</label><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></div>
          <div className="space-y-1"><label className="text-sm">Year</label><Pick v={f.year} on={(v) => set({ year: v })} opts={YEARS} ph="Select year" /></div>
          <div className="space-y-1"><label className="text-sm">Member type</label><Pick v={f.memberType} on={(v) => set({ memberType: v })} opts={MEMBER_TYPES} ph="Type" /></div>
          <div className="flex flex-col gap-2 self-end pb-2">
            {!f.isPreview && <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isAdmin} onCheckedChange={(c) => set({ isAdmin: !!c })} />Admin access</label>}
            {!f.isPreview && <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isMaintainer} onCheckedChange={(c) => set({ isMaintainer: !!c })} />Maintainer (gets bug reports)</label>}
            {f.isPreview && <p className="text-xs text-muted-foreground">Pretend person — can’t sign in or get emails. Use “Preview as” to see the app as them.</p>}
          </div>
          {(['roles', 'headOf'] as const).map((k) => (
            <div key={k} className="space-y-2">
              <p className="text-sm font-medium">{k === 'roles' ? 'Assigned roles' : 'Head of'}</p>
              {ROLES.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><Checkbox checked={f[k].includes(r)} onCheckedChange={() => toggle(k, r)} />{r}</label>)}
            </div>
          ))}
          <div className="space-y-1"><label className="text-sm">Preferred role 1</label><Pick v={f.preferredRole1} on={(v) => set({ preferredRole1: v })} opts={ROLES} ph="—" /></div>
          <div className="space-y-1"><label className="text-sm">Preferred role 2</label><Pick v={f.preferredRole2} on={(v) => set({ preferredRole2: v })} opts={ROLES} ph="—" /></div>
          <div className="sm:col-span-2 space-y-1"><label className="text-sm">Admin notes (things said in person, etc.)</label><Textarea value={f.adminNotes} onChange={(e) => set({ adminNotes: e.target.value })} /></div>
          {member && !member.isStaff && (
            <div className="sm:col-span-2 space-y-2 rounded-xl border p-3">
              <p className="text-sm font-medium">Show participation (record on their behalf)</p>
              {data.shows.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{s.name}</span>
                  <div className="w-40"><Pick v={data.responses.find((r) => r.memberId === member.id && r.showId === s.id)?.response ?? ''}
                    on={(v) => respond(s.id, v as 'Yes' | 'No' | 'Maybe')} opts={['Yes', 'Maybe', 'No']} ph="No reply" /></div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Individual rehearsal/performance attendance can be set from Manage Events → Attendance.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !valid} onClick={save}>Save member</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
