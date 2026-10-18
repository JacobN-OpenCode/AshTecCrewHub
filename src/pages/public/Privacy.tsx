import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';

/**
 * /privacy — the privacy notice (feedback round 2, round 3).
 *
 * Adapted from the generated policy, with the generator's dashboard chrome and
 * marketing removed and the content corrected to match what the crew hub
 * actually collects and does (the original listed only names and emails, said
 * nothing about cookies or the service providers that run it, and carried a
 * "business transfers" clause that cannot apply to a school club).
 *
 * Linked only from the public footer, never from inside the signed-in app.
 */

const UPDATED = '18 October 2026';

const TOC = [
  'What information do we collect?',
  'How do we process your information?',
  'What legal bases do we rely on?',
  'When and with whom do we share your information?',
  'How long do we keep your information?',
  'How do we keep your information safe?',
  'What are your privacy rights?',
  'Controls for do-not-track features',
  'Do we make updates to this notice?',
  'How can you contact us about this notice?',
  'How can you review, update or delete your data?',
];

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={`s${n}`} className="scroll-mt-24 space-y-3">
      <h2 className="text-2xl font-bold tracking-tight">
        <span className="mr-2 font-mono text-primary">{n}.</span>
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_li]:mt-1.5 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export default function Privacy() {
  return (
    <PublicLayout>
      <article className="mx-auto max-w-3xl px-4 pt-12 pb-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <ShieldCheck className="h-3.5 w-3.5" /> Privacy
        </span>
        <h1 className="mt-4 text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Privacy Notice
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>

        <p className="mt-6 leading-relaxed text-muted-foreground">
          This Privacy Notice for the <strong className="text-foreground">AshTec Crew Hub</strong> describes how and
          why we access, collect, store, use and share (&ldquo;process&rdquo;) your personal information when you use
          our services, including when you visit{' '}
          <a href="https://ashtec.dino.icu/" className="text-primary underline underline-offset-4">ashtec.dino.icu</a>,
          sign in to the crew hub, or use one of our apps (the macOS and Wear OS apps).
        </p>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          The crew hub is a private system run by the student tech crew of Ashford School to manage the club: its
          events, its members, its shows and its reminders. It is not a public service and not a commercial product.
          If you do not agree with this notice, please do not use the crew hub.
        </p>

        <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] p-5">
          <h2 className="font-semibold text-amber-500">Not affiliated with the school</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The AshTec Crew Hub is an independent, student-run project. We are <strong className="text-foreground">in
            no way directly affiliated with, endorsed by, sponsored by or controlled by Ashford School</strong> (Kent),
            which is owned by the United Learning Trust. We operate independently of the school and of the Trust, and
            nothing here is their responsibility or their service. The school&rsquo;s name is used only to say where
            the crew is based and which productions we help with. Any questions about the crew hub should come to the
            crew, not to the school.
          </p>
        </div>

        {/* Contents */}
        <nav className="mt-8 rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Contents</h2>
          <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {TOC.map((t, i) => (
              <li key={t}>
                <a href={`#s${i + 1}`} className="text-muted-foreground hover:text-foreground">
                  <span className="font-mono text-primary">{i + 1}.</span> {t}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Summary */}
        <div className="mt-8 rounded-2xl border border-primary/25 bg-primary/[0.04] p-5">
          <h2 className="font-semibold">Summary of key points</h2>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li><strong className="text-foreground">What we collect.</strong> Only what the crew needs to run the club: your name and school email, your year and roles, your answers to event forms, attendance and check-in records, and anything you choose to add (a picture link, a phone number, skills).</li>
            <li><strong className="text-foreground">Sensitive information.</strong> We do not collect or process special-category (sensitive) personal information.</li>
            <li><strong className="text-foreground">Third parties.</strong> We do not collect information about you from anyone else, and we do not sell or rent your information.</li>
            <li><strong className="text-foreground">Why.</strong> To run the crew, send the reminders and alerts you have asked for, keep the system secure, and answer your support tickets and feedback.</li>
            <li><strong className="text-foreground">Sharing.</strong> Only with the handful of providers that run the service (email delivery, push notifications, hosting) and with crew admins. Never for advertising.</li>
            <li><strong className="text-foreground">Your rights.</strong> You can see, correct, export or delete your information, and you can ask us to. See <a href="#s11">section 11</a>.</li>
          </ul>
        </div>

        <div className="mt-12 space-y-12">
          <Section n={1} title="What information do we collect?">
            <p><strong>Information you give us.</strong> You provide this yourself, and it depends on what you fill in:</p>
            <ul>
              <li>your <strong>first initial and surname</strong> (we deliberately store only a first initial, never a full first name);</li>
              <li>your <strong>school email address</strong> (this is your sign-in);</li>
              <li>your <strong>year group</strong> and your <strong>crew roles</strong> and preferred roles;</li>
              <li>optional extras, only if you choose to add them: a <strong>profile picture link</strong>, a <strong>phone number</strong> you opt to share, your <strong>birthday as a day and month only</strong> (never the year), a status line, and the <strong>skills</strong> you tag.</li>
            </ul>
            <p><strong>Information created by using the crew hub.</strong> When you use the service we record:</p>
            <ul>
              <li>your answers to event and show forms (coming, maybe, or not attending);</li>
              <li>attendance and venue check-in records for rehearsals and shows;</li>
              <li>anything you post in the crew hub, such as rehearsal notes, show debriefs, green-room messages and lost-property entries;</li>
              <li>support tickets and feedback you submit, and the replies on them;</li>
              <li>notifications sent to you, and when;</li>
              <li>sign-in and session details (the device and the time), kept so you can see and sign out your devices;</li>
              <li>coarse page-view counts, so we can see which parts of the hub are used. These are recorded on our own server, not by a third-party analytics service.</li>
            </ul>
            <p><strong>Cookies and local storage.</strong> We use one essential cookie, <code className="rounded bg-muted px-1.5 py-0.5 text-xs">crew_session</code>, to keep you signed in. It is set only when you sign in, it is not readable by scripts, and it is not used for advertising. We also use your browser&rsquo;s local storage for your own preferences on that device (for example your theme, your layout choice, and whether you have turned notifications on). We use no advertising cookies and no third-party tracking cookies.</p>
            <p><strong>Sensitive information.</strong> We do not ask for, or process, special-category personal information. Please do not put it in free-text fields such as notes or support tickets.</p>
            <p>Please keep the information you give us accurate, and tell us (or edit it in Settings) if it changes.</p>
          </Section>

          <Section n={2} title="How do we process your information?">
            <p>We use your information to run the crew hub and nothing else:</p>
            <ul>
              <li><strong>To run the service.</strong> Events, responses, attendance and check-in, show workspaces, announcements and the calendar.</li>
              <li><strong>To send you the messages you asked for.</strong> Deadline reminders, cue calls, and the notifications you enable on a device, including live-show movement alerts.</li>
              <li><strong>To let crew admins run the club.</strong> Admins can see the crew roster, responses and attendance so they can plan rehearsals and shows.</li>
              <li><strong>To keep it secure.</strong> Signing you in, keeping your session safe, and preventing abuse.</li>
              <li><strong>To answer you.</strong> Responding to your support tickets and feedback.</li>
              <li><strong>To protect someone.</strong> Where necessary to prevent harm, for example using venue check-in records to know who is on site.</li>
            </ul>
          </Section>

          <Section n={3} title="What legal bases do we rely on?">
            <p>Under the UK GDPR and the Data Protection Act 2018 we must have a lawful basis for processing your information. We rely on:</p>
            <ul>
              <li><strong>Consent</strong> for the optional things &mdash; a profile picture, a shared phone number, your birthday, your skills, and notifications. You can withdraw consent at any time (see <a href="#s7">section 7</a>).</li>
              <li><strong>Legitimate interests</strong> for running the club &mdash; managing the crew, its events and its shows, and keeping the system secure. We have balanced this against your rights, and the information is limited to what the club actually needs.</li>
              <li><strong>Vital interests</strong> where it is necessary to protect someone&rsquo;s safety, such as knowing who is on site during a show.</li>
              <li><strong>Legal obligations</strong> where the law requires us to keep or disclose something.</li>
            </ul>
          </Section>

          <Section n={4} title="When and with whom do we share your information?">
            <p>We do not sell, rent or trade your personal information, and we do not share it for advertising or marketing.</p>
            <p>We share it only in these situations:</p>
            <ul>
              <li><strong>With crew admins</strong>, who run the club and can see the crew information they need to do so.</li>
              <li><strong>With the providers that run the service</strong>, acting on our instructions: our email provider (to send sign-in links and notifications), our push-notification service (to deliver notifications to your devices), and our hosting provider (which stores the data). Each is only given what it needs to do its job.</li>
              <li><strong>Where the law requires it</strong>, such as cooperating with a lawful request from a regulator or the police, or defending a legal claim.</li>
            </ul>
          </Section>

          <Section n={5} title="How long do we keep your information?">
            <p>We keep your information for as long as you are part of the crew and for a short period afterwards, and only for as long as it is needed for the purposes in this notice. When it is no longer needed we delete it or anonymise it.</p>
            <p>Some records may be kept for longer where there is a good reason &mdash; for example attendance and check-in records kept for safety, or where the law requires it. Where information has been placed in a backup, we keep it securely and isolated from any further use until it can be deleted.</p>
            <p>You can ask us to delete your information at any time; see <a href="#s11">section 11</a>.</p>
          </Section>

          <Section n={6} title="How do we keep your information safe?">
            <p>We have put reasonable technical and organisational measures in place to protect your information, including:</p>
            <ul>
              <li>sign-in by a single-use link sent to your school email, which expires after 15 minutes;</li>
              <li>sessions kept in a cookie that scripts cannot read, and which you can end from Settings, on one device or all of them;</li>
              <li>admin passphrases stored only as hashes, compared in constant time, and rate-limited against guessing;</li>
              <li>access controls, so members can only see what they are allowed to see, and only admins can change crew information;</li>
            </ul>
            <p>No system is perfectly secure, and no transmission over the internet can be guaranteed to be 100% safe. We cannot promise that someone will never defeat our security, so please use the crew hub only in a secure environment and keep your school account safe.</p>
          </Section>

          <Section n={7} title="What are your privacy rights?">
            <p>Under the UK GDPR you have the right to:</p>
            <ul>
              <li>ask for a copy of your personal information (access);</li>
              <li>have inaccurate information corrected (rectification);</li>
              <li>ask us to delete your information (erasure);</li>
              <li>ask us to restrict how we use it;</li>
              <li>receive your information in a portable format;</li>
              <li>object to processing based on legitimate interests;</li>
              <li>withdraw your consent at any time, where we rely on consent.</li>
            </ul>
            <p>Withdrawing consent does not affect anything we did before you withdrew it.</p>
            <p><strong>Complaints.</strong> If you are unhappy with how we have handled your information, please tell us first &mdash; we will acknowledge your complaint within 30 days, look into it without unjustified delay, and keep you informed of the outcome. If you are still not satisfied you can complain to the Information Commissioner&rsquo;s Office (ICO), the UK supervisory authority:</p>
            <ul>
              <li>Website: <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">ico.org.uk/make-a-complaint</a></li>
              <li>Helpline: 0303 123 1113</li>
              <li>Post: Information Commissioner&rsquo;s Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF</li>
            </ul>
          </Section>

          <Section n={8} title="Controls for do-not-track features">
            <p>Some browsers offer a &ldquo;Do Not Track&rdquo; (DNT) setting. No common standard for how to recognise and honour DNT has been agreed, so we do not currently respond to DNT signals. We do not track you across other websites in any case, and we use no advertising or third-party tracking. If a standard is adopted that we must follow, we will say so in a new version of this notice.</p>
          </Section>

          <Section n={9} title="Do we make updates to this notice?">
            <p>Yes. We may update this notice from time to time, and the date at the top will change when we do. If we make a significant change we will tell you, either by putting a notice in the crew hub or by email. Please check back occasionally.</p>
          </Section>

          <Section n={10} title="How can you contact us about this notice?">
            <p>If you have any questions about this notice or about your information, contact the crew maintainer:</p>
            <ul>
              <li>In person or via any crew admin at school;</li>
              <li>In the crew WhatsApp community;</li>
              <li>On the project on GitHub, where an issue can be opened.</li>
            </ul>
            <p>The crew hub is run by the AshTec Crew, an independent student group based at Ashford School in the United Kingdom. We are not affiliated with, endorsed by, sponsored by or controlled by Ashford School or the United Learning Trust, and we operate independently of them.</p>
          </Section>

          <Section n={11} title="How can you review, update or delete your data?">
            <p>You can review and update most of your own information straight away in{' '}
              <Link to="/profile" className="text-primary underline underline-offset-4">Settings</Link>{' '}
              once you are signed in &mdash; your name, year, roles, picture, skills and the privacy of each of those.
              You can also see the devices you are signed in on and sign them out.
            </p>
            <p>To request a copy of everything we hold about you, or to ask us to correct or delete it, contact the crew maintainer (see <a href="#s10">section 10</a>). We will act on your request in line with the UK GDPR. Some rights may be limited in certain circumstances, for example where we must keep a record for safety or by law.</p>
          </Section>
        </div>

        <p className="mt-14 border-t pt-6 text-xs text-muted-foreground">
          This notice was drafted with the help of Termly&rsquo;s privacy policy generator, then adapted for the
          AshTec Crew Hub.
        </p>
      </article>
    </PublicLayout>
  );
}
