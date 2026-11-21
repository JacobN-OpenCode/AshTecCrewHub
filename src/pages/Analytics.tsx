import { useEffect, useMemo, useState } from 'react';
import { getAnalytics, type GetAnalyticsOutputType } from '#api';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { BarChart3, Eye, Globe, Smartphone, Users } from 'lucide-react';

type Data = GetAnalyticsOutputType;
type Range = 7 | 30 | 90;

const RANGES: { days: Range; label: string }[] = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 3 months' },
];

/** '/contacts' -> 'Contacts', '/' -> 'Home'. Long paths get cut in the middle. */
function pageName(path: string) {
  if (path === '/' || path === '') return 'Home';
  return path.replace(/^\//, '').split('/').filter(Boolean).join(' / ');
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function when(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return 'just now';
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** One number with a label under it. */
function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Eye }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** A plain bar chart. No chart library: a row of divs is easier to read and to fix. */
function DailyChart({ daily }: { daily: Data['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.views));
  const labelEvery = daily.length > 45 ? 14 : daily.length > 10 ? 5 : 1;
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]">
        {daily.map((d) => (
          <div
            key={d.date}
            className="group relative flex-1 rounded-t-sm bg-primary/70 hover:bg-primary"
            style={{ height: `${Math.max(2, (d.views / max) * 100)}%` }}
            title={`${shortDate(d.date)}: ${d.views} view${d.views === 1 ? '' : 's'}, ${d.visitors} visit${d.visitors === 1 ? '' : 's'}`}
          >
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs shadow group-hover:block" />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px] text-[10px] text-muted-foreground">
        {daily.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {i % labelEvery === 0 ? shortDate(d.date) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A page or a source with a bar behind it, so the list reads without numbers. */
function BarRow({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  return (
    <div className="relative flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
      <div
        className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
        style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
        aria-hidden
      />
      <span className="relative min-w-0 truncate font-medium">{label}</span>
      <span className="relative shrink-0 tabular-nums text-muted-foreground">
        {sub ? <span className="mr-2 text-xs">{sub}</span> : null}
        {value.toLocaleString('en-GB')}
      </span>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-muted-foreground">{children}</p>;
}

/**
 * Club -> Analytics.
 *
 * Everyone sees the shape of the traffic. Admins see the names, the campaigns
 * and the referring sites, which the server only sends to admins in the first
 * place, so this page cannot leak them by accident.
 */
export default function Analytics() {
  const [days, setDays] = useState<Range>(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getAnalytics({ days })
      .then((r) => {
        if (alive) setData(r);
      })
      .catch(() => {
        if (alive) setError('Could not load the numbers just now.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const pageMax = useMemo(() => Math.max(1, ...(data?.pages ?? []).map((p) => p.views)), [data]);
  const deviceMax = useMemo(() => Math.max(1, ...(data?.devices ?? []).map((d) => d.views)), [data]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">What people look at, and where they came from.</p>
        </div>
        <div className="flex gap-1 rounded-full border p-1">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? 'default' : 'ghost'}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </header>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Page views" value={data.totals.views.toLocaleString('en-GB')} icon={Eye} hint="Every page opened" />
            <Stat label="Visits" value={data.totals.visitors.toLocaleString('en-GB')} icon={Users} hint="Separate browsers" />
            <Stat
              label="Pages per visit"
              value={data.totals.perVisit.toLocaleString('en-GB')}
              icon={BarChart3}
              hint="How far people click"
            />
            <Stat
              label="Signed in"
              value={`${data.totals.signedInViews.toLocaleString('en-GB')}`}
              icon={Users}
              hint={
                data.canSeePeople
                  ? `${data.totals.members} crew member${data.totals.members === 1 ? '' : 's'}`
                  : 'Views by crew'
              }
            />
          </div>

          <Panel title="Views per day" hint="Hover a bar for that day's numbers.">
            <DailyChart daily={data.daily} />
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Most visited pages" hint="Path, then how many visits reached it.">
              {data.pages.length ? (
                <div className="space-y-0.5">
                  {data.pages.map((p) => (
                    <BarRow
                      key={p.path}
                      label={pageName(p.path)}
                      value={p.views}
                      max={pageMax}
                      sub={`${p.visitors} visit${p.visitors === 1 ? '' : 's'}`}
                    />
                  ))}
                </div>
              ) : (
                <Empty>Nothing yet. Open a page or two and it will show up here.</Empty>
              )}
            </Panel>

            <Panel title="What they are on" hint="From the size of the screen they were using.">
              {data.devices.length ? (
                <div className="space-y-0.5">
                  {data.devices.map((d) => (
                    <BarRow
                      key={d.device}
                      label={d.device === 'phone' ? 'Phone' : d.device === 'tablet' ? 'Tablet' : d.device === 'desktop' ? 'Computer' : 'Not known'}
                      value={d.views}
                      max={deviceMax}
                    />
                  ))}
                </div>
              ) : (
                <Empty>No views yet.</Empty>
              )}
              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Anything under 640px wide counts as a phone, under 1024px as a tablet.
              </p>
            </Panel>
          </div>

          {data.canSeePeople ? (
            <>
              <Panel
                title="Who was looking"
                hint="Only visits made while signed in. The rest of the traffic is counted but nobody is named."
              >
                {data.people && data.people.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pr-3 font-medium">Person</th>
                          <th className="py-1.5 pr-3 font-medium">Year</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Views</th>
                          <th className="py-1.5 text-right font-medium">Last seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.people.map((p) => (
                          <tr key={p.id} className="border-t">
                            <td className="py-1.5 pr-3 font-medium">{p.name}</td>
                            <td className="py-1.5 pr-3 text-muted-foreground">{p.year || '—'}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{p.views.toLocaleString('en-GB')}</td>
                            <td className="py-1.5 text-right text-muted-foreground">{when(p.lastSeen)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>Nobody has been signed in during this window.</Empty>
                )}
              </Panel>

              <div className="grid gap-3 lg:grid-cols-2">
                <Panel title="Campaigns" hint="Links with ?utm_campaign on them, like a poster QR code or a message home.">
                  {data.campaigns && data.campaigns.length ? (
                    <>
                    <div className="space-y-0.5">
                      {data.campaigns.slice(0, 8).map((c) => (
                        <BarRow
                          key={`${c.campaign}-${c.source}`}
                          label={c.campaign}
                          sub={c.source || undefined}
                          value={c.views}
                          max={Math.max(1, ...data.campaigns!.map((x) => x.views))}
                        />
                      ))}
                    </div>
                    {data.campaigns.length > 8 && (
                      <p className="mt-2 text-xs text-muted-foreground">Showing the top 8 of {data.campaigns.length}.</p>
                    )}
                    </>
                  ) : (
                    <Empty>
                      No campaign tags yet. Add something like <span className="font-mono">?utm_source=poster&amp;utm_campaign=open_evening</span> to a
                      link and it will be counted here.
                    </Empty>
                  )}
                </Panel>

                <Panel title="Where they came from" hint="The site that sent them, from ?utm_source or the link they clicked.">
                  {data.sources && data.sources.length ? (
                    <>
                    <div className="space-y-0.5">
                      {data.sources.slice(0, 8).map((s) => (
                        <BarRow
                          key={`${s.source}-${s.medium}`}
                          label={s.source}
                          sub={s.medium || undefined}
                          value={s.views}
                          max={Math.max(1, ...data.sources!.map((x) => x.views))}
                        />
                      ))}
                    </div>
                    {data.sources.length > 8 && (
                      <p className="mt-2 text-xs text-muted-foreground">Showing the top 8 of {data.sources.length}.</p>
                    )}
                    </>
                  ) : (
                    <Empty>No tagged links have been used yet.</Empty>
                  )}
                </Panel>
              </div>

              <Panel title="Referring sites" hint="Pages elsewhere on the web that linked in.">
                {data.referrers && data.referrers.length ? (
                  <>
                  <div className="space-y-0.5">
                    {data.referrers.slice(0, 8).map((r) => (
                      <BarRow
                        key={r.host}
                        label={r.host}
                        sub={`${r.visitors} visit${r.visitors === 1 ? '' : 's'}`}
                        value={r.views}
                        max={Math.max(1, ...data.referrers!.map((x) => x.views))}
                      />
                    ))}
                  </div>
                  {data.referrers.length > 8 && (
                    <p className="mt-2 text-xs text-muted-foreground">Showing the top 8 of {data.referrers.length}.</p>
                  )}
                  </>
                ) : (
                  <Empty>Nobody has arrived from another site in this window.</Empty>
                )}
              </Panel>
            </>
          ) : (
            <Panel title="More detail for admins">
              <p className="text-sm text-muted-foreground">
                Admins also see which crew members were signed in, which utm campaigns brought people in, and which
                sites linked here. Ask an admin if you need those numbers.
              </p>
            </Panel>
          )}

          <div className="flex items-start gap-2 rounded-2xl border bg-muted/40 p-4 text-xs text-muted-foreground">
            <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              A view records the page, roughly what device it was, where the visitor came from, and any campaign tags
              on the link. It never records an IP address, a browser fingerprint, or anything typed into a form. Rows
              older than 180 days are deleted automatically.{' '}
              <Badge variant="secondary" className="ml-1 align-middle text-[10px]">
                {days} days shown
              </Badge>
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
