import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Textarea } from '@project/components/ui/textarea';
import { wordCount } from '../lib/constants';

export default function ReasonDialog({
  open, title, onCancel, onSubmit, busy,
}: { open: boolean; title: string; onCancel: () => void; onSubmit: (reason: string) => void; busy?: boolean }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const n = wordCount(reason);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Please explain why you can’t attend (at least 8 words).</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I have a family event that weekend which was booked months ago" />
        <p className={`text-xs ${n >= 8 ? 'text-emerald-400' : 'text-muted-foreground'}`}>{n} / 8 words</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={n < 8 || busy} onClick={() => onSubmit(reason.trim())}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
