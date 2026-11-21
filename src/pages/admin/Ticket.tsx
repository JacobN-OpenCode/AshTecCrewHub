import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ask } from '../../lib/dialogs';
import { adminGetTicket, adminNoteTicket, adminReplyTicket, adminUpdateTicket, adminRemindMaintainers } from '#api';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { TYPE_STYLE, STATUS_STYLE, SEVERITY_STYLE, SEVERITIES, REPLY_KIND_STYLE } from '../../lib/supportStyle';
import { Skeleton } from '@project/components/ui/skeleton';
import { Textarea } from '@project/components/ui/textarea';
import { ArrowLeft, BellRing, Flag, Loader2, Mail, MessageSquare, Pin, ShieldAlert, Sparkles, StickyNote, Trash2 } from 'lucide-react';
import { remindOutcome } from '../../lib/remindOutcome';
import { useMe } from '../../lib/me';

type Status = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

const when = (v: string) => (v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function Ticket() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { refreshMe } = useMe();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminGetTicket>> | null>(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await adminGetTicket({ id: ticketId! });
    if (!r.ticket) { setError('That ticket no longer exists.'); return; }
    setData(r);
  }, [ticketId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="rounded-2xl border bg-card p-8 text-center space-y-3"><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={() => { location.href = '/admin/support'; }}>Back to Support</Button></div>;
  if (!data?.ticket) return <Skeleton className="h-96 rounded-2xl" />;
  const t = data.ticket;

  const run = async (key: string, fn: () => Promise<unknown>, done: () => void) => {
    setBusy(key);
    try { await fn(); done(); await load(); await refreshMe(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(''); }
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/support" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" />All tickets
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t.subject}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.type} from {data.submitter?.name ?? 'Unknown'}
            {data.submitter?.email && ` · ${data.submitter.email}`}
            {t.page && ` · raised on ${t.page}`} · {when(t.submittedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
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
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-6 min-w-0">
          <section className="space-y-2 min-w-0">
            <h2 className="text-sm font-semibold text-muted-foreground">Original message</h2>
            <p className="whitespace-pre-wrap break-words text-sm rounded-2xl bg-muted/40 p-4">{t.message}</p>
            {/* Ticket 5a04aaf1: pictures the submitter attached. */}
            {Array.isArray(t.attachments) && t.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {t.attachments.map((url: string) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer"
                    className="block h-24 w-24 overflow-hidden rounded-xl border hover:border-primary"
                    title="Open the full picture">
                    <img src={url} alt="Attachment" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Thread · {data.replies.length}</h2>
            {data.replies.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
            {data.replies.map((r) => (
              <article key={r.id} className={`rounded-2xl border p-4 ${r.kind === 'Internal Note' ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-card'}`}>
                <header className="flex flex-wrap items-center gap-2 mb-2">
                  {r.kind === 'Internal Note' ? <StickyNote className="h-3.5 w-3.5 text-yellow-400" /> : <Mail className="h-3.5 w-3.5" />}
                  <span className="text-sm font-medium">{r.kind === 'Internal Note' ? r.authorName : r.recipients}</span>
                  <Badge variant="outline" className={REPLY_KIND_STYLE[r.kind]}>{r.kind}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{when(r.sentAt)}</span>
                </header>
                <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>
              </article>
            ))}
          </section>

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />Reply by email</h2>
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Sends to ${data.submitter?.name ?? 'the submitter'} by email. They are told to reply here rather than to your inbox.`} />
            <div className="flex justify-end">
              <Button disabled={busy === 'reply' || !reply.trim()} onClick={() => run('reply', () => adminReplyTicket({ id: t.id, message: reply }), () => { setReply(''); toast.success('Reply emailed'); })}>
                {busy === 'reply' ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><StickyNote className="h-4 w-4 text-yellow-400" />Internal note</h2>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only crew admins can read this. Emails nobody." />
            <div className="flex justify-end">
              <Button variant="secondary" disabled={busy === 'note' || !note.trim()} onClick={() => run('note', () => adminNoteTicket({ id: t.id, message: note }), () => { setNote(''); toast.success('Note added'); })}>
                {busy === 'note' ? 'Saving…' : 'Add note'}
              </Button>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 h-fit min-w-0">
          <div className="rounded-2xl border bg-card p-4 space-y-2">
            <label className="text-sm">Severity</label>
            <Select value={t.severity || 'none'} onValueChange={(v) => run('severity', () => adminUpdateTicket({ id: t.id, severity: (v === 'none' ? '' : v) as '' | 'Low' | 'Medium' | 'High' | 'Urgent' }), () => toast.success('Severity updated'))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not rated</SelectItem>
                {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {['Open', 'In Progress'].includes(t.status) && (
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <Button variant="outline" className="w-full" disabled={busy === 'remind'}
                onClick={() => run('remind', async () => {
                  const r = await adminRemindMaintainers({ ids: [t.id] });
                  const out = remindOutcome(r);
                  if (out.kind === 'success') toast.success(out.text);
                  else if (out.kind === 'error') toast.error(out.text);
                  else toast.info(out.text);
                }, () => {})}>
                {busy === 'remind' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BellRing className="h-4 w-4 mr-2" />}
                Remind maintainers about this ticket
              </Button>
              <p className="text-xs text-muted-foreground">Emails whoever is assigned here, or every maintainer if nobody is.</p>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-4 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={t.pinned}
                disabled={busy === 'pin'}
                onCheckedChange={(c) => run('pin', () => adminUpdateTicket({ id: t.id, pinned: !!c }), () => toast.success(c ? 'Ticket pinned' : 'Ticket unpinned'))}
              />
              Pin to the top of the ticket list
            </label>
            <p className="text-xs text-muted-foreground">Pinned tickets sit above everything else, whatever the sort.</p>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-2">
            <label className="text-sm">Status</label>
            <Select value={t.status} onValueChange={(v) => run('status', () => adminUpdateTicket({ id: t.id, status: v as Status }), () => toast.success('Status updated'))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(STATUS_STYLE).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm">Assigned to</label>
              {busy === 'assign' && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</span>}
            </div>
            {data.maintainers.length === 0 && <p className="text-xs text-muted-foreground">No admins available to assign.</p>}
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {/* Ticket 5759835f: teachers first, then crew, each A-Z. The two
                  groups are labelled so it is obvious where the split is. */}
              {(data.maintainers as Array<{ id: string; name: string; isStaff?: boolean }>).map((m, i, all) => (
                <div key={m.id} className={i > 0 && !!m.isStaff !== !!all[i - 1].isStaff ? 'pt-2' : undefined}>
                  {(i === 0 || !!all[i - 1].isStaff !== !!m.isStaff) && (
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {m.isStaff ? 'Teachers' : 'Crew'}
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={busy === 'assign'}
                      checked={t.assignedMaintainerIds.includes(m.id)}
                      onCheckedChange={(c) => {
                        const next = c ? [...t.assignedMaintainerIds, m.id] : t.assignedMaintainerIds.filter((x) => x !== m.id);
                        run('assign', () => adminUpdateTicket({ id: t.id, assignedMaintainerIds: next }), () => toast.success('Assignment updated'));
                      }}
                    />
                    {m.name}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Reminders go to whoever is ticked here. With nobody ticked they go to all maintainers.</p>
          </div>


          <div className="rounded-2xl border bg-card p-4 space-y-2">
            <label className="text-sm">Admin scratchpad</label>
            <p className="text-xs text-muted-foreground">Not on the thread and not emailed. For quick working notes.</p>
            <AdminNotes id={t.id} initial={t.adminNotes} onSaved={() => toast.success('Scratchpad saved')} />
          </div>

          {t.escalatedAt && (
            <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-1">
              <p className="text-sm font-semibold flex items-center gap-1.5 text-orange-400"><ShieldAlert className="h-4 w-4" />Reminder sent</p>
              <p className="text-xs text-muted-foreground">Last escalated {when(t.escalatedAt)}. It repeats every 12 hours until someone replies.</p>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-4 space-y-2">
            <label className="text-sm">Reply history</label>
            <dl className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between"><dt>Last reply</dt><dd>{t.lastReplyAt ? `${when(t.lastReplyAt)} (${t.lastReplyFrom})` : 'Never'}</dd></div>
              <div className="flex justify-between"><dt>On this page</dt><dd>{data.replies.length}</dd></div>
            </dl>
            <Button variant="ghost" className="text-destructive w-full justify-start" disabled={!!busy}
              onClick={async () => { if (await ask({ title: 'Delete this ticket?', body: 'The whole thread goes with it. This cannot be undone.', confirm: 'Delete ticket', danger: true })) run('delete', () => adminUpdateTicket({ id: t.id, delete: true }), () => { location.href = '/admin/support'; }); }}>
              <Trash2 className="h-4 w-4 mr-1.5" />Delete ticket
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AdminNotes({ id, initial, onSaved }: { id: string; initial: string; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <div className="space-y-2">
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="What’s been done, who’s on it…" />
      <Button size="sm" variant="outline" onClick={async () => {
        try { await adminUpdateTicket({ id, adminNotes: value }); onSaved(); }
        catch (e) { toast.error((e as Error).message); }
      }}>Save scratchpad</Button>
    </div>
  );
}
