import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveMember, setShowResponse, adminGetMemberBadges, adminSetBadge } from '#api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import type { AdminData, AdminMember } from '../../lib/useAdminData';
import { MEMBER_TYPES, ROLES, YEARS } from '../../lib/constants';
import { BADGES } from '../../lib/badges';
import { PERMISSIONS, type PermissionState } from '../../lib/permissions';
import MemberAvatar from '../MemberAvatar';

type F = Omit<AdminMember, 'id'>;
const blank: F = { firstName: '', lastName: '', shortUsername: '', year: '', email: '', isAdmin: false, isStaff: false, memberType: 'Normal Member', isContractor: false, roles: [], headOf: [], preferredRole1: '', preferredRole2: '', adminNotes: '', isMaintainer: false, isPreview: false, adminNotifications: false, avatarUrl: '', statusText: '', statusEmoji: '', birthday: '', contactShare: false, contactPhone: '', skillsTeach: '', skillsLearn: '', mentorId: null, isMentor: false, permissions: { granted: [], revoked: [] } };

export default function MemberDialog({ open, member, data, onClose, onSaved, preview }: { open: boolean; member: AdminMember | null; data: AdminData; onClose: () => void; onSaved: () => void; preview?: boolean }) {
  const [f, setF] = useState<F>(blank);
  const [busy, setBusy] = useState(false);
  // Ticket 3ead37f8: the badges granted by hand (as opposed to the ones the
  // predicates compute). Loaded lazily for an existing member.
  const [manualBadges, setManualBadges] = useState<string[]>([]);
  const [badgeBusy, setBadgeBusy] = useState('');
  useEffect(() => {
    if (!open || !member) { setManualBadges([]); return; }
    let live = true;
    adminGetMemberBadges({ memberId: member.id })
      .then((r) => { if (live) setManualBadges(r.granted); })
      .catch(() => {});
    return () => { live = false; };
  }, [open, member]);
  const toggleBadge = async (badgeId: string, value: boolean) => {
    if (!member || badgeBusy) return;
    setBadgeBusy(badgeId);
    setManualBadges((prev) => (value ? [...prev, badgeId] : prev.filter((b) => b !== badgeId)));
    try { await adminSetBadge({ memberId: member.id, badgeId, value }); }
    catch (e) {
      setManualBadges((prev) => (value ? prev.filter((b) => b !== badgeId) : [...prev, badgeId]));
      toast.error((e as Error).message);
    } finally { setBadgeBusy(''); }
  };
  useEffect(() => { if (open) setF(member ? { ...member } : { ...blank, isPreview: !!preview }); }, [open, member, preview]);
  const set = (p: Partial<F>) => setF((x) => ({ ...x, ...p }));
  const toggle = (k: 'roles' | 'headOf', r: string) => set({ [k]: f[k].includes(r) ? f[k].filter((x) => x !== r) : [...f[k], r] });
  const valid = f.firstName.trim() && (f.isPreview ? !f.email || /^\S+@\S+\.\S+$/.test(f.email) : /^\S+@\S+\.\S+$/.test(f.email));

  const save = async () => {
    // Ticket 76cf803c: catch a mistyped picture link before the save, with the
    // same wording the server uses, rather than surfacing it as a failed call.
    const pic = f.avatarUrl.trim();
    if (pic && !/^https?:\/\//i.test(pic)) { toast.error('The picture must be a link starting with http:// or https://.'); return; }
    if (pic && /\s/.test(pic)) { toast.error('That picture link has a space in it - check it is one clean URL.'); return; }
    setBusy(true);
    try { await adminSaveMember({ id: member?.id, ...f, avatarUrl: pic }); toast.success('Member saved'); onSaved(); onClose(); }
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
          <div className="sm:col-span-2 space-y-1">
            <label className="text-sm">Profile picture URL</label>
            <div className="flex items-center gap-3">
              <MemberAvatar url={f.avatarUrl} firstName={f.firstName} lastName={f.lastName} size="lg" />
              <Input type="url" value={f.avatarUrl} onChange={(e) => set({ avatarUrl: e.target.value })} placeholder="https://…" />
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use their initials.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm">Mentor (someone guiding them)</label>
            <Select value={f.mentorId ?? "none"} onValueChange={(v) => set({ mentorId: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="No mentor yet" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No mentor yet</SelectItem>
                {data.members
                  .filter((m) => m.id !== member?.id)
                  .sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName))
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName} · {m.shortUsername}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Shown on their home page so a new member knows who to ask.</p>
          </div>
          <div className="flex flex-col gap-2 self-end pb-2">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isMentor} onCheckedChange={(c) => set({ isMentor: !!c })} />Willing to mentor someone</label>
          </div>
          {member && !f.isPreview && (
            <div className="sm:col-span-2 space-y-2 rounded-xl border p-3">
              <p className="text-sm font-medium">Permissions</p>
              <p className="text-xs text-muted-foreground">
                Admins hold everything. Grant a normal member extra access, or take away one they would normally have.
              </p>
              <div className="space-y-2">
                {PERMISSIONS.map((p) => {
                  const state = f.permissions.granted.includes(p.key) ? 'grant' : f.permissions.revoked.includes(p.key) ? 'revoke' : 'default';
                  return (
                    <div key={p.key} className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm">{p.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.blurb} <span className="opacity-70">Default: {p.fallback === 'all' ? 'everyone' : 'admins'}.</span>
                        </p>
                      </div>
                      <Select value={state} onValueChange={(v) => set({ permissions: permSet(f.permissions, p.key, v as 'default' | 'grant' | 'revoke') })}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="grant">Allow</SelectItem>
                          <SelectItem value="revoke">Block</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
          {member && (
            <div className="sm:col-span-2 space-y-2 rounded-xl border p-3">
              <p className="text-sm font-medium">Manually granted badges</p>
              <p className="text-xs text-muted-foreground">
                Tick a badge to award it by hand, for work the app cannot see (e.g. before the crew hub existed).
                Badges a member has earned from their record are not shown here and cannot be removed this way.
              </p>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {BADGES.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm" title={b.description}>
                    <Checkbox
                      checked={manualBadges.includes(b.id)}
                      disabled={badgeBusy === b.id}
                      onCheckedChange={(c) => toggleBadge(b.id, !!c)}
                    />
                    <span>{b.emoji} {b.label}</span>
                  </label>
                ))}
              </div>
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

/** Set one permission's override to default, grant or revoke. */
function permSet(p: PermissionState, key: string, v: 'default' | 'grant' | 'revoke'): PermissionState {
  const granted = p.granted.filter((k) => k !== key);
  const revoked = p.revoked.filter((k) => k !== key);
  if (v === 'grant') granted.push(key);
  if (v === 'revoke') revoked.push(key);
  return { granted, revoked };
}
