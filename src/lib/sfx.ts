/**
 * Silly sound effects (Batch 8).
 *
 * There are no audio files: every sound is a couple of oscillators built on the
 * spot with the Web Audio API, so nothing extra ships over the wire and nothing
 * is cached. Sounds only ever fire on a deliberate action (you pressed send, you
 * posted, a badge landed), never on page load, and the whole thing has a mute
 * switch a member controls per device.
 *
 * A muted member is not merely silenced: playSfx()/playNote() return before
 * touching the audio context, so a muted device never even spins one up.
 */

import { useEffect, useState } from 'react';

const MUTE_KEY = 'ashtec-sfx-muted';

export type SfxName =
  | 'success'   // something saved
  | 'send'      // a message went out
  | 'pop'       // a small toggle
  | 'badge'     // an achievement landed
  | 'error';    // something refused

let ctx: AudioContext | null = null;

/** Lazily create the audio context; must be called from a user gesture. */
function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  // Browsers start the context suspended until a gesture; nudge it awake.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isSfxMuted(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setSfxMuted(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
  window.dispatchEvent(new Event('ashtec-sfx-change'));
}

/** A single oscillator note with a soft attack/decay envelope. */
function playNote(freq: number, start: number, duration: number, type: OscillatorType, gain: number): void {
  const ac = context();
  if (!ac) return;
  const at = ac.currentTime + start;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

const RECIPES: Record<SfxName, () => void> = {
  // Rising two-note chime.
  success: () => { playNote(660, 0, 0.16, 'triangle', 0.14); playNote(880, 0.1, 0.22, 'triangle', 0.12); },
  // A little whoosh: quick downward blip.
  send: () => { playNote(520, 0, 0.12, 'sine', 0.12); playNote(780, 0.04, 0.14, 'sine', 0.1); },
  // Tiny click.
  pop: () => { playNote(440, 0, 0.06, 'square', 0.06); },
  // Sparkle: three fast ascending notes.
  badge: () => { playNote(700, 0, 0.12, 'triangle', 0.11); playNote(900, 0.08, 0.12, 'triangle', 0.11); playNote(1180, 0.16, 0.2, 'triangle', 0.1); },
  // Descending buzz.
  error: () => { playNote(220, 0, 0.2, 'sawtooth', 0.08); playNote(160, 0.08, 0.24, 'sawtooth', 0.07); },
};

/** Play a named effect, unless the device is muted. */
export function playSfx(name: SfxName): void {
  if (isSfxMuted()) return;
  try { RECIPES[name]?.(); } catch { /* audio unavailable; stay silent */ }
}

/** React to the mute switch, wherever it is toggled. */
export function useSfxMuted(): [boolean, (muted: boolean) => void] {
  const [muted, setMuted] = useState(isSfxMuted);
  useEffect(() => {
    const onChange = () => setMuted(isSfxMuted());
    window.addEventListener('ashtec-sfx-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('ashtec-sfx-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return [muted, setSfxMuted];
}
