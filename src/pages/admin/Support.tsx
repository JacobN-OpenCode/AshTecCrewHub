import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { adminGetSupport, adminSetMaintainer, type AdminGetSupportOutputType } from '#api';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { Checkbox } from '@project/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { AlertCircle, ArrowUpRight, Clock, Loader2, MessageSquare, Sparkles, Wrench } from 'lucide-react';
import { useAdminData } from '../../lib/useAdminData';
import { useSupportSameTab } from '../../lib/uiPrefs';
import { TYPE_STYLE, STATUS_STYLE, OPENCODE_TAG, OPENCODE_TAG_STYLE } from '../../lib/supportStyle';

type Ticket = AdminGetSupportOutputType['tickets'][number];

const STATUS_ORDER = ['Open', 'In Progress', 'Resolved', 'Closed'];

export default function Support() {
  const { data, patchMember } = useAdminData();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState<'recency' | 'status'>('recency');
  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const [onlyReferred, setOnlyReferred] = useState(false);
  const [busyMaint, setBusyMaint] = useState('');
  const [sameTab] = useSupportSameTab();
  const load = useCallback(() => adminGetSupport({}).then((r) => setTickets(r.tickets)), []);
  useEffect(() => { load(); }, [load]);
  // Ticket 92805b9d: keep the list current without the Refresh button. A quiet
  // poll keeps it roughly live; re-fetching on tab focus catches the "came
  // back to the tab" case immediately. Neither one toasts, so nothing nudges
  // the page except the people raising tickets showing up above.
  useEffect(() => {
    const id = window.setInterval(load, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const name = (id: string) => { const m = data?.members.find((x) => x.id === id); return m ? `${m.firstName} ${m.lastName}` : 'Unknown'; };
  const list = useMemo(() => (tickets ?? []).filter((t) =>
    (type === 'all' || t.type === type) &&
    (status === 'all' || (status === 'active' ? ['Open', 'In Progress'].includes(t.status) : t.status === status)) &&
    (!onlyAwaiting || t.awaitingReply) &&
    (!onlyReferred || t.referToOpencode) &&
    `${t.subject} ${t.message}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')), [tickets, type, status, onlyAwaiting, onlyReferred, q]);

  if (!tickets || !data) return <Skeleton className="h-96 rounded-2xl" />;
  // Maintainers must be admins, so that's all we offer.
  const candidates = data.members.filter((m) => m.isAdmin && !m.isPreview);
  const toggleMaint = async (id: string, value: boolean) => {
    if (busyMaint) return;
    setBusyMaint(id);
    patchMember(id, { isMaintainer: value });
    try { await adminSetMaintainer({ memberId: id, value }); }
    catch (e) { patchMember(id, { isMaintainer: !value }); toast.error((e as Error).message); }
    finally { setBusyMaint(''); }
  };
  const count = (s: string) => tickets.filter((t) => t.status === s).length;
  const awaiting = tickets.filter((t) => ['Open', 'In Progress'].includes(t.status) && t.awaitingReply).length;
  const referred = tickets.filter((t) => t.referToOpencode).length;
  /**
   * Friendly "today / 1 day / N days" label for a ticket. A handful of
   * imported or older tickets were created without an explicit submit
   * timestamp; without the guard, Date.parse("") returns NaN and the
   * page rendered "NaN days" (ticket 8e0d79b8). Missing or unparseable
   * input now yields an empty string so the caller can decide how to
   * render the gap rather than the app inventing a value.
   */
  const age = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  /** One ticket row, shared between the flat list and the by-status groups. */
  const row = (t: Ticket) => (
    <Link key={t.id} to={`/admin/support/${t.id}`} target={sameTab ? undefined : '_blank'} rel={sameTab ? undefined : 'noopener'}
      className="w-full p-4 flex flex-col md:flex-row md:items-center gap-2 hover:bg-muted/40">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate flex items-center gap-1.5">
          {t.subject}
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </p>
        <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{name(t.submittedById)}</span>
          <span>· {t.submittedAt && new Date(t.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          {t.assignedMaintainerIds.length > 0 && (
            <span>· assigned to {t.assignedMaintainerIds.map(name).join(', ')}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
          {t.awaitingReply && ['Open', 'In Progress'].includes(t.status)
            ? (() => {
                const ageStr = age(t.lastReplyAt || t.submittedAt);
                return (
                  <span className="text-orange-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    waiting on a reply{ageStr ? ` · ${ageStr}` : ''}
                  </span>
                );
              })()
            : <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}</span>}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {t.referToOpencode && (
          <Badge variant="outline" className={OPENCODE_TAG_STYLE}>
            <Sparkles className="h-3 w-3 mr-1" />{OPENCODE_TAG}
          </Badge>
        )}
        <Badge variant="outline" className={TYPE_STYLE[t.type]}>{t.type}</Badge>
        <Badge variant="outline" className={STATUS_STYLE[t.status]}>{t.status}</Badge>
      </div>
    </Link>
  );

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-6 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Support</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {count('Open')} open · {count('In Progress')} in progress · {count('Resolved')} resolved
              {awaiting > 0 && <span className="text-orange-400"> · {awaiting} awaiting a reply</span>}
            </p>
          </div>
          <Button variant="outline" onClick={() => { load(); toast.success('Refreshed'); }}>Refresh</Button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 min-w-0">
          <div className="relative min-w-0"><AlertCircle className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input data-tour="support-search" className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem>{Object.keys(TYPE_STYLE).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Open & in progress</SelectItem><SelectItem value="all">All statuses</SelectItem>{Object.keys(STATUS_STYLE).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={sort} onValueChange={(v) => setSort(v as 'recency' | 'status')}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recency"><span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" />Newest first</span></SelectItem>
              <SelectItem value="status">By status</SelectItem>
            </SelectContent></Select>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={onlyAwaiting} onCheckedChange={(c) => setOnlyAwaiting(!!c)} />
            Only tickets waiting on a maintainer
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox data-tour="support-referred" checked={onlyReferred} onCheckedChange={(c) => setOnlyReferred(!!c)} />
            Only {OPENCODE_TAG.toLowerCase()} ({referred})
          </label>
        </div>

        <div className="rounded-2xl border bg-card divide-y min-w-0">
          {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">No tickets here. 🎉</p>}
          {sort === 'status' ? STATUS_ORDER.map((s) => {
            const inStatus = list.filter((t) => t.status === s);
            if (!inStatus.length) return null;
            return (
              <section key={s} className="divide-y">
                <h2 className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {s} · {inStatus.length}
                </h2>
                {inStatus.map(row)}
              </section>
            );
          }) : list.map(row)}
        </div>
      </div>

      <aside className="rounded-2xl border bg-card p-4 h-fit space-y-3 min-w-0">
        <div className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-primary" />Maintainers</div>
        <p className="text-xs text-muted-foreground">Admins only. Emailed about bug reports and feature requests. General support goes to all admins who aren’t staff.</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {candidates.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={m.isMaintainer}
                disabled={busyMaint === m.id}
                onCheckedChange={(c) => toggleMaint(m.id, !!c)}
              />
              <span className={busyMaint === m.id ? 'opacity-60' : undefined}>{m.firstName} {m.lastName}</span>
              {busyMaint === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto text-muted-foreground" />}
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}
