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
import AdminEvents from './pages/admin/AdminEvents';
import AdminMembers from './pages/admin/AdminMembers';
import EmailLog from './pages/admin/EmailLog';
import Support from './pages/admin/Support';
import AdminPresence from './pages/admin/AdminPresence';
import ServerDiagnostics from './pages/admin/ServerDiagnostics';
import Tools from './pages/Tools';
import Calendar from './pages/Calendar';
import ApprovePresence from './pages/ApprovePresence';
import Ticket from './pages/admin/Ticket';
import LoginCat from './components/LoginCat';
import PwaWelcome from './components/PwaWelcome';
import LiveShowDash from './pages/live/LiveShowDash';
import LiveShowAdmin from './pages/admin/LiveShowAdmin';
import { MeContext, type Me } from './lib/me';
import { applyAccent, getAccent } from './lib/uiPrefs';

document.documentElement.classList.add('dark');
// Apply the saved accent before first paint so the app never flashes the default.
applyAccent(getAccent());

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
);

function SignedIn() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [supportAwaiting, setSupportAwaiting] = useState(0);
  const [liveShowActive, setLiveShowActive] = useState(false);
  const [specialNote, setSpecialNote] = useState<string | null>(null);
  const refreshMe = useCallback(async () => {
    const r = await getMe(pv());
    setMe(r.member);
    setSupportAwaiting(r.supportAwaiting ?? 0);
    setLiveShowActive(!!r.liveShowActive);
    setSpecialNote(r.specialNote ?? null);
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
    <MeContext.Provider value={{ me, refreshMe, supportAwaiting, liveShowActive, specialNote }}>
      <Routes>
        {/* QR approval links must survive sign-in, so every signed-in crew member can land here. */}
        <Route path="/a/:token" element={<ApprovePresence />} />
        {/* The live show dashboard lives outside the shell; it keeps only its own back button. */}
        <Route path="/show-dash" element={<LiveShowDash />} />
        <Route element={<AppShell />}>
          <Route path="/" element={me.memberType === 'Actor' ? <StageLayout /> : me.isStaff ? <StaffHub /> : <MyEvents />} />
          {/* Ticket f455bb8c: non-staff admins asked for the roster too. */}
          {me.isAdmin && <Route path="/roster" element={<StaffHub />} />}
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/stage" element={<StageLayout />} />
          <Route path="/calendar" element={<Calendar />} />
          {/* The parents page is public, but crew need to open it too (sidebar). */}
          <Route path="/parents" element={<PublicParents inShell />} />
          <Route path="/tools" element={<Tools />} />
          {me.isAdmin && <Route path="/admin/events" element={<AdminEvents />} />}
          {me.isAdmin && <Route path="/admin/members" element={<AdminMembers />} />}
          {me.isAdmin && <Route path="/admin/emails" element={<EmailLog />} />}
          {me.isAdmin && <Route path="/admin/support" element={<Support />} />}
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
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
