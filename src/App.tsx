import { pv } from './lib/preview';
import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, logout } from '#auth';
import { getMe } from '#api';
import { Toaster } from '@project/components/ui/sonner';
import { Button } from '@project/components/ui/button';
import { Loader2 } from 'lucide-react';
import Landing from './pages/Landing';
import PublicCalendar from './pages/PublicCalendar';
import PublicParents from './pages/PublicParents';
import AppShell from './components/AppShell';
import MyEvents from './pages/MyEvents';
import StaffHub from './pages/StaffHub';
import Attendance from './pages/Attendance';
import Profile from './pages/Profile';
import StageLayout from './pages/StageLayout';
import AdminOverview from './pages/admin/AdminOverview';
import AdminEvents from './pages/admin/AdminEvents';
import AdminMembers from './pages/admin/AdminMembers';
import EmailLog from './pages/admin/EmailLog';
import Support from './pages/admin/Support';
import AdminPresence from './pages/admin/AdminPresence';
import ServerDiagnostics from './pages/admin/ServerDiagnostics';
import Tools from './pages/Tools';
import Calendar from './pages/Calendar';
import Schedule from './pages/Schedule';
import ApprovePresence from './pages/ApprovePresence';
import Ticket from './pages/admin/Ticket';
import AdminFeedback from './pages/admin/AdminFeedback';
import Feedback from './pages/Feedback';
import Contacts from './pages/Contacts';
import Leaderboard from './pages/Leaderboard';
import Announcements from './pages/Announcements';
import Messages from './pages/Messages';
import Skills from './pages/Skills';
import Mascot from './pages/Mascot';
import Memories from './pages/Memories';
import OpenCode from './pages/OpenCode';
import ShowWorkspace from './pages/ShowWorkspace';
import LoginCat from './components/LoginCat';
import PwaWelcome from './components/PwaWelcome';
import LiveShowDash from './pages/live/LiveShowDash';
import LiveShowAdmin from './pages/admin/LiveShowAdmin';
import Widget from './pages/Widget';
import Watch from './pages/Watch';
import CallSheet from './pages/CallSheet';
import { MeContext, type Me, type Mentor } from './lib/me';
import { applyAccent, getAccent, applyAccessibilityPrefs } from './lib/uiPrefs';

document.documentElement.classList.add('dark');
// Ticket 8051f385: apply the saved density (roomy/compact) before first paint
// so the layout does not flash the default. Batch 6 folds density, text scale
// and high contrast into one call so all three land before the first paint.
applyAccessibilityPrefs();
// Apply the saved accent before first paint so the app never flashes the default.
applyAccent(getAccent());

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
);

