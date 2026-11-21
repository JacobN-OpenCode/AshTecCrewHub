import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { adminGetSupport, adminSetMaintainer, adminRemindMaintainers, adminUpdateTicket, adminExportTickets, type AdminGetSupportOutputType } from '#api';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { Checkbox } from '@project/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { AlertCircle, ArrowUpRight, BellRing, Clock, Download, Flag, Loader2, MessageSquare, Pin, PinOff, Wrench } from 'lucide-react';
import { useAdminData } from '../../lib/useAdminData';
import { useMe } from '../../lib/me';
import { useSupportSameTab, useAdminLayout } from '../../lib/uiPrefs';
import { TYPE_STYLE, STATUS_STYLE, SEVERITY_STYLE, SEVERITIES } from '../../lib/supportStyle';
import { remindOutcome } from '../../lib/remindOutcome';

type Ticket = AdminGetSupportOutputType['tickets'][number];

const STATUS_ORDER = ['Open', 'In Progress', 'Resolved', 'Closed'];

/**
 * Ticket 8283a6f7: the filters reset every time you came back from a ticket,
 * and there was no way to say what the page should open on. Both are the same
 * fix - remember the last filter set in this browser and start from it. Going
 * back to the list remounts this page, so the remembered set is also what the
 * back button restores.
 */
const FILTER_KEY = 'ashtec-support-filters';
type Filters = {
  q: string;
  type: string;
  status: string;
  severity: string;
  sort: 'recency' | 'oldest' | 'status';
  onlyMaintainerTurn: boolean;
};
const FILTER_DEFAULTS: Filters = {
  q: '',
  type: 'all',
  status: 'active',
  severity: 'all',
  sort: 'recency',
  onlyMaintainerTurn: false,
};

function savedFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return FILTER_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Filters>;
    // Unknown or missing keys fall back to the default rather than breaking.
    return { ...FILTER_DEFAULTS, ...parsed };
  } catch {
    return FILTER_DEFAULTS;
  }
}

