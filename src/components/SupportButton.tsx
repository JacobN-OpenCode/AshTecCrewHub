import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { submitSupport, type SubmitSupportInputType } from 'zitejs/api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Bug, LifeBuoy, Lightbulb, Loader2, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { SUPPORT_MESSAGE_MAX } from '../lib/emails';

type T = SubmitSupportInputType['type'];
const TYPES: { v: T; icon: typeof Bug; hint: string }[] = [
  { v: 'Bug Report', icon: Bug, hint: 'Something broken? Goes to the maintainers.' },
  { v: 'Feature Request', icon: Lightbulb, hint: 'An idea for the app. Goes to the maintainers.' },
  { v: 'General Support', icon: MessageCircleQuestion, hint: 'Help with crew stuff. Goes to student admins.' },
];

export default function SupportButton() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<T>('Bug Report');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = subject.trim().length >= 3 && message.trim().length >= 10;

  const send = async () => {
    setBusy(true);
    try {
      const r = await submitSupport({ type, subject, message, page: loc.pathname });
      toast.success(`Sent! ${r.notified} ${r.notified === 1 ? 'person was' : 'people were'} notified.`);
      setOpen(false); setSubject(''); setMessage('');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button data-tour="support" onClick={() => setOpen(true)} className="fixed bottom-4 left-4 z-40 rounded-full shadow-lg" size="sm">
        <LifeBuoy className="h-4 w-4 mr-1.5" />Help & feedback
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Help & feedback</DialogTitle>
            <DialogDescription>{TYPES.find((t) => t.v === type)?.hint}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button key={t.v} onClick={() => setType(t.v)}
                className={cn('rounded-xl border p-3 text-xs flex flex-col items-center gap-1.5 transition-colors',
                  type === t.v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <t.icon className="h-5 w-5" />{t.v}
              </button>
            ))}
          </div>
          <div className="space-y-1"><label className="text-sm">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Short summary" /></div>
          <div className="space-y-1"><label className="text-sm">Details</label>
            <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={SUPPORT_MESSAGE_MAX}
              placeholder={type === 'Bug Report' ? 'What happened, and what did you expect?' : 'Tell us more…'} />
            {message.length > 0 && message.trim().length < 10 && <p className="text-xs text-destructive">Please add a bit more detail.</p>}
            {message.length > 15000 && (
              <p className={cn('text-xs tabular-nums', message.length >= SUPPORT_MESSAGE_MAX ? 'text-destructive font-medium' : 'text-amber-400')}>
                {message.length} / {SUPPORT_MESSAGE_MAX}
                {message.length >= SUPPORT_MESSAGE_MAX ? ' — limit reached' : ''}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!valid || busy} onClick={send}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
