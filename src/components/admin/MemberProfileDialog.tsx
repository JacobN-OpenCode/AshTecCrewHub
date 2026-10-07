import { useEffect, useState } from 'react';
import { adminGetMemberDetail, type AdminGetMemberDetailOutputType } from '#api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { Pencil, Shield, Wrench } from 'lucide-react';
import type { AdminData, AdminMember } from '../../lib/useAdminData';
import { fmtDate } from '../../lib/constants';
import RemindButton from './RemindButton';

/**
 * The profile overview shown when an admin clicks a crew row. One lookup call
 * gives the whole picture: what they owe, what they're coming to, what they've
 * attended and checked in for, what we've emailed them and what they've raised.
 * Editing is a click away; the Remind button stays for the outstanding forms.
 */

const AT_STYLE: Record<string, string> = {
  'Expected Arrival': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Maybe: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Not Attending': 'bg-red-500/15 text-red-400 border-red-500/30',
};
const RESP_STYLE: Record<string, string> = {
  Yes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  No: 'bg-red-500/15 text-red-400 border-red-500/30',
  Maybe: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
};
const PRES_STYLE: Record<string, string> = {
  'On Site': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Off Site': 'bg-muted text-muted-foreground border-border',
  'Expected Back': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Not at Venue': 'bg-red-500/15 text-red-400 border-red-500/30',
};

const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const chip = (s?: string | null) =>
  s ? <Badge variant="outline" className={AT_STYLE[s] ?? ''}>{s}</Badge> : null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-muted-foreground">{text}</p>;

export default function MemberProfileDialog({
  member, data, onClose, onEdit,
}: {
  member: AdminMember | null;
  data: AdminData;
  onClose: () => void;
  onEdit: (m: AdminMember, preview?: boolean) => void;
}) {
  const [body, setBody] = useState<AdminGetMemberDetailOutputType | null>(null);

  useEffect(() => {
    if (!member) return;
    let live = true;
    setBody(null);
    adminGetMemberDetail({ memberId: member.id })
      .then((d) => { if (live) setBody(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [member]);

  const m = body?.member ?? member;
  const detail = body;

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        {!detail ? (
          <div className="space-y-4">
            <DialogHeader><DialogTitle>{m?.firstName} {m?.lastName}</DialogTitle></DialogHeader>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {detail.member.firstName} {detail.member.lastName}
                {detail.member.isAdmin && <Shield className="h-4 w-4 text-primary" />}
                {detail.member.isMaintainer && <Wrench className="h-4 w-4 text-primary" />}
                {detail.member.isPreview && <Badge className="bg-primary/20 text-primary border-primary/30" variant="outline">Preview</Badge>}
                {detail.isStaff && <Badge variant="outline">Staff</Badge>}
                <Badge variant="outline">{detail.member.memberType}</Badge>
                {detail.member.year && <span className="text-sm font-normal text-muted-foreground">{detail.member.year}</span>}
              </DialogTitle>
              <p className="text-muted-foreground">@{detail.member.shortUsername} · {detail.member.email}</p>
            </DialogHeader>

            <div className="space-y-5">
              {!detail.isStaff && (
                <>
                  <Section title={detail.outstanding > 0 ? `Forms owed (${detail.outstanding})` : 'Forms owed'}>
                    {detail.outstanding > 0
                      ? <p className="text-sm">Respond by dates are set against each show/event below; the reply needs the member's own answer.</p>
                      : <Empty text="Nothing outstanding." />}
                  </Section>

                  <Section title="Upcoming shows & events">
                    {detail.upcoming.length === 0 && <Empty text="No upcoming events." />}
                    <ul className="space-y-2">
                      {detail.upcoming.map((e) => (
                        <li key={e.id} className="rounded-xl border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">{e.title}</span>
                            {chip(e.status)}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {fmtDate(e.date, e.dateTbc)}{e.startTime ? ` · ${e.startTime}${e.endTime ? '–' + e.endTime : ''}` : ''}
                            </span>
                          </div>
                          {e.shows.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {e.shows.map((s) => (
                                <Badge key={s.id} variant="outline" className={RESP_STYLE[s.response ?? ''] ?? ''}>{s.name}: {s.response ?? 'no reply'}</Badge>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Section>

                  <Section title="Past shows">
                    {detail.shows.filter((s) => s.isPast).length === 0 && <Empty text="None yet." />}
                    <ul className="space-y-1.5">
                      {detail.shows.filter((s) => s.isPast).map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{s.name}</span>
                          {s.code && <span className="text-xs text-muted-foreground">{s.code}</span>}
                          <Badge variant="outline" className={RESP_STYLE[s.response ?? ''] ?? ''}>took part: {s.response ?? 'no reply'}</Badge>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  <Section title="Past events">
                    {detail.pastEvents.length === 0 && <Empty text="None yet." />}
                    <ul className="space-y-1.5">
                      {detail.pastEvents.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{e.title}</span>
                          <span className="text-xs text-muted-foreground">{fmtDate(e.date)}</span>
                          {chip(e.status)}
                        </li>
                      ))}
                    </ul>
                  </Section>
                </>
              )}

              <Section title="Check-in history">
                {detail.checkIns.length === 0 && <Empty text="Never checked in." />}
                <ul className="space-y-1.5">
                  {detail.checkIns.map((c, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-sm rounded-xl border p-2.5">
                      <Badge variant="outline" className={PRES_STYLE[c.state ?? ''] ?? ''}>{c.state ?? '—'}</Badge>
                      <span className="font-medium">{c.sessionTitle}</span>
                      {c.date && <span className="text-xs text-muted-foreground">{fmtDate(c.date)}</span>}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {dt(c.signedInAt)}{c.signedOutAt ? ` → ${dt(c.signedOutAt)}` : ''}
                        {c.reasonLabel ? ` · ${c.reasonLabel}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {detail.timeline.length > 0 && (
                  <ul className="space-y-1">
                    {detail.timeline.map((t, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <span className="text-foreground">{t.action}</span> {t.sessionTitle ? `at ${t.sessionTitle}` : ''}
                        {t.byName ? ` by ${t.byName}` : ''} · {dt(t.at)}
                        {t.reasonLabel ? ` (${t.reasonLabel})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Emails sent">
                {detail.emails.length === 0 && <Empty text="Nothing sent yet." />}
                <ul className="space-y-1">
                  {detail.emails.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-medium truncate">{e.subject}</span>
                      {e.purpose && <Badge variant="secondary" className="shrink-0">{e.purpose}</Badge>}
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{dt(e.sentAt)}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              {!detail.isStaff && (
                <Section title="Tickets raised">
                  {detail.tickets.length === 0 && <Empty text="None." />}
                  <ul className="space-y-1">
                    {detail.tickets.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span className="font-medium truncate">{t.subject}</span>
                        <Badge variant="outline" className="shrink-0">{t.status}</Badge>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>

            <DialogFooter className="gap-2">
              {!detail.isStaff && <RemindButton memberId={detail.member.id} data={data} />}
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => onEdit(detail.member)}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}