function SignedIn() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [supportAwaiting, setSupportAwaiting] = useState(0);
  const [liveShowActive, setLiveShowActive] = useState(false);
  const [specialNote, setSpecialNote] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});
  const [unreadMessages, setUnreadMessages] = useState(0);
  const refreshMe = useCallback(async () => {
    const r = await getMe(pv());
    setMe(r.member);
    setMentor(r.mentor ?? null);
    setSupportAwaiting(r.supportAwaiting ?? 0);
    setLiveShowActive(!!r.liveShowActive);
    setSpecialNote(r.specialNote ?? null);
    setNotificationPrefs(r.notificationPrefs ?? {});
    setUnreadMessages(r.unreadMessages ?? 0);
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  if (me === undefined) return <Spinner />;
  if (me === null)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-sm text-muted-foreground">Your email isn’t on the AshTec crew list yet. Ask a crew admin to add you.</p>
        <Button variant="outline" onClick={() => logout()}>Sign out</Button>
        <LoginCat />
      </div>
    );

  return (
    <MeContext.Provider value={{ me, mentor, refreshMe, supportAwaiting, liveShowActive, specialNote, notificationPrefs, unreadMessages }}>
      <Routes>
        {/* QR approval links must survive sign-in, so every signed-in crew member can land here. */}
        <Route path="/a/:token" element={<ApprovePresence />} />
        {/* The live show dashboard lives outside the shell; it keeps only its own back button. */}
        <Route path="/show-dash" element={<LiveShowDash />} />
        {/* Batch 6: the compact widget and the watch companion are their own
            minimal surfaces, so they render outside the shell too. */}
        <Route path="/widget" element={<Widget />} />
        <Route path="/watch" element={<Watch />} />
        {/* Feedback invitations are their own full-screen page, reachable whether or not you are signed in. */}
        <Route path="/feedback/:formId" element={<Feedback />} />
      <Route path="/opencode" element={<OpenCode />} />
      <Route path="/github" element={<Navigate to="https://github.com/SmartSparkCoding/AshTecCrewHub" replace />} />
      <Route path="/gh" element={<Navigate to="https://github.com/SmartSparkCoding/AshTecCrewHub" replace />} />
        <Route element={<AppShell />}>
          <Route path="/" element={me.memberType === 'Actor' ? <StageLayout /> : me.isStaff ? <StaffHub /> : <MyEvents />} />
          {/* Ticket f455bb8c: non-staff admins asked for the roster too. */}
          {me.isAdmin && <Route path="/roster" element={<StaffHub />} />}
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/profile" element={<Profile />} />
          {/* Ticket 00c0715c: contractors never get the stage layout. */}
          <Route path="/stage" element={me.isContractor ? <Navigate to="/" replace /> : <StageLayout />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/schedule" element={<Schedule />} />
          {/* The parents page is public, but crew need to open it too (sidebar). */}
          <Route path="/parents" element={<PublicParents inShell />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          {/* Batch 7: crew announcements, direct messages and the skills directory. */}
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/skills" element={<Skills />} />
          {/* Batch 8: the mascot and the show memories wall. */}
          <Route path="/mascot" element={<Mascot />} />
          <Route path="/memories" element={<Memories />} />
          <Route path="/show/:showId" element={<ShowWorkspace />} />
          {/* Batch 6: printable call sheet (rendered in the shell so nav works
              on screen; @media print hides the chrome). */}
          <Route path="/show/:showId/sheet" element={<CallSheet />} />
          <Route path="/tools" element={<Tools />} />
          {me.isAdmin && <Route path="/admin" element={<AdminOverview />} />}
          {me.isAdmin && <Route path="/admin/events" element={<AdminEvents />} />}
          {me.isAdmin && <Route path="/admin/members" element={<AdminMembers />} />}
          {me.isAdmin && <Route path="/admin/emails" element={<EmailLog />} />}
          {me.isAdmin && <Route path="/admin/support" element={<Support />} />}
          {me.isAdmin && <Route path="/admin/feedback" element={<AdminFeedback />} />}
          {(me.isAdmin || me.isStaff) && <Route path="/admin/attendance" element={<AdminPresence />} />}
          {me.isAdmin && <Route path="/admin/diagnostics" element={<ServerDiagnostics />} />}
          {me.isAdmin && <Route path="/admin/live-show" element={<LiveShowAdmin />} />}
          {me.isAdmin && <Route path="/admin/support/:ticketId" element={<Ticket />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </MeContext.Provider>
  );
}

export default function App() {
  const { user, isLoading } = useAuth();
  return (
    <BrowserRouter>
      {isLoading ? <Spinner /> : user ? <SignedIn /> : <SignedOut />}
      <Toaster />
      <PwaWelcome />
    </BrowserRouter>
  );
}

/** Signed-out routes. /calendar and /parents are public on purpose; everything else is the marketing home. */
function SignedOut() {
  return (
    <Routes>
      <Route path="/calendar" element={<PublicCalendar />} />
      <Route path="/parents" element={<PublicParents />} />
      {/* A phone camera can open an approval link before the admin is signed in. */}
      <Route path="/a/:token" element={<ApprovePresence />} />
      {/* The live show dashboard is public; a code unlocks it when the show is on. */}
      <Route path="/show-dash" element={<LiveShowDash />} />
      {/* A feedback invitation is public: accepting it is what leads to sign-in. */}
      <Route path="/feedback/:formId" element={<Feedback />} />
      <Route path="/opencode" element={<OpenCode />} />
      <Route path="/github" element={<Navigate to="https://github.com/SmartSparkCoding/AshTecCrewHub" replace />} />
      <Route path="/gh" element={<Navigate to="https://github.com/SmartSparkCoding/AshTecCrewHub" replace />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
