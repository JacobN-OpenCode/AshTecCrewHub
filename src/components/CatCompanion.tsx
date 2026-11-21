import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cat, X } from 'lucide-react';
import { MASCOT } from '../lib/mascot';
import { useAppSettings } from '../lib/appSettings';
import { useCatHidden } from '../lib/uiPrefs';
import { playSfx } from '../lib/sfx';
import { hitsCat, nextSnack, pageBox, type Snack } from '../lib/catSnack';
import { SnackIcon } from './CatFood';

/**
 * The crew cat, out of the feedback forms and onto every page (Batch 8).
 *
 * It sits quietly in the corner and now and then says something, which is the
 * whole of "more of the cat". Feedback round 2: it is desktop-only now (it got
 * in the way on phones) and the Hide button is gone. Five quick taps decapitate
 * it and silence it, which is ticket f009cd42's other way out. Ticket b646901e
 * put an x on the bubble itself, for people who want a message gone but the cat
 * to stay.
 */
export default function CatCompanion() {
  const [hidden, setCatHidden] = useCatHidden();
  const { catName } = useAppSettings();
  const [line, setLine] = useState<string | null>(null);
  /**
   * Ticket b646901e: J Moore wanted the x on the message rather than the switch
   * that silences the cat for good. This is the softer half of that: close the
   * bubble you are looking at and it stops talking for the rest of the visit,
   * with no setting changed. A reload brings it back, and the switch on My
   * settings is still the permanent one.
   */
  const [quiet, setQuiet] = useState(false);
  const navigate = useNavigate();

  /**
   * Ticket f009cd42: five quick taps and the cat loses its head, which is also
   * the second way to silence it (the switch on the cat page is the first).
   *
   * Taps are timed rather than counted so a slow double tap is just a click, and
   * the trip to the cat page waits a moment so five fast taps never navigate
   * halfway through the fifth.
   */
  const taps = useRef<number[]>([]);
  const goTimer = useRef<number | null>(null);
  const [chopped, setChopped] = useState(false);

  /**
   * Ticket f3260834: J So asked for a snack you can drag onto the cat, after
   * which it eats it and says "yummy". A burger or steak sits in the corner next
   * to the cat; drop it on the cat (or click it, which is the keyboard and touch
   * way) and it is gone, chewed, with a "Yummy" in the bubble, and a different
   * one turns up a few seconds later.
   */
  const [meal, setMeal] = useState<Snack | null>(() => nextSnack(null));
  const [eating, setEating] = useState(false);
  const eatTimers = useRef<number[]>([]);
  const catRef = useRef<HTMLButtonElement | null>(null);

  // A page that unmounts mid-chew should not leave a timer running.
  useEffect(() => () => { eatTimers.current.forEach((t) => window.clearTimeout(t)); }, []);

  function feed() {
    if (!meal || eating) return;
    const eaten = meal;
    // Cleared straight away, so the same snack cannot be eaten twice.
    setMeal(null);
    setEating(true);
    playSfx('nom');
    setLine(eaten.line);
    eatTimers.current.push(
      window.setTimeout(() => setEating(false), 950),
      window.setTimeout(() => setMeal(nextSnack(eaten.id)), 2800),
    );
  }

  /** framer-motion ends a drag in page coordinates; the cat's box is in viewport ones. */
  function droppedAt(point: { x: number; y: number }) {
    const cat = catRef.current;
    if (!cat) return;
    const box = pageBox(cat.getBoundingClientRect(), { x: window.scrollX, y: window.scrollY });
    if (hitsCat(point, box)) feed();
  }

  function chop() {
    taps.current = [];
    if (goTimer.current) { window.clearTimeout(goTimer.current); goTimer.current = null; }
    playSfx('error');
    setChopped(true);
    setLine('...ow.');
    window.setTimeout(() => setCatHidden(true), 1500);
  }

  function tap() {
    if (chopped) return;
    const now = Date.now();
    // The window is generous enough to survive five real taps, short enough
    // that idle clicking on the cat does not eventually kill it.
    taps.current = [...taps.current, now].filter((t) => now - t < 1800);
    if (taps.current.length >= 5) { chop(); return; }
    playSfx('pop');
    if (goTimer.current) window.clearTimeout(goTimer.current);
    goTimer.current = window.setTimeout(() => navigate('/mascot'), 340);
  }

  // A fresh page load should always bring back a head, if the cat is around.
  useEffect(() => { if (!hidden) setChopped(false); }, [hidden]);

  // Say something shortly after arriving, then keep it to a slow rotation so it
  // is company rather than noise.
  useEffect(() => {
    if (hidden || quiet) return;
    const show = () => setLine(MASCOT.line());
    const first = window.setTimeout(show, 6000);
    const hide = window.setTimeout(() => setLine(null), 16000);
    const loop = window.setInterval(() => { show(); window.setTimeout(() => setLine(null), 10000); }, 45000);
    return () => { window.clearTimeout(first); window.clearTimeout(hide); window.clearInterval(loop); };
  }, [hidden, quiet]);

  if (hidden) return null;

  // Ticket 608099ef: on desktop the help button sits bottom-right too, so the
  // cat parks just to its left rather than underneath it (they used to overlap).
  return (
    // The snack and the bubble are positioned around the cat rather than sitting
    // in the row with it: as row items, a bubble appearing shoved the snack a
    // couple of hundred pixels sideways, which made it a moving target to drag.
    <div className="fixed bottom-5 right-20 z-40 hidden h-14 w-14 lg:block">
      <AnimatePresence>
        {meal && (
          <motion.button
            type="button"
            key={meal.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.25 }}
            drag
            dragSnapToOrigin
            dragMomentum={false}
            whileDrag={{ scale: 1.2, cursor: 'grabbing' }}
            onDragEnd={(_event, info) => droppedAt(info.point)}
            onClick={feed}
            title={`Drag ${meal.label} onto ${catName}`}
            aria-label={`Feed ${catName} ${meal.label}`}
            className="absolute bottom-1.5 right-[calc(100%+6px)] z-10 cursor-grab rounded-xl p-0.5 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <SnackIcon id={meal.id} className="h-8 w-8 drop-shadow-md" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {line && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            className="absolute bottom-[calc(100%+6px)] right-0 z-20 w-max max-w-[220px] rounded-2xl rounded-br-sm border bg-card px-3 py-2 text-sm shadow-lg"
          >
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Cat className="h-3 w-3" />{catName}
              <button
                type="button"
                onClick={() => { setQuiet(true); setLine(null); }}
                title="No more messages for now"
                aria-label={`Dismiss the ${catName} message`}
                className="-mr-1.5 ml-auto flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {line}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={catRef}
        type="button"
        onClick={tap}
        title={chopped ? `${catName} has left` : `${catName}, the crew cat`}
        aria-label={chopped ? `${catName} has left` : `Open the ${catName} page`}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {chopped ? (
          // Two halves of one picture: the head slides off one way, the body
          // slumps the other, with a bright line where they parted.
          <span className="relative block h-14 w-14" aria-hidden="true">
            <motion.img
              src={MASCOT.image}
              alt=""
              width={56}
              height={58}
              draggable={false}
              initial={{ y: 0, rotate: 0 }}
              animate={{ y: -16, rotate: -18, opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeIn' }}
              style={{ clipPath: 'inset(0 0 46% 0)' }}
              className="absolute inset-0 h-14 w-14 drop-shadow-lg"
            />
            <motion.img
              src={MASCOT.image}
              alt=""
              width={56}
              height={58}
              draggable={false}
              initial={{ y: 0, rotate: 0 }}
              animate={{ y: 4, rotate: 4, opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeIn', delay: 0.35 }}
              style={{ clipPath: 'inset(46% 0 0 0)' }}
              className="absolute inset-0 h-14 w-14 drop-shadow-lg"
            />
            <motion.span
              initial={{ opacity: 1, scaleX: 0.4 }}
              animate={{ opacity: 0, scaleX: 1.15 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="absolute left-0 right-0 top-[46%] h-[2px] rounded-full bg-red-500"
            />
          </span>
        ) : (
          <motion.img
            src={MASCOT.image}
            alt=""
            width={56}
            height={58}
            draggable={false}
            animate={
              eating
                ? { scale: [1, 1.12, 0.96, 1.1, 1], rotate: [0, -4, 4, -2, 0] }
                : { y: [0, -4, 0] }
            }
            transition={
              eating
                ? { duration: 0.9, ease: 'easeInOut' }
                : { repeat: Infinity, duration: 3.4, ease: 'easeInOut' }
            }
            className="h-14 w-14 drop-shadow-lg transition-transform hover:scale-105"
          />
        )}
      </button>
    </div>
  );
}
