import { useMemo, useState } from 'react';
import { useMe } from '../lib/me';
import { useAdminData, type AdminSubEvent } from '../lib/useAdminData';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Checkbox } from '@project/components/ui/checkbox';
import { Wrench, Printer, FileDown, Phone } from 'lucide-react';
import { fmtDate } from '../lib/constants';

/**
 * Tools tab. Deliberately not admin-only: the tab is where member tools will
 * live too, so a member who has none yet sees "More tools coming soon!" rather
 * than nothing. The first tool - the mobile phone excuse form - is admin-only.
 *
 * The form is built from the Word template in the ticket, filled from real
 * event data (dates and times come from the selected rehearsals/performances).
 */

const SCHOOL = 'Ashford Senior School';

/** "Saturday 5 October 2026" */
const longDate = (iso: string | null) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date TBC';

const clock = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** The permitted time for one event: prefer an explicit timing, else the meet time. */
const eventTime = (e: AdminSubEvent) => (e.timings || e.meetTime || '').trim();

function PhoneExcuseForm() {
  const { me } = useMe();
  const { data } = useAdminData();

  const [showId, setShowId] = useState<string>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [student, setStudent] = useState(`${me.firstName} ${me.lastName}`.trim());
  const [year, setYear] = useState(me.year || '');
  const [teacher, setTeacher] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');

  // All hooks must run before any early return, so the guard lives inside.
  const events = useMemo(() => {
    if (!data) return [];
    const list = showId === 'all' ? data.subEvents : data.subEvents.filter((e) => e.showIds.includes(showId));
    return list
      .filter((e) => !e.hidden)
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  }, [data, showId]);

  if (!data) return null;

  const showName = (id: string) => data.shows.find((s) => s.id === id)?.name ?? '';
  const selected = events.filter((e) => picked.includes(e.id));
  const now = new Date();

  const toggle = (id: string, on: boolean) =>
    setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));

  const pickAllInShow = (on: boolean) => setPicked(on ? events.map((e) => e.id) : []);

  /** The document, as HTML that Word and a print dialog both understand. */
  const documentHtml = () => {
    const lines = selected
      .map((e) => {
        const t = eventTime(e);
        return `<li><strong>${escapeHtml(e.title)}</strong> – ${escapeHtml(longDate(e.date))}${t ? `, ${escapeHtml(t)}` : ''}</li>`;
      })
      .join('');
    const showHeading = showId === 'all' ? 'All productions' : showName(showId);
    return `<!doctype html><html><head><meta charset="utf-8"><title>Mobile Phone Excuse Form</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:720px;margin:40px auto;line-height:1.55;padding:0 24px}
  h1{font-size:22px;margin:24px 0 4px}
  .muted{color:#555;font-size:13px}
  ul{padding-left:22px}
  li{margin:2px 0}
  .sig{margin-top:36px}
  .line{border-bottom:1px solid #111;height:34px;margin:18px 0 6px}
  footer{margin-top:40px;font-size:11px;color:#666;border-top:1px solid #ddd;padding-top:10px}
</style></head><body>
<p class="muted">${escapeHtml(now.toLocaleDateString('en-GB'))}</p>
<p>Dear Whom It May Concern,</p>
<h1>Mobile Phone Use Excuse Form</h1>
<p>The student of ${SCHOOL}: <strong>${escapeHtml(student || 'NAME OF STUDENT')}</strong>, of Year ${escapeHtml(year || 'SCHOOL YEAR')} has hereby been granted access to use their mobile phone in and around the Brake Hall area for the theatre production, managed by the AshTec Crew.</p>
<p>This has been granted to the student by <strong>${escapeHtml(teacher || 'TEACHER NAME')}</strong> on the date: ${escapeHtml(now.toLocaleDateString('en-GB'))} and ${escapeHtml(clock(now))}.</p>
<p>They are permitted to use their phone for the following times:</p>
<p><strong>${escapeHtml(showHeading)}</strong></p>
${lines ? `<ul>${lines}</ul>` : '<p class="muted">No rehearsals or performances selected.</p>'}
<p>They are permitted to use their phone for various tools, including but not limited to: accessing the ‘AshTec Crew Management System’ or Googling various things.</p>
<p>If you have any concerns, please contact ${escapeHtml(teacherEmail || 'TEACHER EMAIL')}.</p>
<p>Many Thanks,<br />AshTec Crew &amp; ${escapeHtml(teacher || 'TEACHER NAME')}</p>
<div class="sig"><p>Signed by ${escapeHtml(teacher || 'TEACHER NAME')}</p><div class="line"></div></div>
<footer>
  Ashford Senior School Bridge Nursery · East Hill, Ashford, Kent, TN24 8PB · Tel: +44 (0) 1233 625171<br />
  Ashford Prep School Stables Nursery · Great Chart, Ashford, Kent, TN23 3DJ · Tel: +44 (0) 1233 620493<br />
  Admissions: Tel +44 (0) 1233 739030 · registrar@ashfordschool.co.uk · www.ashfordschool.co.uk<br />
  Ashford School is a member of United Learning. Registered address: Worldwide House, Thorpe Wood, Peterborough, PE3 6SB. Registered in England No 2780748.
</footer>
</body></html>`;
  };

  const printDoc = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(documentHtml());
    w.document.close();
    w.focus();
    w.print();
  };

  const downloadDoc = () => {
    // Word opens an HTML file with a .doc extension and keeps the formatting.
    const blob = new Blob(['\ufeff', documentHtml()], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mobile Phone Excuse - ${(student || 'student').replace(/[^\w -]/g, '')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const valid = student.trim() && year.trim() && teacher.trim() && selected.length > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Mobile phone excuse form</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick the rehearsals and performances the student is allowed their phone for. The dates and times fill in
          from the events, and the finished form can be printed or downloaded for a teacher to sign.
        </p>

        <div className="space-y-1">
          <label className="text-sm font-medium">Production</label>
          <Select value={showId} onValueChange={(v) => { setShowId(v); setPicked([]); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All productions</SelectItem>
              {data.shows.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-medium">Rehearsals &amp; performances</label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => pickAllInShow(true)}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => pickAllInShow(false)}>Clear</Button>
            </div>
          </div>
          {events.length === 0 ? (
            <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">No events for this production yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Checkbox checked={picked.includes(e.id)} onCheckedChange={(c) => toggle(e.id, !!c)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDate(e.date, e.dateTbc)}{eventTime(e) ? ` · ${eventTime(e)}` : ''}
                      {showId === 'all' && e.showIds.length ? ` · ${e.showIds.map(showName).join(', ')}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className={e.type === 'Performance' ? 'border-pink-500/40 text-pink-400' : 'border-sky-500/40 text-sky-400'}>{e.type}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1"><label className="text-sm font-medium">Student full name</label>
            <Input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Full name for the form" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Year</label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. Year 10" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Signing teacher</label>
            <Input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Teacher name" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Teacher email</label>
            <Input type="email" value={teacherEmail} onChange={(e) => setTeacherEmail(e.target.value)} placeholder="teacher@ashfordschool.co.uk" /></div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button disabled={!valid} onClick={printDoc}><Printer className="mr-2 h-4 w-4" />Print / Save as PDF</Button>
          <Button variant="outline" disabled={!valid} onClick={downloadDoc}><FileDown className="mr-2 h-4 w-4" />Download .doc</Button>
          {!valid && <span className="self-center text-xs text-muted-foreground">Fill in the name, year, teacher and pick at least one event.</span>}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Preview</h3>
          <iframe title="Preview" srcDoc={documentHtml()} className="h-[560px] w-full rounded-xl border bg-white" />
        </div>
      )}
    </div>
  );
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function Tools() {
  const { me } = useMe();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Wrench className="h-6 w-6 text-primary" />Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">Handy extras for the crew.</p>
      </div>
      {me.isAdmin ? (
        <PhoneExcuseForm />
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="font-medium">More tools coming soon!</p>
          <p className="mt-1 text-sm text-muted-foreground">Nothing here for you yet — check back later.</p>
        </div>
      )}
    </div>
  );
}
