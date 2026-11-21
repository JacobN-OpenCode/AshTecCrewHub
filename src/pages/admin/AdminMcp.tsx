import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ask } from '../../lib/dialogs';

const VIDEO =
  'https://user-cdn.hackclub-assets.com/01a1fe58-a7e4-7935-8d4e-79ccee13e40f4/Recording%202026-11-21%20at%2013.01.23.mp4';
import { adminGetMcp, adminMcpKey, type AdminGetMcpOutputType } from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Skeleton } from '@project/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import { Check, Copy, KeyRound, Loader2, Plug, Plus, RefreshCw, Trash2 , PlayCircle } from 'lucide-react';

type Data = AdminGetMcpOutputType;

const when = (iso: string) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/**
 * Admin -> MCP: the switchboard for the crew hub's MCP server. Keys are made
 * here, paused here and deleted here, and every call an agent makes lands in
 * the log underneath so it is never a black box.
 */
export default function AdminMcp() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [asking, setAsking] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [fresh, setFresh] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      setData(await adminGetMcp({}));
    } catch (e) {
      if (!quiet) toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const makeKey = async () => {
    setBusy('create');
    try {
      const r = await adminMcpKey({ action: 'create', name: keyName.trim() || 'MCP key' });
      setFresh(r.token ?? '');
      setKeyName('');
      setAsking(false);
      await load(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const act = async (action: 'enable' | 'disable' | 'delete' | 'act-as', id: string, name: string, memberId?: string) => {
    if (action === 'delete' && !(await ask({ title: `Delete the key "${name}"?`, body: 'Anything using this key stops working straight away. You can make a new one, but the old key will not come back.', confirm: 'Delete key', danger: true }))) return;
    setBusy(id + action);
    try {
      await adminMcpKey({ action, id, ...(memberId !== undefined ? { memberId } : {}) });
      toast.success(
        action === 'delete'
          ? 'Key deleted.'
          : action === 'enable'
            ? 'Key switched on.'
            : action === 'act-as'
              ? 'The key acts as someone else now.'
              : 'Key paused.',
      );
      await load(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      toast.error('Could not copy. Select it and copy by hand.');
    }
  };

  if (!data) return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>;

  const config = JSON.stringify(
    { mcpServers: { 'ashtec-crew-hub': { type: 'http', url: data.url, headers: { Authorization: 'Bearer <the key>' } } } },
    null, 2,
  );

  return (
    <div className="space-y-5 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">MCP</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The keys an AI client uses to talk to the crew hub, and a log of everything it asked for. Keys act as one admin, so give them to people you would give that account to.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy !== ''}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', busy === 'refresh' && 'animate-spin')} />Refresh
          </Button>
          <Button size="sm" onClick={() => setAsking(true)}>
            <Plus className="mr-1.5 h-4 w-4" />New key
          </Button>
        </div>
      </header>

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium', data.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground')}>
            <span className={cn('h-2 w-2 rounded-full', data.enabled ? 'bg-emerald-400' : 'bg-muted-foreground')} />
            {data.enabled ? 'MCP server on' : 'MCP server off'}
          </span>
          <span className="text-xs text-muted-foreground">{data.toolCount} tools</span>
          <span className="text-xs text-muted-foreground">{data.callsToday} calls today</span>
          {data.failuresToday > 0 && <span className="text-xs text-amber-300">{data.failuresToday} failed</span>}
          {data.envToken && <Badge variant="outline" className="text-xs">MCP_TOKEN also set on the server</Badge>}
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Acts as</dt>
            <dd className="mt-0.5">{data.actor.name}{data.actor.email ? ` · ${data.actor.email}` : ''}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Address</dt>
            <dd className="mt-0.5 flex items-center gap-2">
              <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">{data.url}</code>
              <Button variant="ghost" size="sm" onClick={() => void copy('url', data.url)}>
                {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </dd>
          </div>
        </dl>
        {!data.enabled && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Nothing can connect while it is off. Make a key, or switch an old one back on.
          </p>
        )}
      </section>

      {/* Ticket 3805477d: the walkthrough, plus who owns this build. */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <PlayCircle className="h-4 w-4" />How to connect
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <video controls preload="metadata" className="aspect-video w-full bg-black" src={VIDEO}>
            Your browser will not play this video. The file is at {VIDEO}
          </video>
          <div className="space-y-1 p-4 text-sm text-muted-foreground">
            <p>Make a key below, paste it into your client, and it acts as you.</p>
            <p>
              The site is open source at{' '}
              <a className="underline" href="https://github.com/SmartSparkCoding/AshTecCrewHub" target="_blank" rel="noreferrer">
                SmartSparkCoding/AshTecCrewHub
              </a>
              , looked after by Jacob Navaratne. Pull requests are welcome, as long as the description starts with a
              short plain-English TLDR of what it changes.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <KeyRound className="h-4 w-4" />Keys
        </h2>
        {data.keys.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No keys yet. Make one and paste it into your client.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{k.name}</span>
                    <Badge variant={k.enabled ? 'default' : 'secondary'} className="text-xs">{k.enabled ? 'On' : 'Paused'}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    starts <code className="rounded bg-muted px-1 py-0.5">atc_{k.prefix}…</code> · made {when(k.createdAt)} · last used {when(k.lastUsedAt)}
                  </p>
                  {/* Ticket 3805477d: a key acts as its owner, and an admin can change the owner. */}
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Acts as</span>
                    <select
                      className="rounded-lg border bg-background px-2 py-1 text-xs"
                      value={k.actAsMemberId || k.memberId || ''}
                      disabled={busy !== ''}
                      onChange={(ev) => void act('act-as', k.id, k.name, ev.target.value)}
                    >
                      {(() => {
                        const people = (data as { people?: { id: string; name: string }[] }).people ?? [];
                        const known = people.some((p) => p.id === (k.actAsMemberId || k.memberId));
                        return (
                          <>
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                            {!known && <option value={k.actAsMemberId || k.memberId || ''}>{k.actorName || 'unknown'}</option>}
                          </>
                        );
                      })()}
                    </select>
                  </label>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => void act(k.enabled ? 'disable' : 'enable', k.id, k.name)}>
                    {busy === k.id + (k.enabled ? 'disable' : 'enable') && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {k.enabled ? 'Pause' : 'Switch on'}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${k.name}`} disabled={busy !== ''} onClick={() => void act('delete', k.id, k.name)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Plug className="h-4 w-4" />Recent calls
        </h2>
        {data.logs.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">Nothing yet. Calls show up here as they happen.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Key</th>
                  <th className="px-4 py-2">Asked for</th>
                  <th className="px-4 py-2">Result</th>
                  <th className="px-4 py-2">Took</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id} className="border-t align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{when(l.at)}</td>
                    <td className="px-4 py-2">{l.keyName}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs">{l.tool || l.method}</span>
                      {l.detail && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{l.detail}</p>}
                    </td>
                    <td className="px-4 py-2">
                      <span className={l.ok ? 'text-emerald-400' : 'text-red-400'}>{l.ok ? 'ok' : 'failed'}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{l.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make an MCP key</DialogTitle>
            <DialogDescription>Name it after the client or the person using it, so the log makes sense later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" value={keyName} maxLength={80} placeholder="Claude Desktop - Jacob's laptop" onChange={(e) => setKeyName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(false)}>Cancel</Button>
            <Button onClick={() => void makeKey()} disabled={busy === 'create'}>
              {busy === 'create' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Make key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fresh} onOpenChange={(o) => { if (!o) setFresh(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Here is the key</DialogTitle>
            <DialogDescription>This is the only time it is shown. If it is lost, delete it and make another.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-2">
              <code className="min-w-0 flex-1 break-all text-xs">{fresh}</code>
              <Button variant="ghost" size="sm" onClick={() => void copy('token', fresh)}>
                {copied === 'token' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Client config</p>
              <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-3 text-xs">{config}</pre>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void copy('config', config.replace('<the key>', fresh))}>
                {copied === 'config' ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}Copy config with the key in it
              </Button>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setFresh('')}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
