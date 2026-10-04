import { useState } from 'react';
import { toast } from 'sonner';
import { setAttendance } from '#api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@project/components/ui/sheet';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import type { AdminData, AdminSubEvent } from '../../lib/useAdminData';
import { STATUS_STYLE, fmtDate } from '../../lib/constants';

type S = 'Expected Arrival' | 'Maybe' | 'Not Attending';

export default function AttendanceSheet({ ev, data, onClose, reload }: { ev: AdminSubEvent | null; data: AdminData; onClose: () => void; reload: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const att = new Map(data.attendance.filter((a) => a.subEventId === ev?.id).map((a) => [a.memberId, a]));
  const rows = data.members
    .filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q.toLowerCase()))
    .map((m) => ({ m, a: att.get(m.id) }));
  const count = (s: string) => rows.filter((r) => (r.a?.status ?? '') === s).length;

  const change = async (memberId: string, status: S) => {
    try { await setAttendance({ memberId, items: [{ subEventId: ev!.id, status, reason: status === 'Not Attending' ? 'Recorded by admin' : undefined }] }); await reload(); toast.success('Updated'); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Sheet open={!!ev} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {ev && (
          <>
            <SheetHeader>
              <SheetTitle>{ev.title}</SheetTitle>
              <SheetDescription>{ev.subtype} · {fmtDate(ev.date, ev.dateTbc)}</SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-4 gap-2 my-4 text-center">
              {[['Expected', 'Expected Arrival'], ['Maybe', 'Maybe'], ['Not', 'Not Attending'], ['Not in show', 'Not Attending Event']].map(([l, s]) => (
                <div key={s} className={`rounded-lg border p-2 ${STATUS_STYLE[s]}`}><div className="text-xl font-bold">{count(s)}</div><div className="text-[11px]">{l}</div></div>
              ))}
            </div>
            <Input placeholder="Search crew…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
            <div className="space-y-2">
              {rows.map(({ m, a }) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.firstName} {m.lastName}</p>
                    {a?.reason && <p className="text-xs text-muted-foreground truncate" title={a.reason}>{a.reason}</p>}
                    {a?.enteredByAdmin && <Badge variant="outline" className="text-[10px] mt-0.5">Entered by admin</Badge>}
                  </div>
                  {a?.status === 'Not Attending Event' ? (
                    <Badge variant="outline" className={STATUS_STYLE['Not Attending Event']}>Not in show</Badge>
                  ) : (
                    <Select value={a?.status || undefined} onValueChange={(v) => change(m.id, v as S)}>
                      <SelectTrigger className="w-40 h-8"><SelectValue placeholder="No reply" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Expected Arrival">Expected arrival</SelectItem>
                        <SelectItem value="Maybe">Maybe</SelectItem>
                        <SelectItem value="Not Attending">Not attending</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
