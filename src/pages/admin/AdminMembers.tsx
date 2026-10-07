import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveMember } from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { Crown, Eye, Plus, Search, Shield, Trash2, Wrench, X } from 'lucide-react';
import { startPreview } from '../../lib/preview';
import { useAdminData, type AdminMember } from '../../lib/useAdminData';
import { ROLES, YEARS, MEMBER_TYPES } from '../../lib/constants';
import { pendingForms } from '../../lib/reminders';
import MemberDialog from '../../components/admin/MemberDialog';
import MemberProfileDialog from '../../components/admin/MemberProfileDialog';
import RemindButton from '../../components/admin/RemindButton';
import MultiFilter from '../../components/admin/MultiFilter';

const RESP_STYLE: Record<string, string> = { Yes: 'text-emerald-400', Maybe: 'text-yellow-400', No: 'text-red-400' };

export default function AdminMembers() {
  const { data, reload } = useAdminData();
  const [q, setQ] = useState('');
  const [years, setYears] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ m: AdminMember | null; preview?: boolean } | null>(null);
  const [profile, setProfile] = useState<AdminMember | null>(null);
  const [del, setDel] = useState<AdminMember | null>(null);

  /** How many forms each member still owes, so the list can filter on it. */
  const outstanding = useMemo(() => {
    const counts = new Map<string, number>();
    if (!data) return counts;
    for (const m of data.members) {
      if (m.isStaff) continue; // staff have no crew forms
      const n = pendingForms(m.id, {
        shows: data.shows,
        subEvents: data.subEvents,
        responses: data.responses,
        attendance: data.attendance,
      }).length;
      if (n > 0) counts.set(m.id, n);
    }
    return counts;
  }, [data]);

  const isStaff = (m: AdminMember) => m.year === 'Staff' || m.memberType === 'Teacher';

  const list = useMemo(() => (data?.members ?? []).filter((m) => {
    if (q && !`${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (years.length && (!m.year || !years.includes(m.year))) return false;
    if (types.length && !types.includes(m.memberType)) return false;
    if (roles.length && !roles.some((r) => m.roles.includes(r) || m.headOf.includes(r))) return false;
    if (flags.includes('admin') && !m.isAdmin) return false;
    if (flags.includes('maintainer') && !m.isMaintainer) return false;
    if (flags.includes('preview') && !m.isPreview) return false;
    if (flags.includes('staff') && !isStaff(m)) return false;
    if (flags.includes('outstanding') && !outstanding.get(m.id)) return false;
    return true;
  }), [data, q, years, types, roles, flags, outstanding]);

  const activeCount = years.length + types.length + roles.length + flags.length + (q ? 1 : 0);
  const clearAll = () => { setQ(''); setYears([]); setTypes([]); setRoles([]); setFlags([]); };

  if (!data) return <Skeleton className="h-96 rounded-2xl" />;

  const doDelete = async () => {
    try { await adminSaveMember({ id: del!.id, delete: true }); toast.success('Removed'); await reload(); }
    catch (e) { toast.error((e as Error).message); }
    setDel(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Crew <span className="text-muted-foreground font-normal text-xl">({data.members.length})</span></h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing({ m: null, preview: true })}><Eye className="h-4 w-4 mr-1" />Add preview account</Button>
          <Button data-tour="crew-add" onClick={() => setEditing({ m: null })}><Plus className="h-4 w-4 mr-1" />Add member</Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1"><Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <MultiFilter label="Year" selected={years} onChange={setYears} options={YEARS.map((y) => ({ value: y, label: y }))} />
          <MultiFilter label="Member type" selected={types} onChange={setTypes} options={MEMBER_TYPES.map((t) => ({ value: t, label: t }))} />
          <MultiFilter label="Role" selected={roles} onChange={setRoles} options={ROLES.map((r) => ({ value: r, label: r }))} />
          <MultiFilter
            label="Flags"
            selected={flags}
            onChange={setFlags}
            options={[
              { value: 'admin', label: 'Admins' },
              { value: 'maintainer', label: 'Maintainers' },
              { value: 'preview', label: 'Preview accounts' },
              { value: 'staff', label: 'Staff' },
              { value: 'outstanding', label: 'Outstanding forms' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            Showing <span className="font-medium text-foreground">{list.length}</span> of {data.members.length}
            {activeCount > 0 && ' (filtered)'}
          </span>
          {activeCount > 0 && (
            <button onClick={clearAll} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />Clear filters ({activeCount})
            </button>
          )}
        </div>
      </div>
      <div className="rounded-2xl border bg-card divide-y">
        {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">No crew members match these filters.</p>}
        {list.map((m) => (
          <div key={m.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 hover:bg-muted/40 cursor-pointer" onClick={() => setProfile(m)}>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{m.firstName} {m.lastName}</span>
                {m.isAdmin && <Shield className="h-3.5 w-3.5 text-primary" />}
                {m.isMaintainer && <Wrench className="h-3.5 w-3.5 text-primary" />}
                {m.isPreview && <Badge className="bg-primary/20 text-primary border-primary/30" variant="outline">Preview</Badge>}
                <Badge variant="outline">{m.memberType}</Badge>
                {m.year && <span className="text-xs text-muted-foreground">{m.year}</span>}
                {!!outstanding.get(m.id) && (
                  <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30" variant="outline">
                    {outstanding.get(m.id)} form{outstanding.get(m.id) === 1 ? '' : 's'} due
                  </Badge>
                )}
              </div>
              {/* Ticket b696f612: the handle reads better than a full school email. */}
              <p className="text-xs text-muted-foreground truncate" title={m.email}>@{m.shortUsername}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {m.headOf.map((r) => <Badge key={'h' + r} className="bg-primary/20 text-primary border-primary/30" variant="outline"><Crown className="h-3 w-3 mr-1" />{r}</Badge>)}
                {m.roles.filter((r) => !m.headOf.includes(r)).map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
                {(m.preferredRole1 || m.preferredRole2) && <span className="text-xs text-muted-foreground self-center">Prefers: {[m.preferredRole1, m.preferredRole2].filter(Boolean).join(', ')}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono">
              {data.shows.map((s) => {
                const r = data.responses.find((x) => x.memberId === m.id && x.showId === s.id)?.response;
                return <span key={s.id} className={RESP_STYLE[r ?? ''] ?? 'text-muted-foreground'}>{s.code || s.name}: {r ?? '—'}</span>;
              })}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {m.isPreview
                ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); startPreview(m.id); }}><Eye className="h-4 w-4 mr-1.5" />Preview as</Button>
                : <RemindButton memberId={m.id} data={data} />}
              <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setDel(m); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
      <MemberProfileDialog member={profile} data={data} onClose={() => setProfile(null)}
        onEdit={(m) => { setProfile(null); setEditing({ m }); }} />
      <MemberDialog open={!!editing} member={editing?.m ?? null} data={data} onClose={() => setEditing(null)}
        preview={editing?.preview} onSaved={async () => { await reload(); }} />
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {del?.firstName} {del?.lastName}?</AlertDialogTitle>
            <AlertDialogDescription>They will no longer be able to sign in.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doDelete}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
