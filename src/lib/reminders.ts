// Pure logic shared by frontend and backend: which forms a member still needs to complete.
export type RShow = { id: string; name: string; dueDate: string | null; dueUnknown: boolean; hidden?: boolean };
export type RSub = { id: string; title: string; showIds: string[]; dueDate: string | null; dueUnknown: boolean; date: string | null; dateTbc: boolean; hidden?: boolean };
export type RResp = { memberId: string; showId: string; response: string };
export type RAtt = { memberId: string; subEventId: string; status: string };
export type PendingForm = { kind: 'show' | 'event'; id: string; title: string; showIds: string[]; dueDate: string; maybe: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const hasDue = (d: string | null, u: boolean) => !u && !!d && d >= today();

export function pendingForms(memberId: string, d: { shows: RShow[]; subEvents: RSub[]; responses: RResp[]; attendance: RAtt[] }): PendingForm[] {
  const resp = new Map(d.responses.filter((r) => r.memberId === memberId).map((r) => [r.showId, r.response]));
  const att = new Map(d.attendance.filter((a) => a.memberId === memberId).map((a) => [a.subEventId, a.status]));
  const out: PendingForm[] = [];
  // Hidden shows and events are invisible to members, so they must never
  // produce a form for someone to complete.
  for (const s of d.shows) {
    if (s.hidden) continue;
    const r = resp.get(s.id);
    if (hasDue(s.dueDate, s.dueUnknown) && (!r || r === 'Maybe'))
      out.push({ kind: 'show', id: s.id, title: s.name, showIds: [s.id], dueDate: s.dueDate!, maybe: r === 'Maybe' });
  }
  for (const e of d.subEvents) {
    if (e.hidden) continue;
    const inShow = e.showIds.some((id) => ['Yes', 'Maybe'].includes(resp.get(id) ?? ''));
    const st = att.get(e.id);
    if (inShow && hasDue(e.dueDate, e.dueUnknown) && (!st || st === 'Maybe'))
      out.push({ kind: 'event', id: e.id, title: e.title, showIds: e.showIds, dueDate: e.dueDate!, maybe: st === 'Maybe' });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
