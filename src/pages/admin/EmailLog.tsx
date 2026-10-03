import { useEffect, useMemo, useState } from 'react';
import { adminGetEmailLog, type AdminGetEmailLogOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@project/components/ui/dialog';
import { Markdown } from '@project/components/markdown';
import { Search, PenSquare, ChevronRight, Users } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@project/components/ui/collapsible';
import { Button } from '@project/components/ui/button';
import ComposeDialog from '../../components/admin/ComposeDialog';
import { useAdminData } from '../../lib/useAdminData';

type Mail = AdminGetEmailLogOutputType['emails'][number];
const PAGE = 25;

export default function EmailLog() {
  const { data } = useAdminData();
  const [emails, setEmails] = useState<Mail[] | null>(null);
  const [q, setQ] = useState('');
  const [member, setMember] = useState('all');
  const [purpose, setPurpose] = useState('all');
  const [show, setShow] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Mail | null>(null);
  const [compose, setCompose] = useState(false);
  const loadLog = () => adminGetEmailLog({}).then((r) => setEmails(r.emails));
  useEffect(() => { loadLog(); }, []);

  const name = (id: string) => { const m = data?.members.find((x) => x.id === id); return m ? `${m.firstName} ${m.lastName}` : 'Unknown'; };
  const purposes = [...new Set((emails ?? []).map((e) => e.purpose).filter(Boolean))];
  const list = useMemo(() => (emails ?? []).filter((e) =>
    (member === 'all' || e.memberId === member) && (purpose === 'all' || e.purpose === purpose) &&
    (show === 'all' || e.showIds.includes(show)) &&
    `${e.subject} ${e.recipient}`.toLowerCase().includes(q.toLowerCase())), [emails, member, purpose, show, q]);
  useEffect(() => setPage(1), [member, purpose, show, q]);

  if (!emails || !data) return <Skeleton className="h-96 rounded-2xl" />;
  // Bucket every email by batch id first, so sends that were interleaved with
  // other sends still group together, then order each group and the groups
  // themselves by their most recent email.
  const batches = new Map<string, Mail[]>();
  const singles: Mail[] = [];
  for (const e of list) {
    if (!e.batchId) { singles.push(e); continue; }
    const g = batches.get(e.batchId);
    if (g) g.push(e); else batches.set(e.batchId, [e]);
  }
  const byNewest = (a: Mail[], b: Mail[]) => (b[0]?.sentAt ?? '').localeCompare(a[0]?.sentAt ?? '');
  for (const g of batches.values()) g.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const groups = [...batches.values()].sort(byNewest);
  groups.push(...singles.map((e) => [e]).sort(byNewest));
  const shown = groups.slice(0, page * PAGE);
  const Row = ({ e, nested }: { e: Mail; nested?: boolean }) => (
    <button onClick={() => setOpen(e)} className={`w-full text-left p-4 flex flex-col md:flex-row md:items-center gap-2 hover:bg-muted/40 ${nested ? 'pl-10 bg-muted/20' : ''}`}>
      <div className="flex-1 min-w-0">
        {!nested && <p className="font-medium truncate">{e.subject}</p>}
        <p className="text-xs text-muted-foreground">To {name(e.memberId)} · {e.recipient}{!nested && e.sentBy && ` · by ${e.sentBy}`}</p>
      </div>
      {!nested && <Meta e={e} />}
    </button>
  );
  const Meta = ({ e }: { e: Mail }) => (
    <div className="flex flex-wrap gap-1.5 items-center">
      <Badge variant="outline" className="border-primary/40 text-primary">{e.purpose}</Badge>
      {e.showIds.map((id) => <Badge key={id} variant="secondary">{data.shows.find((s) => s.id === id)?.code || '?'}</Badge>)}
      <span className="text-xs font-mono text-muted-foreground ml-2">{new Date(e.sentAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Emails <span className="text-muted-foreground font-normal text-xl">({list.length})</span></h1>
        <Button onClick={() => setCompose(true)}><PenSquare className="h-4 w-4 mr-1.5" />New message</Button>
      </div>
      <ComposeDialog open={compose} data={data} onClose={() => setCompose(false)} onSent={() => { setCompose(false); loadLog(); }} />
      <div className="grid sm:grid-cols-4 gap-2">
        <div className="relative"><Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input data-tour="emails-search" className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={member} onValueChange={setMember}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All members</SelectItem>{data.members.map((m) => <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName}</SelectItem>)}</SelectContent></Select>
        <Select value={purpose} onValueChange={setPurpose}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All purposes</SelectItem>{purposes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
        <Select value={show} onValueChange={setShow}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All shows</SelectItem>{data.shows.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="rounded-2xl border bg-card divide-y">
        {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">No emails sent yet.</p>}
        {shown.map((g) => g.length === 1 ? <Row key={g[0].id} e={g[0]} /> : (
          <Collapsible key={g[0].batchId} className="group">
            <CollapsibleTrigger className="w-full text-left p-4 flex flex-col md:flex-row md:items-center gap-2 hover:bg-muted/40">
              <div className="flex-1 min-w-0 flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{g[0].subject}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />To {g.length} people{g[0].sentBy && ` · by ${g[0].sentBy}`}</p>
                </div>
              </div>
              <Meta e={g[0]} />
            </CollapsibleTrigger>
            <CollapsibleContent className="divide-y border-t">{g.map((e) => <Row key={e.id} e={e} nested />)}</CollapsibleContent>
          </Collapsible>
        ))}
        {shown.length < groups.length && <button className="w-full p-3 text-sm text-primary" onClick={() => setPage(page + 1)}>Load more</button>}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.subject}</DialogTitle><DialogDescription>To {open?.recipient}</DialogDescription></DialogHeader>
          <div className="prose prose-invert prose-sm max-w-none"><Markdown>{open?.body ?? ''}</Markdown></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
