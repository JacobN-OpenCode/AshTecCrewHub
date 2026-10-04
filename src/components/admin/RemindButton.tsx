import { useState } from 'react';
import { toast } from 'sonner';
import { adminSendReminder } from '#api';
import { Button } from '@project/components/ui/button';
import { Loader2, Mail } from 'lucide-react';
import type { AdminData } from '../../lib/useAdminData';
import { pendingForms } from '../../lib/reminders';

export default function RemindButton({ memberId, data }: { memberId: string; data: AdminData }) {
  const [busy, setBusy] = useState(false);
  const mem = data.members.find((m) => m.id === memberId);
  const isActor = mem?.memberType === 'Actor' || !!mem?.isPreview;
  const pending = isActor ? [] : pendingForms(memberId, data);
  const send = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try { const r = await adminSendReminder({ memberId }); toast.success(`Reminder sent (${r.sent} form${r.sent > 1 ? 's' : ''})`); }
    catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Button size="sm" variant="outline" disabled={!pending.length || busy} onClick={send}
      title={pending.length ? `${pending.length} outstanding form(s) with a due date` : 'Nothing outstanding with a due date'}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
      <span className="ml-1.5 hidden lg:inline">Remind of all forms{pending.length ? ` (${pending.length})` : ''}</span>
    </Button>
  );
}
