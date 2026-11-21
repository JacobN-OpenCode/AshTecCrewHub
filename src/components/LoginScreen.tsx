import { useEffect, useState } from 'react';
import { signIn } from '#auth';
import { loginWithRedirect } from '#auth';
import { checkEmail, getSignInDomainHints } from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Loader2, Mail } from 'lucide-react';

/**
 * One field, one click.
 *
 * The old flow asked for the email, said hello, then handed you to Zite's own
 * sign-in page which asked for the email all over again and then your name.
 * `signIn.magicLink` does the whole thing in one call, so the email is typed
 * once and the name comes from the crew list. First-run installs have no auth
 * user yet, so those still go through the hosted page.
 */
export function SignInPanel({ onSent, callbackURL = '/' }: { onSent?: () => void; callbackURL?: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; firstName: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Ticket 6: "Preset email suffixes for sign in". Everyone is on a school
  // domain, so typing "moorej" should be enough - the rest is picked from here.
  const [domains, setDomains] = useState<string[]>([]);
  const [domainHint, setDomainHint] = useState('');
  useEffect(() => {
    getSignInDomainHints({})
      .then((r) => setDomains(r.domains))
      .catch(() => { /* hints are optional; the box still works without them */ });
  }, []);
  // A typed "@" (or a full address) means the person is doing it themselves.
  const local = email.includes('@') ? '' : email.trim();
  const sugared = (raw: string) => {
    const v = raw.trim();
    if (v.includes('@') || !v) return v;
    // One shared domain: fill it in on its own. Several: the chips below ask
    // which, because guessing wrong sends the link to nobody.
    return domains.length === 1 ? `${v}@${domains[0]}` : v;
  };
  const resolved = sugared(email);
  const valid = /^\S+@\S+\.\S+$/.test(resolved);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      if (local && domains.length > 1) setDomainHint('Choose your school above, or type the whole address.');
      return;
    }
    setDomainHint('');
    setBusy(true);
    setProblem(null);
    try {
      const who = await checkEmail({ email: resolved });
      if (!who.exists && !who.setupMode) {
        setProblem('We could not find a crew account for that address. Ask a crew admin to add you.');
        return;
      }
      // Fresh install: nobody has signed in yet, so there is no auth user to
      // send a link to. The hosted page is the only thing that can create one.
      if (!who.exists) {
        loginWithRedirect();
        return;
      }
      const res = await signIn.magicLink({
        email: resolved,
        // The hosted sign-up screen used to ask for this. The crew list already
        // knows it, so pass it through rather than making someone type it again.
        name: who.firstName || resolved,
        callbackURL,
      });
      if (res.error) {
        setProblem(res.error.message ?? 'That did not work. Try again in a moment.');
        return;
      }
      setSent({ email: resolved, firstName: who.firstName });
      onSent?.();
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold">
          {sent.firstName ? `On its way, ${sent.firstName}` : 'On its way'}
        </h2>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{sent.email}</span>. Open it on this
          device and you are in. The link works once, and once you are in you stay signed in.
        </p>
        <button className="text-xs text-muted-foreground underline" onClick={() => setSent(null)}>
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="ashtec-email" className="text-sm font-medium">
          School email address
        </label>
        <Input
          id="ashtec-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setProblem(null);
          }}
          placeholder={domains.length === 1 ? `you${domains[0]}` : 'you@ashfordschool.co.uk'}
          autoComplete="email"
        />
        {/* Ticket 6: the suffix, one tap away. */}
        {local !== '' && domains.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {domains.map((d) => (
              <button
                key={d}
                type="button"
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                onClick={() => { setEmail(`${local}@${d}`); setProblem(null); setDomainHint(''); }}
              >
                @{d}
              </button>
            ))}
          </div>
        )}
        {local !== '' && domains.length > 1 && (
          <p className="text-xs text-muted-foreground">Pick your school from the list, or type the whole address.</p>
        )}
        {domainHint && <p className="text-xs text-destructive">{domainHint}</p>}
      </div>
      {problem && <p className="text-sm text-destructive">{problem}</p>}
      <Button className="h-12 w-full rounded-full text-base" disabled={!valid || busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
        Email me a sign-in link
      </Button>
      <p className="text-center text-xs text-muted-foreground">No password to remember. No name to retype.</p>
    </form>
  );
}
