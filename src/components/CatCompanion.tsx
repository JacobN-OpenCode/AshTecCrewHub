import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cat, X } from 'lucide-react';
import { MASCOT } from '../lib/mascot';
import { useCatHidden } from '../lib/uiPrefs';
import { playSfx } from '../lib/sfx';

/**
 * The crew cat, out of the feedback forms and onto every page (Batch 8).
 *
 * It sits quietly in the corner and now and then says something, which is the
 * whole of "more of the cat". It can be hidden for good (per device) and stays
 * out of the way of the mobile tab bar. Clicking it opens the mascot page.
 */
export default function CatCompanion() {
  const [hidden, setHidden] = useCatHidden();
  const [line, setLine] = useState<string | null>(null);
  const navigate = useNavigate();

  // Say something shortly after arriving, then keep it to a slow rotation so it
  // is company rather than noise.
  useEffect(() => {
    if (hidden) return;
    const show = () => setLine(MASCOT.line());
    const first = window.setTimeout(show, 6000);
    const hide = window.setTimeout(() => setLine(null), 16000);
    const loop = window.setInterval(() => { show(); window.setTimeout(() => setLine(null), 10000); }, 45000);
    return () => { window.clearTimeout(first); window.clearTimeout(hide); window.clearInterval(loop); };
  }, [hidden]);

  if (hidden) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 flex items-end gap-2 lg:bottom-5">
      <AnimatePresence>
        {line && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            className="mb-2 max-w-[220px] rounded-2xl rounded-br-sm border bg-card px-3 py-2 text-sm shadow-lg"
          >
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Cat className="h-3 w-3" />{MASCOT.name}
            </div>
            {line}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="group flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => { playSfx('pop'); navigate('/mascot'); }}
          title={`${MASCOT.name}, the crew cat`}
          aria-label={`Open the ${MASCOT.name} page`}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <motion.img
            src={MASCOT.image}
            alt=""
            width={56}
            height={58}
            draggable={false}
            animate={{ y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}
            className="h-14 w-14 drop-shadow-lg transition-transform group-hover:scale-105"
          />
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="flex items-center gap-1 rounded-full border bg-card/80 px-2 py-0.5 text-[10px] text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 lg:opacity-100"
          title="Hide the cat on this device"
        >
          <X className="h-3 w-3" />Hide
        </button>
      </div>
    </div>
  );
}
