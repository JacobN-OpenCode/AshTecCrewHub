import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveShow } from '#api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { DatePicker } from '@project/components/ui/date-picker';
import { type AdminShow, toIso, fromIso } from '../../lib/useAdminData';

export default function ShowDialog({ open, show, onClose, onSaved }: { open: boolean; show: AdminShow | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: '', code: '', description: '', dueDate: null as string | null, dueUnknown: true, hidden: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(show ? { name: show.name, code: show.code, description: show.description, dueDate: show.dueDate, dueUnknown: show.dueUnknown, hidden: !!show.hidden }
      : { name: '', code: '', description: '', dueDate: null, dueUnknown: true, hidden: false });
  }, [open, show]);

  const save = async () => {
    setBusy(true);
    try { const r = await adminSaveShow({ id: show?.id, ...f }); toast.success('Show saved'); onSaved(r.id); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{show ? 'Edit show' : 'New show'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1"><label className="text-sm">Name</label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="space-y-1"><label className="text-sm">Short code</label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="TAF" /></div>
          </div>
          <div className="space-y-1"><label className="text-sm">Description</label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="space-y-2">
            <label className="text-sm">Response due date (Yes / No / Maybe)</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.dueUnknown} onCheckedChange={(c) => setF({ ...f, dueUnknown: !!c })} />Unknown / to be confirmed</label>
            {!f.dueUnknown && <DatePicker value={fromIso(f.dueDate)} onChange={(d) => setF({ ...f, dueDate: toIso(d) })} />}
          </div>
          <div className="space-y-2">
            <label className="text-sm">Visibility</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.hidden} onCheckedChange={(c) => setF({ ...f, hidden: !!c })} />Hidden from members</label>
            <p className="text-xs text-muted-foreground">You can still see it in the admin area, and unhide it any time.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !f.name.trim()} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
