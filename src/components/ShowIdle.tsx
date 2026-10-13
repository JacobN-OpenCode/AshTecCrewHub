import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * What the live-show screen shows while no show is running: just the crew cat
 * and a rotating line. Deliberately nothing else - no board, no scenes, no PIN -
 * so a screen left on in the hall is calm until a show actually starts.
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
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 text-center">
      <motion.img
        src="/cat.png"
        alt="The crew cat, waiting for the show"
        width={140}
        height={145}
        draggable={false}
        animate={reduce ? undefined : { y: [0, -12, 0], rotate: [0, 2, -2, 0] }}
        transition={reduce ? undefined : { y: { repeat: Infinity, duration: 4, ease: 'easeInOut' }, rotate: { repeat: Infinity, duration: 6, ease: 'easeInOut' } }}
        className="drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
      />
      <div className="h-8">
        <AnimatePresence mode="wait">
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="text-lg md:text-2xl font-medium text-[#c9d1d9]"
          >
            {LINES[line]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
