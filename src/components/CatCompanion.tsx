import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cat } from 'lucide-react';
import { MASCOT } from '../lib/mascot';
import { useAppSettings } from '../lib/appSettings';
import { useCatHidden } from '../lib/uiPrefs';
import { playSfx } from '../lib/sfx';

/**
 * The crew cat, out of the feedback forms and onto every page (Batch 8).
 *
 * It sits quietly in the corner and now and then says something, which is the
 * whole of "more of the cat". Feedback round 2: it is desktop-only now (it got
 * in the way on phones) and the Hide button is gone.
 */
export default function CatCompanion() {
  const [hidden] = useCatHidden();
  const { catName } = useAppSettings();
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

  // Ticket 608099ef: on desktop the help button sits bottom-right too, so the
  // cat parks just to its left rather than underneath it (they used to overlap).
  return (
    <div className="fixed bottom-5 right-20 z-40 hidden items-end gap-2 lg:flex">
      <AnimatePresence>
        {line && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            className="mb-2 max-w-[220px] rounded-2xl rounded-br-sm border bg-card px-3 py-2 text-sm shadow-lg"
          >
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Cat className="h-3 w-3" />{catName}
            </div>
            {line}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => { playSfx('pop'); navigate('/mascot'); }}
        title={`${catName}, the crew cat`}
        aria-label={`Open the ${catName} page`}
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
          className="h-14 w-14 drop-shadow-lg transition-transform hover:scale-105"
        />
      </button>
    </div>
  );
}
