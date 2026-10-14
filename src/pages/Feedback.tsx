import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '#auth';
import { getMyFeedback, submitFeedback } from '#api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent } from '@project/components/ui/card';
import { Checkbox } from '@project/components/ui/checkbox';
import { Textarea } from '@project/components/ui/textarea';
import { Loader2, Lock, MessageSquareHeart, Sparkles } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { SignInPanel } from '../components/LoginScreen';
import { getFeedbackForm, type FeedbackForm } from '../lib/feedback';

/** Picks the sentence a lone cat would say while you decide. */
const CAT_LINES = [
  'Meow. Pick away.',
  'I read every one of these. Every. One.',
  'No rush. I have nine lives.',
  '*taps the checkbox with a paw*',
  'Do it for the crew.',
];

type Answer = { selected: string[]; other: string; submittedAt: string };

/** Full-viewport backdrop so this feels like an invitation, not another tab. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Radial glow, the same red one the landing page opens with. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(60% 55% at 50% 0%, rgba(236, 55, 80, 0.16), transparent 70%)' }}
      />
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}

function Cat({ size = 96, waving = false }: { size?: number; waving?: boolean }) {
  return (
    <motion.img
      src="/cat.png"
      alt="The crew cat"
      width={size}
      height={(size * 87) / 84}
      draggable={false}
      className="drop-shadow-lg"
      animate={waving ? { rotate: [-6, 6, -6], y: [0, -4, 0] } : { y: [0, -4, 0] }}
      transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}
    />
  );
}

function Signature({ form }: { form: FeedbackForm }) {
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      — <span className="font-semibold text-foreground">{form.fromName}</span>, {form.fromRole}
    </p>
  );
}

export default function Feedback() {
  const { formId = '1' } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const form = getFeedbackForm(formId);

  // Arriving back from the magic link with ?go=form means they already accepted.
  const [accepted, setAccepted] = useState(params.get('go') === 'form');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [checking, setChecking] = useState(!!user);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [other, setOther] = useState('');
  const [sending, setSending] = useState(false);

  const loadAnswer = useCallback(async () => {
    if (!user) {
      setChecking(false);
      setAnswer(null);
      return;
    }
    setChecking(true);
    try {
      const r = await getMyFeedback({ form: formId });
      setAnswer(r.responded ? { selected: r.selected, other: r.other, submittedAt: r.submittedAt } : null);
    } catch {
      // A signed-in non-member cannot answer; the form still shows rather than
      // erroring, and the submit call will explain if they are not on the list.
      setAnswer(null);
    } finally {
      setChecking(false);
    }
  }, [user, formId]);

  useEffect(() => {
    void loadAnswer();
  }, [loadAnswer]);

  const totalPicked = picks.size;
  const catLine = useMemo(() => CAT_LINES[Math.floor(Math.random() * CAT_LINES.length)], []);

  if (!form) {
    return (
      <Frame>
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <Cat size={80} />
            <h1 className="text-xl font-semibold">This link is a mystery to me</h1>
            <p className="text-sm text-muted-foreground">There is no feedback form called “{formId}”. Sorry.</p>
            <Button asChild variant="outline"><Link to="/">Back to the hub</Link></Button>
          </CardContent>
        </Card>
      </Frame>
    );
  }

  const toggle = (id: string) =>
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    if (!totalPicked && !other.trim()) {
      toast.error('Pick at least one idea, or write something in the box.');
      return;
    }
    setSending(true);
    try {
      await submitFeedback({ form: form.id, selected: [...picks], other: other.trim() });
      toast.success('Sent. Thank you!');
      await loadAnswer();
    } catch (err: any) {
      const body = err?.body ?? {};
      if (body.code === 'CONFLICT') {
        toast.message('Already sent', { description: body.userFacingMessage ?? 'Your answer is locked in.' });
        await loadAnswer();
      } else {
        toast.error(body.userFacingMessage ?? body.message ?? 'That did not send. Try again?');
      }
    } finally {
      setSending(false);
    }
  };

  // --------------------------------------------------------------- locked view
  if (answer) {
    const chosen = new Set(answer.selected);
    return (
      <Frame>
        <Card className="overflow-hidden">
          <CardContent className="space-y-6 py-8">
            <div className="space-y-3 text-center">
              <Cat waving />
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                <Lock className="h-3.5 w-3.5" /> Locked in
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Got it — thank you!</h1>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                This is your answer, and it is final. {form.fromName} has it now and will get building on the popular ones.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border bg-muted/30 p-4">
              {form.sections.map((section) => {
                const hits = section.features.filter((f) => chosen.has(f.id));
                if (!hits.length) return null;
                return (
                  <div key={section.title}>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.emoji} {section.title}
                    </div>
                    <ul className="space-y-1 pl-1 text-sm">
                      {hits.map((f) => <li key={f.id}>• {f.label}</li>)}
                    </ul>
                  </div>
                );
              })}
              {answer.other && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">✍️ Your own words</div>
                  <p className="whitespace-pre-wrap text-sm italic text-foreground/90">{answer.other}</p>
                </div>
              )}
              {!answer.selected.length && !answer.other && (
                <p className="text-sm text-muted-foreground">You did not pick anything, which is also an answer.</p>
              )}
            </div>

            <div className="text-center">
              <Button asChild variant="outline"><Link to="/">Back to the hub</Link></Button>
            </div>
          </CardContent>
        </Card>
      </Frame>
    );
  }

  // ------------------------------------------------------------ invitation
  if (!accepted) {
    return (
      <Frame>
        <Card className="overflow-hidden">
          <CardContent className="space-y-5 py-9 text-center">
            <Cat waving />
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> You&rsquo;ve been invited
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{form.title}</h1>
            <p className="mx-auto max-w-lg text-muted-foreground">{form.intro}</p>
            <Signature form={form} />
            <div className="pt-2">
              <Button size="lg" className="rounded-full px-8 text-base" onClick={() => setAccepted(true)}>
                Accept the invitation
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Takes two minutes. You answer once, and then it is set in stone. {catLine}
            </p>
          </CardContent>
        </Card>
      </Frame>
    );
  }

  // ------------------------------------------------------- sign in, then form
  if (!user) {
    return (
      <Frame>
        <Card className="overflow-hidden">
          <CardContent className="space-y-5 py-8">
            <div className="space-y-2 text-center">
              <Cat size={80} />
              <h1 className="text-2xl font-bold tracking-tight">First, a quick hello</h1>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {form.fromName} needs to know who is answering. Pop in your school email and we&rsquo;ll send you a
                sign-in link — then you land straight back here.
              </p>
            </div>
            <div className="mx-auto max-w-sm">
              <SignInPanel callbackURL={`/feedback/${form.id}?go=form`} />
            </div>
            <div className="text-center">
              <button className="text-xs text-muted-foreground underline" onClick={() => setAccepted(false)}>
                Back
              </button>
            </div>
          </CardContent>
        </Card>
      </Frame>
    );
  }

  if (checking) {
    return (
      <Frame>
        <Card><CardContent className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card>
      </Frame>
    );
  }

  // ----------------------------------------------------------------- the form
  return (
    <Frame>
      <Card className="overflow-hidden">
        <CardContent className="space-y-6 py-8">
          <div className="flex items-start gap-4">
            <div className="shrink-0"><Cat size={64} /></div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <MessageSquareHeart className="h-3.5 w-3.5" /> Feedback for {form.fromName}
              </div>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{form.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Tick everything you want, skip what you don&rsquo;t. There are no wrong answers.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {form.sections.map((section) => (
              <div key={section.title} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.emoji} {section.title}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {section.features.map((f) => {
                    const on = picks.has(f.id);
                    return (
                      <label
                        key={f.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors',
                          on ? 'border-primary/50 bg-primary/[0.06]' : 'border-border hover:bg-muted/40',
                        )}
                      >
                        <Checkbox checked={on} onCheckedChange={() => toggle(f.id)} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-snug">{f.label}</span>
                          {f.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{f.hint}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <label htmlFor="feedback-other" className="text-sm font-medium">{form.otherLabel}</label>
            <Textarea
              id="feedback-other"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder={form.otherHint}
              maxLength={4000}
              rows={4}
            />
          </div>

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="order-2 text-xs text-muted-foreground sm:order-1">
              {totalPicked ? `${totalPicked} idea${totalPicked === 1 ? '' : 's'} picked` : 'Nothing picked yet'}
              {' · '}answers are final 🔒
            </p>
            <Button size="lg" className="order-1 rounded-full px-8 sm:order-2" onClick={send} disabled={sending}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send my feedback
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Once you send this you cannot change it — so tick anything you are even a little keen on.
          </p>
        </CardContent>
      </Card>
    </Frame>
  );
}