export default function Support() {
  const { data, patchMember } = useAdminData();
  const { me } = useMe();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  // Read once, so every filter below starts from what this browser last used.
  const [start] = useState<Filters>(savedFilters);
  const [q, setQ] = useState(start.q);
  const [type, setType] = useState(start.type);
  const [status, setStatus] = useState(start.status);
  const [severity, setSeverity] = useState(start.severity);
  // Ticket 7e001fce: the list always showed the submitted date; make the date
  // sortable in both directions.
  const [sort, setSort] = useState<Filters['sort']>(start.sort);
  // Ticket edf25b3d: this checkbox is "waiting on a maintainer", which is the
  // maintainerTurn rule (see adminGetSupport), not awaitingReply - that asks
  // whether the sender still owes us a reply.
  const [onlyMaintainerTurn, setOnlyMaintainerTurn] = useState(start.onlyMaintainerTurn);
  // Remember the current set as this browser's default (ticket 8283a6f7).
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ q, type, status, severity, sort, onlyMaintainerTurn }));
    } catch {
      // A browser with storage blocked just keeps the built-in defaults.
    }
  }, [q, type, status, severity, sort, onlyMaintainerTurn]);

  const changed =
    q !== FILTER_DEFAULTS.q ||
    type !== FILTER_DEFAULTS.type ||
    status !== FILTER_DEFAULTS.status ||
    severity !== FILTER_DEFAULTS.severity ||
    sort !== FILTER_DEFAULTS.sort ||
    onlyMaintainerTurn !== FILTER_DEFAULTS.onlyMaintainerTurn;

  const resetFilters = () => {
    setQ(FILTER_DEFAULTS.q);
    setType(FILTER_DEFAULTS.type);
    setStatus(FILTER_DEFAULTS.status);
    setSeverity(FILTER_DEFAULTS.severity);
    setSort(FILTER_DEFAULTS.sort);
    setOnlyMaintainerTurn(FILTER_DEFAULTS.onlyMaintainerTurn);
  };

  const [busyMaint, setBusyMaint] = useState('');
  const [pinning, setPinning] = useState('');
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindingId, setRemindingId] = useState('');
  const [sameTab] = useSupportSameTab();
  // Feedback round 2: cards or a list, the admin's choice (default cards).
  const [layout] = useAdminLayout();
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
    (severity === 'all' || t.severity === severity) &&
    (status === 'all' || (status === 'active' ? ['Open', 'In Progress'].includes(t.status) : t.status === status)) &&
    (!onlyMaintainerTurn || t.maintainerTurn) &&
    `${t.subject} ${t.message}`.toLowerCase().includes(q.toLowerCase()))
    // Ticket 636bde75: pinned tickets always sit at the top of the list,
    // whatever the chosen sort, so the few that matter stay in view.
    .sort((a, b) =>
      (Number(b.pinned) - Number(a.pinned)) ||
      (sort === 'oldest'
        ? (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')
        : (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))),
    [tickets, type, severity, status, onlyMaintainerTurn, q, sort]);

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
  // Ticket 636bde75: pin/unpin one ticket. The list re-sorts with the pinned
  // row moving to the top, so we update local state instead of refetching.
  const togglePin = async (t: Ticket) => {
    if (pinning) return;
    setPinning(t.id);
    const next = !t.pinned;
    setTickets((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, pinned: next } : x)));
    try { await adminUpdateTicket({ id: t.id, pinned: next }); }
    catch (e) {
      setTickets((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, pinned: !next } : x)));
      toast.error((e as Error).message);
    } finally { setPinning(''); }
  };
  // Ticket 7: Refresh said "Refreshed" before the reload had finished, so a
  // ticket raised a second ago could still be missing. It now waits.
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await load(); toast.success('Refreshed'); }
    catch (e) { toast.error((e as Error).message); }
    finally { setRefreshing(false); }
  };
  const count = (s: string) => tickets.filter((t) => t.status === s).length;
  const awaiting = tickets.filter((t) => ['Open', 'In Progress'].includes(t.status) && t.awaitingReply).length;
  // Ticket b9f059cf: count where a maintainer reply is the next step. Mirrors
  // the digest rule server-side (maintainerTurn) so the number matches.
  const maintainerTurn = tickets.filter((t) => t.maintainerTurn).length;
  const remindOne = async (id: string) => {
    if (remindingId) return;
    setRemindingId(id);
    try {
      const r = await adminRemindMaintainers({ ids: [id] });
      const out = remindOutcome(r);
      if (out.kind === 'success') toast.success(out.text);
      else if (out.kind === 'error') toast.error(out.text);
      else toast.info(out.text);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setRemindingId(''); }
  };
  const remind = async () => {
    if (reminding) return;
    setReminding(true);
    try {
      const r = await adminRemindMaintainers({});
      const out = remindOutcome(r);
      if (out.kind === 'success') toast.success(out.text);
      else if (out.kind === 'error') toast.error(out.text);
      else toast.info(out.text);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setReminding(false); }
  };
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

  /**
   * One ticket row, shared between the flat list, the by-status groups and cards.
   *
   * Ticket 7 ("the ticket buttons are a little broken"): the row used to be one
   * <Link> with the pin and remind controls nested inside it. A button
   * inside an anchor is invalid HTML and the browser gives the click to the
   * anchor, so the buttons either did nothing or opened the ticket instead. The
   * link is now an empty stretched overlay covering the row, and the controls
   * sit above it on their own layer - so the row is still clickable, and the
   * buttons work.
   */
  const row = (t: Ticket, card = false) => (
    <div key={t.id} className={card
      ? 'relative flex h-full flex-col gap-2 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40'
      : 'relative w-full p-4 flex flex-col md:flex-row md:items-center gap-2 transition-colors hover:bg-muted/40'}>
      <Link
        to={`/admin/support/${t.id}`}
        target={sameTab ? undefined : '_blank'}
        rel={sameTab ? undefined : 'noopener'}
        aria-label={`Open ${t.subject}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium flex items-center gap-1.5 min-w-0">
          {t.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
          <span className="truncate">{t.subject}</span>
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
                    waiting on the reporter{ageStr ? ` · ${ageStr}` : ''}
                  </span>
                );
              })()
            : <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}</span>}
        </p>
      </div>
      <div className="relative z-10 flex flex-wrap items-center gap-1.5 shrink-0">
        {t.severity && (
          <Badge variant="outline" className={SEVERITY_STYLE[t.severity]}>
            <Flag className="h-3 w-3 mr-1" />{t.severity}
          </Badge>
        )}
        <Badge variant="outline" className={TYPE_STYLE[t.type]}>{t.type}</Badge>
        <Badge variant="outline" className={STATUS_STYLE[t.status]}>{t.status}</Badge>
        {t.pinned && (
          <Badge variant="outline" className="border-amber-500/40 text-amber-400">
            <Pin className="h-3 w-3 mr-1" />Pinned
          </Badge>
        )}
        <Button
          variant="ghost" size="sm" className="h-7 px-2 text-xs"
          disabled={pinning === t.id}
          title={t.pinned ? 'Unpin this ticket' : 'Pin this ticket to the top'}
          onClick={() => togglePin(t)}
        >
          {pinning === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </Button>
        {t.maintainerTurn && (
          <Button
            variant="ghost" size="sm" className="h-7 px-2 text-xs"
            disabled={remindingId === t.id}
            title="Remind the maintainers about just this ticket"
            onClick={() => remindOne(t.id)}
          >
            {remindingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );

  // One file with every open ticket and its whole thread, so the backlog can be
  // handed over without opening each ticket. Built in the browser from the
  // endpoint's JSON, so nothing is stored server-side.
  // Same tickets as the JSON export, flattened to one row each, because a
  // spreadsheet is what most people actually want to sort and hand over.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await adminExportTickets({});
      const rowsData = (r.tickets ?? []) as Array<Record<string, any>>;
      const head = ['Subject', 'Type', 'Severity', 'Status', 'Page', 'Submitted by', 'Submitted', 'Assigned to', 'Replies'];
      const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
      const rows = rowsData.map((t) => [
        t.subject, t.type, t.severity, t.status, t.page,
        t.submitter?.name ?? '', t.submittedAt ?? '',
        (t.assigned ?? []).map((a: any) => a.name).join('; '),
        (t.replies ?? []).length,
      ]);
      const csv = [head, ...rows].map((r2) => r2.map(cell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ashtec-open-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(r.count === 0 ? 'No open tickets to download' : `Downloaded ${r.count} open ticket${r.count === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not build the export.');
    } finally {
      setExporting(false);
    }
  };

  const exportOpen = async () => {
    setExporting(true);
    try {
      const r = await adminExportTickets({});
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ashtec-open-tickets-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(r.count === 0 ? 'No open tickets to download' : `Downloaded ${r.count} open ticket${r.count === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not build the export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
      <div className="space-y-6 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Support</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {count('Open')} open · {count('In Progress')} in progress · {count('Resolved')} resolved
              {awaiting > 0 && <span className="text-orange-400"> · {awaiting} waiting on the reporter</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={exporting} title="One row per open ticket, for a spreadsheet">
              <Download className="h-4 w-4 mr-2" />CSV
            </Button>
            <Button variant="outline" onClick={exportOpen} disabled={exporting} title="Download every open ticket, with its full thread, as one JSON file">
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download open tickets
            </Button>
            <Button variant="outline" onClick={remind} disabled={reminding || maintainerTurn === 0}>
              {reminding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BellRing className="h-4 w-4 mr-2" />}
              Remind maintainers{maintainerTurn > 0 ? ` (${maintainerTurn})` : ''}
            </Button>
            <Button variant="outline" disabled={refreshing} onClick={refresh}>{refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Refresh</Button>
            {changed && (
              <Button variant="ghost" onClick={resetFilters} title="Back to the built-in filters: open and in progress, newest first">
                Reset filters
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 min-w-0">
          <div className="relative min-w-0"><AlertCircle className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input data-tour="support-search" className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem>{Object.keys(TYPE_STYLE).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={severity} onValueChange={setSeverity}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All severities</SelectItem>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Open & in progress</SelectItem><SelectItem value="all">All statuses</SelectItem>{Object.keys(STATUS_STYLE).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={sort} onValueChange={(v) => setSort(v as 'recency' | 'oldest' | 'status')}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recency"><span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" />Newest first</span></SelectItem>
              <SelectItem value="oldest"><span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" />Oldest first</span></SelectItem>
              <SelectItem value="status">By status</SelectItem>
            </SelectContent></Select>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={onlyMaintainerTurn} onCheckedChange={(c) => setOnlyMaintainerTurn(!!c)} />
            Only tickets waiting on us
          </label>
        </div>

        {/* Ticket 47c6e418: "waiting on the reporter" was never explained on the
            page. Both states are about who spoke last, so say that plainly. */}
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Waiting on us</span> means the reporter spoke last, so a
          maintainer owes them an answer. <span className="font-medium text-foreground">Waiting on the reporter</span>{' '}
          means we replied and the next move is theirs. Your filters are remembered in this browser.
        </p>

        {layout === 'cards' ? (
          <div className="grid grid-cols-1 min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.length === 0 && <p className="col-span-full p-6 text-sm text-muted-foreground">No tickets here. 🎉</p>}
            {list.map((t) => row(t, true))}
          </div>
        ) : (
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
                  {inStatus.map((t) => row(t))}
                </section>
              );
            }) : list.map((t) => row(t))}
          </div>
        )}
      </div>

      <aside className="rounded-2xl border bg-card p-4 h-fit space-y-3 min-w-0">
        {/* Tickets d1ae2a76 / 09b3e402 / 26239458: the email mode is now a
            per-account choice in each member's profile, with the site-wide
            default living in Admin settings. This page just points at it. */}
        <div className="border-b pb-3 space-y-1">
          <p className="text-sm font-medium">Support email</p>
          <p className="text-xs text-muted-foreground">
            Everyone picks per-ticket or a daily summary in their own profile. The default for anyone who has not picked is in Settings.
          </p>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/admin/settings">Open Settings</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-primary" />Maintainers</div>
        <p className="text-xs text-muted-foreground">Admins only. Emailed about bug reports. Feature requests and general support go to all admins who aren’t staff.</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {candidates.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={m.isMaintainer}
                disabled={busyMaint === m.id}
                onCheckedChange={(c) => toggleMaint(m.id, !!c)}
              />
              <span className={busyMaint === m.id ? 'opacity-60' : undefined}>{m.firstName} {m.lastName}{me?.id === m.id && <span className="text-muted-foreground"> (you)</span>}</span>
              {busyMaint === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto text-muted-foreground" />}
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}
