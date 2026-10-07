import { useCallback, useEffect, useState } from 'react';
import { adminGetLogs, type AdminGetLogsOutputType } from '#api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Input } from '@project/components/ui/input';
import { Loader2, RefreshCw } from 'lucide-react';

type LogRow = NonNullable<AdminGetLogsOutputType>['rows'][number];

const time = (iso: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

function Duration({ r }: { r: LogRow }) {
  if (r.method === 'view') {
    if (!r.viewSeconds) return <span className="text-muted-foreground">·</span>;
    return r.viewSeconds >= 60
      ? <span title={`${r.viewSeconds} s`}>{Math.round(r.viewSeconds / 60)} min</span>
      : <span>{r.viewSeconds} s</span>;
  }
  return r.latencyMs
    ? <span className={r.latencyMs > 2000 ? 'text-amber-400' : ''}>{r.latencyMs} ms</span>
    : <span className="text-muted-foreground">·</span>;
}

export default function LogsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [members, setMembers] = useState<{ email: string; name: string }[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [path, setPath] = useState('');
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    setBusy(true);
    try {
      const r = await adminGetLogs({
        limit: 100,
        memberEmail: email || undefined,
        pathContains: path || undefined,
        method: (method || undefined) as 'view' | 'api' | undefined,
        cursor,
      });
      setRows(cursor ? (prev) => [...prev, ...r.rows] : r.rows);
      setNextCursor(r.nextCursor);
      if (cursor) setMembers((prev) => (r.members.length > prev.length ? r.members : prev));
      else setMembers(r.members);
    } catch {
      /* closed or failed; leave whatever is on screen */
    } finally {
      setBusy(false);
    }
  }, [email, path, method]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity log</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Newest first. <span className="font-mono text-xs">view</span> rows are SPA page views with the time spent;
            everything else is an API request with latency.
          </p>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={email} onValueChange={setEmail}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Everyone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Everyone</SelectItem>
              {members.map((m) => <SelectItem key={m.email} value={m.email}>{m.name} ({m.email})</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="Path contains…" className="w-44" />
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All traffic" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All traffic</SelectItem>
              <SelectItem value="view">Page views</SelectItem>
              <SelectItem value="api">API calls</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => load()} disabled={busy}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Reload
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Who</th>
                <th className="px-3 py-2.5">Path</th>
                <th className="px-3 py-2.5">Outcome</th>
                <th className="px-3 py-2.5 text-right">Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No rows match.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={r.method === 'view' ? 'bg-muted/30' : ''}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{time(r.at)}</td>
                  <td className="max-w-44 truncate px-3 py-2 text-xs">
                    {r.authorized
                      ? <span title={r.email}>{r.email.split('@')[0]}</span>
                      : <span className="text-muted-foreground">anonymous</span>}
                  </td>
                  <td className="min-w-0 max-w-72 truncate px-3 py-2 font-mono text-xs" title={r.path}>
                    {r.path || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.method === 'view'
                      ? <Badge variant="outline" className="border-primary/30 text-primary">view</Badge>
                      : r.status
                        ? <Badge variant="outline" className={r.status >= 400 ? 'border-red-500/40 text-red-400' : 'border-emerald-500/40 text-emerald-400'}>{r.status}</Badge>
                        : <Badge variant="outline">ok</Badge>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs"><Duration r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{rows.length} rows shown</span>
          {nextCursor && (
            <Button variant="outline" size="sm" onClick={() => load(nextCursor)} disabled={busy}>
              <Loader2 className="mr-1.5 h-3.5 w-3.5" />Older
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}