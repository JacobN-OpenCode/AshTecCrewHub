/**
 * Pure .ics building, shared by the browser (download button) and the server
 * (subscribe feed).
 *
 * Kept separate from ics.ts because that file's download helper uses `document`,
 * and the server build has no DOM lib - importing it there broke the typecheck.
 * Nothing here touches the DOM.
 */

export type IcsEvent = {
  id: string;
  title: string;
  type: string;
  subtype?: string;
  date: string | null;
  dateTbc: boolean;
  meetTime?: string;
  /** mapSubEvent calls this showIds; raw table records call it shows. Accept
   *  either so a shape mismatch cannot crash the download button. */
  showIds?: string[];
  shows?: unknown;
  hidden: boolean;
  /** Structured start/end (HH:MM, 24h). Both, neither, or only one - the
   *  rules below decide what the calendar actually publishes. */
  startTime?: string | null;
  endTime?: string | null;
};

/** Ids of the shows an event belongs to, from either field name. */
const showIdsOf = (e: IcsEvent): string[] => {
  if (Array.isArray(e.showIds)) return e.showIds;
  if (!Array.isArray(e.shows)) return [];
  const out: string[] = [];
  for (const v of e.shows) {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
      out.push((v as { id: string }).id);
    }
  }
  return out;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYYMMDD, local calendar date, no timezone suffix: an all-day event. */
const stamp = (iso: string) => iso.replace(/-/g, '');

/** Escapes the characters RFC 5545 requires, and strips newlines. */
const esc = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

const hhmmToIcs = (s: string): string | null => {
  const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}${pad(min)}00`;
};

/** Defensive HH:MM parser for the legacy free-text fallback (text drawn from
 *  meetTime or a leftover timings string in case something slipped past). */
function timeValueLoose(s: string): string | null {
  const strict = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  const m = strict ?? /(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}${pad(min)}00`;
}

/**
 * Renders a "Wed 8 Oct, 19:00 – 21:00" string for member-facing event lists
 * (and printable forms), driven by the same structured fields the calendar
 * uses. Either time may be missing on its own.
 */
export function formatEventTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '';
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} (ends TBC)`;
  return `ends ${end}`;
}

/** Start plus one hour, saturating at 23:59 rather than rolling into the next
 *  day - a DTEND dated later than DTSTART confuses importers more than an
 *  event that is a minute short. */
function defaultEnd(start: string): string {
  const h = Number(start.slice(0, 2));
  const min = Number(start.slice(2, 4));
  const total = Math.min(h * 60 + min + 60, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}${pad(total % 60)}00`;
}

/** Earlier than the start time (or equal): the calendar app ends up confused.
 *  Clamps to the start time so at worst it ends when it starts - the admin
 *  can fix the data. */
function clampEnd(end: string, start: string): string {
  if (end >= start) return end;
  return start;
}

/**
 * Ticket 255054a8 / 65aaf306: "iCal 1 hour early" and "invalid token" on import.
 *
 * We used to write `DTSTART;TZID=Europe/London:...` with no VTIMEZONE block.
 * A client that cannot resolve the timezone id falls back to UTC, so every BST
 * event landed an hour early, and Google Calendar rejected the feed outright.
 * Rather than ship a VTIMEZONE table that has to be kept in step with the tz
 * database, convert the London wall time to UTC here and publish plain `...Z`
 * stamps, which every client understands.
 */
const LONDON = 'Europe/London';

/** Minutes London is ahead of UTC at a given instant (0 in winter, 60 in BST). */
function londonOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asIfUtc - utcMs) / 60000);
}

/** `YYYYMMDD` + `HHMMSS` London wall time -> `YYYYMMDDTHHMMSSZ` UTC stamp. */
function utcStamp(day: string, hhmmss: string): string {
  const wall = Date.UTC(
    Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)),
    Number(hhmmss.slice(0, 2)), Number(hhmmss.slice(2, 4)), Number(hhmmss.slice(4, 6)),
  );
  // Two passes: the offset at the corrected instant can differ from the offset
  // at the naive one when the time sits on a DST boundary.
  let ms = wall - londonOffsetMinutes(wall) * 60000;
  ms = wall - londonOffsetMinutes(ms) * 60000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const fold = (line: string) => {
  // RFC 5545 caps content lines at 75 octets, continuations start with a space.
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return parts.join('\r\n');
};

export function buildIcs(events: IcsEvent[], showName: (id: string) => string, calendarName: string): string {
  const usable = events
    .filter((e) => !e.hidden && !!e.date && !e.dateTbc)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AshTec//Crew Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];

  for (const e of usable) {
    const day = stamp(e.date as string);
    const shows = showIdsOf(e).map(showName).filter(Boolean).join(', ');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@ashtec`,
      // DTSTAMP is required by the spec even for a generated file.
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    );

    // Precedence for the timed-event block: structured start/end first, then
    // the (now legacy) meetTime text. The structured pair wins when both are
    // present so an admin who has filled in real times is not overridden by a
    // stray "9:45 - Brake Hall" meet time.
    const start = e.startTime ? hhmmToIcs(e.startTime) : null;
    const end = e.endTime ? hhmmToIcs(e.endTime) : null;
    const looseStart = start ?? (e.meetTime ? timeValueLoose(e.meetTime) : null);

    if (start && end) {
      lines.push(
        `DTSTART:${utcStamp(day, start)}`,
        `DTEND:${utcStamp(day, clampEnd(end, start))}`,
      );
    } else if (start) {
      // Start but no end: default to +1h so the calendar shows a sensible
      // block rather than an all-day marker.
      lines.push(`DTSTART:${utcStamp(day, start)}`, `DTEND:${utcStamp(day, defaultEnd(start))}`);
    } else if (looseStart) {
      // Legacy meet time fallback for events that never had structured times.
      lines.push(`DTSTART:${utcStamp(day, looseStart)}`, `DTEND:${utcStamp(day, defaultEnd(looseStart))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${day}`);
    }

    lines.push(`SUMMARY:${esc([e.title, shows].filter(Boolean).join(' - '))}`);
    if (e.subtype || e.type) lines.push(`DESCRIPTION:${esc(e.subtype || e.type)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}
