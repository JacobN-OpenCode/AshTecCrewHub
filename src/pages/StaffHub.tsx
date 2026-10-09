import { useEffect, useMemo, useState } from 'react';
import { getStaffHome, type GetStaffHomeOutputType } from '#api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Input } from '@project/components/ui/input';
import { Search } from 'lucide-react';
import { useMe } from '../lib/me';
import { pv } from '../lib/preview';
import { fmtDate } from '../lib/constants';

/**
 * The staff homepage: a countdown to the next event, then the roster showing
 * how every student answered each upcoming event. Staff do not respond to
 * event forms, so there are no "forms due" here - this is the who-is-coming
 * view the adult in the room needs.
 */

const DOT: Record<string, string> = {
  'Expected Arrival': 'bg-emerald-500',
  Maybe: 'bg-yellow-500',
  'Not Attending': 'bg-red-500',
};
const NO_ANSWER = 'bg-muted ring-1 ring-border';

function countdownLabel(days: number) {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export default function StaffHub() {
  const { me } = useMe();
  const [data, setData] = useState<GetStaffHomeOutputType | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      setBusy(true);
      try { const d = await getStaffHome(pv()); if (live) setData(d); }
      catch (e) { if (live) setError((e as Error).message); }
      finally { if (live) setBusy(false); }
    };
    void load();
    return () => { live = false; };
  }, []);

  const who = `${me.firstName}${me.lastName ? ' ' + me.lastName : ''}`;
  const next = data?.nextEvent;

  const rows = useMemo(() => {
    if (!data) return [];
    const perStudent = new Map<string, Map<string, { status: string | null; reason: string }>>();
    for (const ev of data.upcoming) {
      for (const s of ev.statuses) {
        let byEv = perStudent.get(s.studentId);
        if (!byEv) { byEv = new Map(); perStudent.set(s.studentId, byEv); }
        byEv.set(ev.id, { status: s.status, reason: s.reason });
      }
    }
    return data.students
      .filter((s) => !q || `${s.firstName ?? ''} ${s.lastName ?? ''} ${s.email ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .map((s) => ({ student: s, byEvent: perStudent.get(s.id) ?? new Map() }));
  }, [data, q]);

  const events = data?.upcoming ?? [];

  if (error) return <p className="text-destructive">{error}</p>;
  if (!data) return <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hi {who} 👋</h1>
        <p className="text-muted-foreground mt-1">{busy ? 'Loading roster…' : `${data.students.length} students on the roster.`}</p>
      </div>

      {next && (
        <div className="rounded-2xl border bg-primary/10 border-primary/20 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Next event · {countdownLabel(next.daysUntil)}</p>
          <p className="text-2xl font-bold mt-1">{next.title}</p>
          <p className="text-muted-foreground mt-1">
            {fmtDate(next.date, next.dateTbc)}
            {next.startTime ? ` · ${next.startTime}` : ''}
            {next.endTime ? `–${next.endTime}` : ''}
          </p>
          {next.showNames.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">{next.showNames.map((s) => (
              <span key={s} className="text-xs px-2 py-1 rounded-full bg-background border">{s}</span>
            ))}</div>
          )}
        </div>
      )}
      {!next && <p className="text-muted-foreground">No upcoming dated events.</p>}

      <div className="relative max-w-xs">
        <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search students…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="sticky left-0 bg-muted/40 px-3 py-2 font-medium z-10 min-w-[9rem]">Student</th>
                {events.slice(0, 12).map((e) => (
                  <th key={e.id} className="px-3 py-2 font-medium whitespace-nowrap">
                    <div>{e.title}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {fmtDate(e.date, e.dateTbc)}
                      {e.counts.notSet > 0 ? ` · ${e.counts.notSet} unanswered` : ''}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student, byEvent }) => (
                <tr key={student.id} className="border-b last:border-0">
                  <td className="sticky left-0 bg-background px-3 py-1.5 whitespace-nowrap z-10">
                    <span className="font-medium">{student.firstName}{student.lastName ? ' ' + student.lastName : ''}</span>
                    {student.year && <span className="text-xs text-muted-foreground ml-1.5">{student.year}</span>}
                  </td>
                  {events.slice(0, 12).map((e) => {
                    const cell = byEvent.get(e.id);
                    const status = cell?.status ?? null;
                    const dot = status ? DOT[status] ?? NO_ANSWER : NO_ANSWER;
                    return (
                      <td key={e.id} className="px-3 py-1.5 text-center">
                        {/* Ticket 4b7afc54: a title-only tooltip never fires on
                            a touchscreen (and was clipped by the scroll
                            container). This shows the reason on hover AND on
                            tap/focus, from a slightly larger hit area. */}
                        <span
                          tabIndex={0}
                          role="button"
                          aria-label={cell?.reason ? `${status ?? 'No answer'}: ${cell.reason}` : status ?? 'No answer'}
                          className="group relative inline-flex cursor-pointer items-center justify-center p-1 -m-1 align-middle outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
                          <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 w-max max-w-[220px] -translate-x-1/2 rounded-lg border bg-popover px-2 py-1 text-left text-xs leading-snug text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
                            <span className="font-medium">{status ?? 'No answer'}</span>
                            {cell?.reason && <> — {cell.reason}</>}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={events.length + 1} className="px-3 py-6 text-center text-muted-foreground">No students match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {events.length > 12 && <p className="px-3 py-2 text-xs text-muted-foreground border-t">Showing the next {12} events.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Attending</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" /> Maybe</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Not attending</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-muted ring-1 ring-border" /> No answer</span>
        <span className="ml-auto">Hover or tap a dot for the reason.</span>
      </div>
    </div>
  );
}