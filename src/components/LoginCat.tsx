import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Loader2, Lock } from 'lucide-react';
import { getCatLoginAdmins } from '#api';

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

/**
 * Emergency admin sign-in, opened by tapping the cat five times quickly.
 *
 * Why it exists: if the magic-link email is filtered (the school does filter
 * one of our domains) an admin can otherwise be locked out entirely. The
 * passphrase is checked on the server; this dialog only collects it. The list
 * of admins in the dropdown is read from the server so it reflects everyone
 * who actually set up a cat-login secret, not the one or two emails that
 * happened to do so when the cat was first deployed (ticket 8cd13381).
 *
 * Lockout: five wrong guesses from the same (email, IP) pair pause that target
 * for fifteen minutes; a single success clears the bucket. The error message
 * is the same for any failure so the route cannot be used to enumerate admins.
 */
function CatAdminLogin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [admins, setAdmins] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setProblem(null);
    getCatLoginAdmins({})
      .then((r) => {
        const list = r.admins ?? [];
        setAdmins(list);
        if (list.length && !list.includes(email)) setEmail(list[0]);
        if (!list.length) setEmail('');
      })
      .catch(() => setAdmins([]));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch('/api/auth/cat-login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem(body?.message ?? 'Those details are not right.');
        setPassword('');
        return;
      }
      toast.success('Signed in');
      // Full reload so the app picks up the new session from scratch, exactly
      // as a magic-link sign-in would.
      window.location.href = '/';
    } catch {
      setProblem('That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" /> Emergency sign-in
          </DialogTitle>
          <DialogDescription>For when the magic-link email can't get through.</DialogDescription>
        </DialogHeader>
        {admins.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No admin has set up an emergency sign-in yet. Ask one to register a passphrase in their Settings, then try again.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="cat-admin" className="text-sm font-medium">Which admin are you?</label>
              <select
                id="cat-admin"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                {admins.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cat-pass" className="text-sm font-medium">Passphrase</label>
              <Input
                id="cat-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                placeholder="Your emergency passphrase"
              />
            </div>
            {problem && <p className="text-sm text-destructive">{problem}</p>}
            <Button className="w-full" disabled={busy || !password || !email}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The crew cat. Watches your cursor, jumps when poked, naps when ignored. */
export default function LoginCat() {
  const ref = useRef<HTMLImageElement>(null);
  const [lean, setLean] = useState({ x: 0, y: 0 });
  const [say, setSay] = useState<string | null>(null);
  const [jump, setJump] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const idle = useRef<number>();
  // Rapid-tap detector: five taps inside five seconds opens the admin sign-in.
  const taps = useRef<number[]>([]);

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

    // Keep only the taps from the last 5 seconds; five of them opens the dialog.
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 5000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setSay(null);
      setAdminOpen(true);
    }
  };

  return (
    <>
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
      <CatAdminLogin open={adminOpen} onClose={() => setAdminOpen(false)} />
    </>
  );
}
