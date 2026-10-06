import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../lib/me';
import { useAdminData, type AdminSubEvent } from '../lib/useAdminData';
import { getMyEvents, type GetMyEventsOutputType } from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Checkbox } from '@project/components/ui/checkbox';
import { Wrench, Printer, FileDown, Phone, Mail } from 'lucide-react';
import { fmtDate } from '../lib/constants';
import { formatEventTimeRange } from '../lib/icsBuild';

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

/** The permitted time for one event: prefer the structured start/end range,
 *  falling back to the meet time only when no real times are set. */
const eventTime = (e: AdminSubEvent): string => {
  const range = formatEventTimeRange(e.startTime ?? null, e.endTime ?? null);
  return range || e.meetTime?.trim() || '';
};

function PhoneExcuseForm() {
  const { me } = useMe();
  const { data } = useAdminData();

  const [showId, setShowId] = useState<string>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [student, setStudent] = useState(`${me.firstName} ${me.lastName}`.trim());
  const [year, setYear] = useState(me.year || '');
  const [teacher, setTeacher] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  // The school logo as a data URI, so it renders in the print window AND inside
  // the downloaded .doc (a relative URL would break once the file leaves the app).
  const [logo, setLogo] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/ashford-logo.jpeg')
      .then((r) => r.blob())
      .then((b) => new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = rej;
        fr.readAsDataURL(b);
      }))
      .then((d) => { if (alive) setLogo(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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

  /**
   * The document, matched to the Word template Jacob supplied: Calibri body, the
   * Ashford School logo and school names as a header, and the school's address
   * block plus "A company limited by guarantee" as a footer. HTML that both the
   * print dialog and Word (via the .doc download) render faithfully.
   */
  const documentHtml = () => {
    const lines = selected
      .map((e) => {
        const t = eventTime(e);
        return `<li>${escapeHtml(e.title)} – ${escapeHtml(longDate(e.date))}${t ? `, ${escapeHtml(t)}` : ''}</li>`;
      })
      .join('');
    const showHeading = showId === 'all' ? 'All productions' : showName(showId);
    const logoSrc = logo || '/ashford-logo.jpeg';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Mobile Phone Excuse Form</title>
<style>
  @page { size: A4; margin: 22mm 18mm 30mm; }
  body{font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#000;line-height:1.4;margin:0}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #999;padding-bottom:8px}
  .header img{height:54px;width:auto}
  .schools{font-size:8pt;color:#333;text-align:right;line-height:1.35}
  h1{font-size:15pt;text-align:center;margin:20px 0 14px}
  p{margin:0 0 11px}
  ul{margin:0 0 11px;padding-left:22px}
  li{margin:2px 0}
  .sig{margin-top:34px}
  .line{border-bottom:1px solid #000;height:34px;margin:16px 0 6px}
  .footer{font-size:8pt;color:#444;border-top:1px solid #ccc;padding-top:8px;line-height:1.45}
  @media print{
    .header{position:fixed;top:0;left:0;right:0;background:#fff}
    .footer{position:fixed;bottom:0;left:0;right:0;background:#fff}
    .pad-top{height:74px}.pad-bottom{height:104px}
  }
</style></head><body>
<div class="header">
  <img src="${logoSrc}" alt="Ashford School" />
  <div class="schools">Senior School<br />Prep School &middot; Bridge Nursery &middot; Stables Nursery</div>
</div>
<div class="pad-top"></div>
<p style="color:#555;font-size:9pt">${escapeHtml(now.toLocaleDateString('en-GB'))}</p>
<p>Dear Whom It May Concern,</p>
<h1>Mobile Phone Use Excuse Form</h1>
<p>The student of ${SCHOOL}: <strong>${escapeHtml(student || 'NAME OF STUDENT')}</strong>, of Year ${escapeHtml(year || 'SCHOOL YEAR')} has hereby been granted access to use their mobile phone in and around the Brake Hall area for the theatre production, managed by the AshTec Crew.</p>
<p>This has been granted to the student by <strong>${escapeHtml(teacher || 'TEACHER NAME')}</strong> on the date: ${escapeHtml(now.toLocaleDateString('en-GB'))} and ${escapeHtml(clock(now))}.</p>
<p>They are permitted to use their phone for the following times:</p>
<p><strong>${escapeHtml(showHeading)}</strong></p>
${lines ? `<ul>${lines}</ul>` : '<p style="color:#777">No rehearsals or performances selected.</p>'}
<p>They are permitted to use their phone for various tools, including but not limited to: accessing the &lsquo;AshTec Crew Management System&rsquo; or Googling various things.</p>
<p>If you have any concerns, please contact ${escapeHtml(teacherEmail || 'TEACHER EMAIL')}.</p>
<p>Many Thanks,<br />AshTec Crew &amp; ${escapeHtml(teacher || 'TEACHER NAME')}</p>
<div class="sig"><p>Signed by ${escapeHtml(teacher || 'TEACHER NAME')}</p><div class="line"></div></div>
<div class="pad-bottom"></div>
<div class="footer">
  Ashford Senior School Bridge Nursery &middot; East Hill, Ashford, Kent, TN24 8PB &middot; Tel: +44 (0) 1233 625171<br />
  Ashford Prep School Stables Nursery &middot; Great Chart, Ashford, Kent, TN23 3DJ &middot; Tel: +44 (0) 1233 620493<br />
  Admissions: Tel +44 (0) 1233 739030 &middot; registrar@ashfordschool.co.uk &middot; www.ashfordschool.co.uk<br />
  Ashford School is a member of United Learning. Registered address: Worldwide House, Thorpe Wood, Peterborough, PE3 6SB. Registered in England No 2780748.<br />
  A company limited by guarantee.
</div>
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

/**
 * Letter for a parent/guardian, generated from real show data + the member's
 * name/year. Ticket 0aaef360:
 *   - explain what AshTec is, that it's optional, but a valuable experience;
 *   - if help is needed, contact Mr Andrews (Head of Drama);
 *   - include the selected performances / rehearsals with dates and times;
 *   - point them at the public calendar at https://ashtec.dino.icu/ but warn
 *     that it may not have every detail.
 *
 * School letterhead and footer are shared with the phone excuse form so the
 * two documents look like they came from the same place.
 *
 * Available to every member (not just admins) - that was the whole point of
 * the ticket: the requester wanted a tool for "all ashtec members".
 */
function ParentInfoLetter() {
  const { me } = useMe();
  const [data, setData] = useState<GetMyEventsOutputType | null>(null);
  const reload = useCallback(async () => setData(await getMyEvents({})), []);
  useEffect(() => { reload(); }, [reload]);
  const [showId, setShowId] = useState<string>('');
  const [recipient, setRecipient] = useState('Dear Parent / Guardian,');
  const [student, setStudent] = useState(`${me.firstName} ${me.lastName}`.trim());
  const [year, setYear] = useState(me.year || '');
  const [logo, setLogo] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/ashford-logo.jpeg')
      .then((r) => r.blob())
      .then((b) => new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = rej;
        fr.readAsDataURL(b);
      }))
      .then((d) => { if (alive) setLogo(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!data) return;
    if (data.shows.length && !showId) setShowId(data.shows[0].id);
  }, [data, showId]);

  // All hooks are declared above the early return so the count stays
  // identical on every render. Tickets previously got React #310 here
  // (Rendered more hooks than during the previous render) when this
  // useMemo lived below the `if (!data) return ...` guard.
  const events = useMemo(() => {
    if (!data) return [] as GetMyEventsOutputType['subEvents'];
    if (showId === 'all') {
      return [...data.subEvents].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    }
    return data.subEvents
      .filter((e) => e.showIds.includes(showId))
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  }, [data, showId]);

  if (!data) return <div className="h-64 rounded-2xl border bg-card animate-pulse" />;

  const showName = (id: string) => data.shows.find((s) => s.id === id)?.name ?? '';
  const showDescription = (id: string) => data.shows.find((s) => s.id === id)?.description ?? '';

  const eventTime = (e: { startTime?: string | null; endTime?: string | null; meetTime?: string }): string => {
    const range = formatEventTimeRange(e.startTime ?? null, e.endTime ?? null);
    return range || e.meetTime?.trim() || '';
  };

  const documentHtml = () => {
    const today = new Date();
    const groups = [
      { title: 'Performances', list: events.filter((e) => e.type === 'Performance') },
      { title: 'Rehearsals', list: events.filter((e) => e.type === 'Rehearsal') },
    ].filter((g) => g.list.length);

    const groupsHtml = groups.length
      ? groups.map((g) => `
        <h2 style="font-size:13pt;margin:18px 0 6px">${escapeHtml(g.title)}</h2>
        <ul>${g.list.map((e) => {
          const t = eventTime(e);
          return `<li>${escapeHtml(e.title)} &ndash; ${escapeHtml(longDate(e.date))}${t ? `, ${escapeHtml(t)}` : ''}</li>`;
        }).join('')}</ul>
      `).join('')
      : '<p style="color:#777">No rehearsals or performances have been scheduled for this production yet. Please check back later.</p>';

    const heading = showId === 'all' ? 'All productions' : showName(showId);
    const intro = showId === 'all'
      ? `Your child is part of the crew for the productions organised by AshTec this term.`
      : `Your child is part of the crew for <strong>${escapeHtml(showName(showId))}</strong>.`;

    const description = showId === 'all' ? '' : `<p>${escapeHtml(showDescription(showId))}</p>`;

    const logoSrc = logo || '/ashford-logo.jpeg';

    return `<!doctype html><html><head><meta charset="utf-8"><title>AshTec Crew - Parent Information</title>
<style>
  @page { size: A4; margin: 22mm 18mm 30mm; }
  body{font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#000;line-height:1.4;margin:0}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #999;padding-bottom:8px}
  .header img{height:54px;width:auto}
  .schools{font-size:8pt;color:#333;text-align:right;line-height:1.35}
  .date{color:#555;font-size:9pt;margin-top:14px}
  h1{font-size:15pt;margin:18px 0 12px;text-align:center}
  h2{font-size:13pt;margin:18px 0 6px}
  p{margin:0 0 11px}
  ul{margin:0 0 11px;padding-left:22px}
  li{margin:2px 0}
  .signoff{margin-top:22px}
  .cal{background:#faf5ec;border:1px solid #d9c89c;border-radius:8px;padding:10px 12px;margin:14px 0;font-size:10.5pt}
  .cal a{color:#0b3a73}
  .note{background:#f5f5f5;border-left:3px solid #999;padding:10px 12px;margin:14px 0;font-size:10.5pt}
  .contact{margin-top:14px;font-size:10.5pt}
  .footer{font-size:8pt;color:#444;border-top:1px solid #ccc;padding-top:8px;line-height:1.45}
  @media print{
    .header{position:fixed;top:0;left:0;right:0;background:#fff}
    .footer{position:fixed;bottom:0;left:0;right:0;background:#fff}
    .pad-top{height:74px}.pad-bottom{height:104px}
  }
</style></head><body>
<div class="header">
  <img src="${logoSrc}" alt="Ashford School" />
  <div class="schools">Senior School<br />Prep School &middot; Bridge Nursery &middot; Stables Nursery</div>
</div>
<div class="pad-top"></div>
<p class="date">${escapeHtml(today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p>
<p>${escapeHtml(recipient || 'Dear Parent / Guardian,')}</p>
<h1>AshTec Crew &ndash; Parent Information</h1>
<p>${intro}</p>
${description}
<p>${SCHOOL}&rsquo;s AshTec Crew is the technical theatre team that runs the school&rsquo;s productions &mdash; lighting, sound, staging, and the support that the performers, directors and audiences never see but cannot do without. ${escapeHtml(student || 'Your child')} is part of that crew and would like to share what is coming up.</p>
<p><strong>Participation is voluntary.</strong> Every student is welcome to come to as much or as little as their school work and energy allows. The productions are an incredible experience: students learn what really goes into a theatre show, work alongside older pupils and teachers, and end up with a generous line on their creative CV.</p>
<h2>${escapeHtml(heading)}</h2>
${groupsHtml}
<p>The dates and start times above are the current school plan. We will confirm every rehearsal and performance with ${escapeHtml(student || 'your child')} (and you, where helpful) closer to the time. Where a date is not yet final, you will see &ldquo;Date TBC&rdquo;.</p>

<div class="cal">
  <p style="margin:0 0 6px"><strong>Public calendar</strong></p>
  <p style="margin:0">You can see every rehearsal and performance AshTec is involved in at <a href="https://ashtec.dino.icu/">https://ashtec.dino.icu/</a> &ndash; click <em>Public calendar</em>. Please note that the public calendar lists dates and times only; full details such as what to bring, response deadlines and member-only arrangements stay behind the sign-in pages and are not visible there.</p>
</div>

<p>If your child needs any help, or if you have a question about the production, please contact <strong>Mr Andrews</strong>, Head of Drama at the school. He oversees the productions and is the right person to talk to first.</p>

<p class="note">If ${escapeHtml(student || 'your child')} is unable to attend a specific rehearsal or performance, please let a crew admin know as far in advance as possible so the running order can be planned around it. A quick note through the AshTec crew system is the easiest way.</p>

<p class="contact">A copy of this letter is held on the AshTec Crew Hub. The information above is taken from the same source the stage manager uses, so anything you see here is what has been confirmed to the school team.</p>

<p class="signoff">With thanks,<br />The AshTec Crew at ${SCHOOL}</p>

<div class="pad-bottom"></div>
<div class="footer">
  Ashford Senior School Bridge Nursery &middot; East Hill, Ashford, Kent, TN24 8PB &middot; Tel: +44 (0) 1233 625171<br />
  Ashford Prep School Stables Nursery &middot; Great Chart, Ashford, Kent, TN23 3DJ &middot; Tel: +44 (0) 1233 620493<br />
  Admissions: Tel +44 (0) 1233 739030 &middot; registrar@ashfordschool.co.uk &middot; www.ashfordschool.co.uk<br />
  Ashford School is a member of United Learning. Registered address: Worldwide House, Thorpe Wood, Peterborough, PE3 6SB. Registered in England No 2780748.<br />
  A company limited by guarantee.
</div>
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
    const blob = new Blob(['\ufeff', documentHtml()], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AshTec - Parent Info - ${(student || 'student').replace(/[^\w -]/g, '')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const valid = student.trim() && year.trim() && !!showId && events.length > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Parent / guardian information letter</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate a one-page letter for a parent or guardian explaining what AshTec is, what is coming up for the
          selected production, and how to reach the school. Pick the production, fill in your name and year, then
          print or download.
        </p>

        {data.shows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">
            No shows are available to write a letter about yet. Come back once at least one production has been
            added.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium">Production</label>
              <Select value={showId} onValueChange={setShowId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All productions I am in</SelectItem>
                  {data.shows.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium">Salutation</label>
                <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Dear Parent / Guardian," />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Your full name</label>
                <Input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Full name for the letter" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Year</label>
                <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. Year 10" />
              </div>
            </div>

            {!valid && (
              <p className="text-xs text-muted-foreground">Pick a production and fill in your name and year to enable the letter.</p>
            )}

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button disabled={!valid} onClick={printDoc}>
                <Printer className="mr-2 h-4 w-4" />Print / Save as PDF
              </Button>
              <Button variant="outline" disabled={!valid} onClick={downloadDoc}>
                <FileDown className="mr-2 h-4 w-4" />Download .doc
              </Button>
            </div>
          </>
        )}
      </div>

      {events.length > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Preview</h3>
          <iframe title="Preview" srcDoc={documentHtml()} className="h-[640px] w-full rounded-xl border bg-white" />
        </div>
      )}
    </div>
  );
}

export default function Tools() {
  const { me } = useMe();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Wrench className="h-6 w-6 text-primary" />Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">Handy extras for the crew.</p>
      </div>
      <ParentInfoLetter />
      {me.isAdmin && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin tools</span>
            <span className="flex-1 border-t border-dashed" />
          </div>
          <PhoneExcuseForm />
        </div>
      )}
    </div>
  );
}
