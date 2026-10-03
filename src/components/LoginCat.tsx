import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LINES = [
  'Meow!',
  'Did you forget your password? Oh wait…',
  'Check your inbox 📬',
  'I run the lighting desk.',
  'Purr… break a leg!',
  'Feed me cues.',
  'Hiss! (just kidding)',
  '*knocks mic off stand*',
];

/** The crew cat. Watches your cursor, jumps when poked, naps when ignored. */
export default function LoginCat() {
  const ref = useRef<HTMLImageElement>(null);
  const [lean, setLean] = useState({ x: 0, y: 0 });
  const [say, setSay] = useState<string | null>(null);
  const [jump, setJump] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const idle = useRef<number>();

  useEffect(() => {
    const wake = () => {
      setAsleep(false);
      clearTimeout(idle.current);
      idle.current = window.setTimeout(() => setAsleep(true), 12000);
    };
    const move = (e: PointerEvent) => {
      wake();
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      setLean({ x: (dx / d) * 6, y: (dy / d) * 4 });
    };
    wake();
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      clearTimeout(idle.current);
    };
  }, []);

  const poke = () => {
    setAsleep(false);
    setJump((j) => j + 1);
    setSay(LINES[Math.floor(Math.random() * LINES.length)]);
    window.setTimeout(() => setSay(null), 2500);
  };

  return (
    <div className="fixed bottom-2 left-3 z-40 select-none">
      <AnimatePresence>
        {(say || asleep) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full left-10 mb-1 whitespace-nowrap rounded-xl border bg-card px-3 py-1.5 text-xs shadow-lg"
          >
            {say ?? 'Zzz…'}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.img
        ref={ref}
        key={jump}
        src="/cat.png"
        alt="The crew cat. Click it!"
        onClick={poke}
        width={84}
        height={87}
        className="cursor-pointer"
        animate={
          jump
            ? { y: [0, -30, 0, -8, 0], rotate: [0, -7, 5, 0] }
            : asleep
              ? { rotate: [0, 3, 0], scale: [1, 0.99, 1] }
              : { rotate: lean.x, y: [0, -2, 0] }
        }
        transition={
          jump
            ? { duration: 0.7 }
            : asleep
              ? { rotate: { repeat: Infinity, duration: 3.4 }, scale: { repeat: Infinity, duration: 3.4 } }
              : { rotate: { type: 'spring', stiffness: 120, damping: 12 }, y: { repeat: Infinity, duration: 4 } }
        }
        draggable={false}
      />
    </div>
  );
}
