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
  timings?: string;
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

/** "18:30" -> 183000. Falls back to the first HH:MM inside a longer string, because
 *  meetTime in the data is free text and often reads "GO TO REGISTRATION, THEN
 *  BRAKE HALL AT 8:40". Anything with no time in it becomes an all-day event. */
function timeValue(meetTime: string): string | null {
  const strict = /^(\d{1,2}):(\d{2})$/.exec(meetTime.trim());
  const m = strict ?? /(\d{1,2}):(\d{2})/.exec(meetTime);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}${pad(min)}00`;
}

/** Start plus one hour, saturating at 23:59 rather than rolling into the next
 *  day - a DTEND dated later than DTSTART confuses importers more than an
 *  event that is a minute short. */
function endFrom(start: string): string {
  const h = Number(start.slice(0, 2));
  const min = Number(start.slice(2, 4));
  const total = Math.min(h * 60 + min + 60, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}${pad(total % 60)}00`;
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
    const start = e.meetTime ? timeValue(e.meetTime) : null;
    const shows = showIdsOf(e).map(showName).filter(Boolean).join(', ');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@ashtec`,
      // DTSTAMP is required by the spec even for a generated file.
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    );

    if (start) {
      // Timed event. We do not know when it ends, so it gets a default hour:
      // better that than an all-day block that hides the meet time entirely.
      lines.push(`DTSTART;TZID=Europe/London:${day}T${start}`, `DTEND;TZID=Europe/London:${day}T${endFrom(start)}`);
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
