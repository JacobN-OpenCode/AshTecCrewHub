import { useEffect, useState } from 'react';
import { adminGetDiagnostics } from '#api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { CheckCircle2, History, RefreshCw, ServerCog, TriangleAlert, XCircle } from 'lucide-react';
import LogsDialog from '../../components/admin/LogsDialog';

type Diag = Awaited<ReturnType<typeof adminGetDiagnostics>>;

/** A labelled key/value grid. Long values wrap rather than widening the page. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-full shrink-0 text-xs uppercase tracking-wider text-muted-foreground sm:w-56">{k}</span>
      <span className="min-w-0 break-words font-mono text-sm">{v}</span>
    </div>
  );
}

const ok = (b: boolean) =>
  b ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">yes</Badge>
    : <Badge variant="outline" className="border-red-500/40 text-red-400">no</Badge>;

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export default function ServerDiagnostics() {
  const [d, setD] = useState<Diag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setD(await adminGetDiagnostics({}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); }, []);

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Server diagnostics</h1>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!d) return <Skeleton className="h-96 rounded-2xl" />;

  const healthy = d.schema.missingTables.length === 0 && d.config.smtpConfigured && d.config.vapidPublicKeySet;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ServerCog className="h-6 w-6 text-primary" />
            Server diagnostics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {healthy ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="h-4 w-4" />Everything configured</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-400"><TriangleAlert className="h-4 w-4" />Something needs attention</span>
            )}
            <span className="ml-2">Generated {new Date(d.generatedAt).toLocaleTimeString('en-GB')}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setLogsOpen(true)}>
          <History className="mr-2 h-4 w-4" />Logs
        </Button>
        <Button variant="outline" onClick={load} disabled={busy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        </div>
      </div>

      {d.schema.missingTables.length > 0 && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
          Missing tables: <span className="font-mono">{d.schema.missingTables.join(', ')}</span> — the schema has not
          been applied. Run <span className="font-mono">npm run migrate -- --schema-only</span>.
        </p>
      )}

      <Card title="Runtime">
        <Row k="Uptime" v={d.runtime.uptimeHuman} />
        <Row k="Node" v={d.runtime.node} />
        <Row k="Platform" v={d.runtime.platform} />
        <Row k="PID" v={d.runtime.pid} />
        <Row k="Process timezone" v={d.runtime.processTZ} />
        <Row k="Server time (UTC)" v={d.runtime.serverTimeUTC} />
        <Row k="Server time (London)" v={d.runtime.serverTimeLondon} />
      </Card>

      <Card title="Memory">
        <Row k="RSS" v={`${d.memory.rssMB} MB`} />
        <Row k="Heap used / total" v={`${d.memory.heapUsedMB} / ${d.memory.heapTotalMB} MB`} />
        <Row k="External" v={`${d.memory.externalMB} MB`} />
      </Card>

      <Card title="Configuration">
        <Row k="App URL" v={d.config.appUrl} />
        <Row k="Port" v={d.config.port} />
        <Row k="NODE_ENV" v={d.config.nodeEnv} />
        <Row k="Database URL set" v={ok(d.config.databaseUrlSet)} />
        <Row k="SMTP configured" v={ok(d.config.smtpConfigured)} />
        <Row k="SMTP host / port" v={`${d.config.smtpHost} / ${d.config.smtpPort}`} />
        <Row k="Email from" v={d.config.emailFrom} />
        <Row k="VAPID key set" v={ok(d.config.vapidPublicKeySet)} />
      </Card>

      <Card title="Database">
        <Row k="Host" v={d.database.host.host ?? '?'} />
        <Row k="Port" v={d.database.host.port ?? '?'} />
        <Row k="Database" v={d.database.host.database ?? '?'} />
        <Row k="User" v={d.database.host.user ?? '?'} />
        <Row k="Pool max" v={d.database.poolMax} />
      </Card>

      <Card title="Table counts">
        {Object.entries(d.database.counts).map(([k, v]) => (
          <Row key={k} k={k} v={v === null ? <span className="text-red-400">missing</span> : v} />
        ))}
      </Card>

      <Card title="Background jobs">
        <Row k="Note" v={<span className="text-muted-foreground">{d.jobs.note}</span>} />
        <Row k="Last notification sent" v={ago(d.jobs.lastNotificationSentAt)} />
        <Row k="Last email logged" v={ago(d.jobs.lastEmailLoggedAt)} />
        <Row k="Last ticket created" v={ago(d.jobs.lastTicketCreatedAt)} />
        <Row k="Last venue event" v={ago(d.jobs.lastPresenceEventAt)} />
        <Row k="Push subscriptions" v={d.jobs.pushSubscriptions ?? '—'} />
        {d.jobs.scheduled.map((j) => <Row key={j.name} k={j.name} v={j.when} />)}
      </Card>

      <Card title="Schema">
        <Row k="Missing tables" v={d.schema.missingTables.length ? d.schema.missingTables.join(', ') : <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-4 w-4" />none</span>} />
      </Card>

      <LogsDialog open={logsOpen} onClose={() => setLogsOpen(false)} />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Secrets are never shown — only whether they are set. Job times are inferred from the newest row each job writes,
        because there is no run-history table.
      </p>
    </div>
  );
}
