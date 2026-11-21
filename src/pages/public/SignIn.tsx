import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import { SignInPanel } from '../../components/LoginScreen';

/** The dedicated sign-in page. The header's Sign in button points here. */
export default function SignIn() {
  return (
    <PublicLayout>
      <section className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-3xl border bg-card p-6 shadow-xl sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Type your address once. That is the whole form.</p>
          </div>
          <SignInPanel onSent={() => undefined} />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Only crew on the list can sign in. Ask an admin to add you.
          </p>
        </div>
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </p>
      </section>
    </PublicLayout>
  );
}
