import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * What the live-show screen shows while no show is running: just the crew cat
 * and a rotating line. Deliberately nothing else - no board, no scenes, no PIN -
 * so a screen left on in the hall is calm until a show actually starts.
 *
 * Styled like the stage it is standing in: a pool of warm light, the pros arch
 * frame, and nothing that looks like a button (there is nothing to press).
 */

const LINES = [
  'Waiting for the show to start…',
  'Break a leg. Or don’t, you need both.',
  'I run the lighting desk.',
  'Feed me cues.',
  'Break a leg! (I’m the understudy.)',
  '*knocks a mic off the stand*',
  'Hiss! Just kidding.',
  'Quiet please, we’re about to begin.',
  'The stage is dark. For now.',
  'Meow. That’s showbiz.',
];

export default function ShowIdle() {
  const reduce = useReducedMotion();
  const [line, setLine] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setLine((n) => (n + 1) % LINES.length), 8000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-6 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 85% at 50% -25%, #241b21 0%, #141016 45%, #07060a 100%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[26px] border border-[#f3ece1]/10 md:inset-5 md:rounded-[34px]" />

      <div className="relative flex flex-col items-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.5em] text-[#7e7a86]">AshTec crew</p>
        <div className="mt-3 h-px w-16 bg-[#d9ab6c]/50" />
        <motion.img
          src="/cat.png"
          alt="The crew cat, waiting for the show"
          width={140}
          height={145}
          draggable={false}
          animate={reduce ? undefined : { y: [0, -12, 0], rotate: [0, 2, -2, 0] }}
          transition={reduce ? undefined : { y: { repeat: Infinity, duration: 4, ease: 'easeInOut' }, rotate: { repeat: Infinity, duration: 6, ease: 'easeInOut' } }}
          className="mt-6 drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
        />
        <div className="mt-6 h-10">
          <AnimatePresence mode="wait">
            <motion.p
              key={line}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="text-lg font-medium text-[#c9c2ce] md:text-2xl"
            >
              {LINES[line]}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.35em] text-[#4f4b56]">This screen wakes up when the show starts</p>
      </div>
    </div>
  );
}
