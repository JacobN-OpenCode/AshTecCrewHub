import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { adminSendMessage } from 'zitejs/api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { Badge } from '@project/components/ui/badge';
import { Loader2, Send, X } from 'lucide-react';
import type { AdminData } from '../../lib/useAdminData';
import { MEMBER_TYPES, ROLES } from '../../lib/constants';

type Group = { label: string; ids: string[] };

export default function ComposeDialog({ open, data, onClose, onSent }: { open: boolean; data: AdminData; onClose: () => void; onSent: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSel(new Set()); setSubject(''); setMessage(''); setQ(''); } }, [open]);

  const groups = useMemo<Group[]>(() => {
    const m = data.members.filter((x) => !x.isPreview);
    const by = (f: (x: AdminData['members'][number]) => boolean) => m.filter(f).map((x) => x.id);
    const resp = (showId: string, r: string) => data.responses.filter((x) => x.showId === showId && x.response === r).map((x) => x.memberId);
    return [
      { label: 'Everyone', ids: m.map((x) => x.id) },
      { label: 'Admins', ids: by((x) => x.isAdmin) },
      { label: 'All heads', ids: by((x) => x.headOf.length > 0) },
      ...MEMBER_TYPES.map((t) => ({ label: t + 's', ids: by((x) => x.memberType === t) })),
      ...ROLES.map((r) => ({ label: r, ids: by((x) => x.roles.includes(r)) })),
      ...data.shows.flatMap((s) => (['Yes', 'Maybe'] as const).map((r) => ({ label: `${s.code || s.name}: ${r}`, ids: resp(s.id, r) }))),
    ].filter((g) => g.ids.length);
  }, [data]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addGroup = (g: Group) => setSel((s) => new Set([...s, ...g.ids]));
  const name = (id: string) => { const x = data.members.find((m) => m.id === id); return x ? `${x.firstName} ${x.lastName}` : ''; };
  const filtered = data.members.filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q.toLowerCase()));

  const send = async () => {
    setBusy(true);
    try {
      const r = await adminSendMessage({ memberIds: [...sel], subject, message });
      r.failed ? toast.warning(`Sent ${r.sent}, ${r.failed} failed`) : toast.success(`Sent to ${r.sent} member${r.sent > 1 ? 's' : ''}`);
      onSent();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New message</DialogTitle><DialogDescription>Each person gets their own copy, so recipients can’t see each other.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Add a group</p>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => <button key={g.label} onClick={() => addGroup(g)} className="text-xs rounded-full border px-2.5 py-1 hover:bg-muted">+ {g.label} <span className="text-muted-foreground">({g.ids.length})</span></button>)}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Or pick people</p>
            <Input placeholder="Search crew…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
              {filtered.map((m) => (
                <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={sel.has(m.id)} onCheckedChange={() => toggle(m.id)} />{m.firstName} {m.lastName}
                  <span className="text-xs text-muted-foreground ml-auto">{m.memberType}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium">To ({sel.size})</p>
              {sel.size > 0 && <button className="text-xs text-muted-foreground underline" onClick={() => setSel(new Set())}>Clear</button>}
            </div>
            <div className="flex flex-wrap gap-1">
              {[...sel].map((id) => <Badge key={id} variant="secondary" className="gap-1">{name(id)}<X className="h-3 w-3 cursor-pointer" onClick={() => toggle(id)} /></Badge>)}
              {!sel.size && <p className="text-xs text-muted-foreground">Nobody selected yet.</p>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Tech run moved to Friday" />
            {subject && <p className="text-xs text-muted-foreground">Sends as: “{subject} - AshTec Management System”</p>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Message</label>
            <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !sel.size || !subject.trim() || !message.trim()} onClick={send}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}Send to {sel.size}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
