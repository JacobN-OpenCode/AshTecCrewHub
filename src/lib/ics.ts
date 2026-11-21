/**
 * Client-side .ics helper: the pure builder (see icsBuild.ts) plus a browser
 * download. The builder is shared with the server, which serves the subscribe
 * feed; this file adds the DOM-only download and must not be imported server-side.
 */

export { buildIcs } from './icsBuild';
export type { IcsEvent } from './icsBuild';

/** Hands the browser a download of the built calendar. */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
