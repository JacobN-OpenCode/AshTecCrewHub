import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminDeploy, adminGetLogs, type AdminDeployOutputType, type AdminGetLogsOutputType } from '#api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Input } from '@project/components/ui/input';
import { ask } from '../../lib/dialogs';
import { CircleCheck, Loader2, RefreshCw, Rocket } from 'lucide-react';

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

        <DeployBox onDeployed={() => void load()} />
      </DialogContent>
    </Dialog>
  );
}
/**
 * Deploy, from here. Jacob asked for it: "let me run the deploy command at the
 * bottom of the logs tab". One button, one plain confirm, no typing "yes" three
 * times. The endpoint runs the same fixed script the MCP deploy tool runs.
 */
function DeployBox({ onDeployed }: { onDeployed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdminDeployOutputType | null>(null);

  async function run() {
    const yes = await ask({
      title: 'Deploy now?',
      body: 'Fetches main, applies the schema, builds and restarts the site. About a minute, and the site is off for a few seconds while it restarts.',
      confirm: 'Deploy now',
    });
    if (!yes) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await adminDeploy({});
      setResult(r);
      if (!r.ok) {
        toast.error(`Stopped at ${r.stoppedAt}. Nothing was restarted.`);
        return;
      }
      toast.success('Built. Restarting now, the site comes back in about 20 seconds.');
      void waitForServer(onDeployed);
    } catch (e: any) {
      toast.error(e?.message ?? 'The deploy did not start.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Rocket className="h-4 w-4 text-primary" />Deploy
          </p>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Fetches main, applies the schema, builds and restarts. The same script the MCP <span className="font-mono">deploy</span> tool runs, so this and that cannot drift.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Rocket className="mr-1.5 h-3.5 w-3.5" />}
          {busy ? 'Deploying…' : 'Deploy now'}
        </Button>
      </div>

      {result && (
        <ul className="mt-3 space-y-1 text-xs">
          {result.steps.map((s) => (
            <li key={s.cmd} className="flex items-center gap-2">
              {s.code === 0
                ? <CircleCheck className="h-3.5 w-3.5 text-emerald-400" />
                : <span className="h-3.5 w-3.5 text-center text-red-400">×</span>}
              <span className="font-mono">{s.cmd}</span>
              {s.code !== 0 && <span className="text-red-400">exit {s.code}</span>}
            </li>
          ))}
          <li className="pt-1 text-muted-foreground">{result.ok ? result.restart : result.note}</li>
        </ul>
      )}
    </div>
  );
}

/** Wait for the restart to finish, then reload so the new bundle is what you are looking at. */
async function waitForServer(after: () => void) {
  for (let i = 0; i < 45; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch('/healthz', { cache: 'no-store' });
      if (!res.ok) continue;
      const body = (await res.json()) as { ok?: boolean; endpoints?: number };
      if (body?.ok) {
        toast.success(`Back up with ${body.endpoints ?? '?'} endpoints.`);
        after();
        setTimeout(() => window.location.reload(), 900);
        return;
      }
    } catch {
      /* still restarting */
    }
  }
  toast.error('The site did not answer after 90 seconds. Check Server diagnostics.');
}
