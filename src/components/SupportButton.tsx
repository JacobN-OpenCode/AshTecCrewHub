import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { submitSupport, type SubmitSupportInputType } from '#api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Bug, ImagePlus, LifeBuoy, Lightbulb, Loader2, MessageCircleQuestion, X } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { SUPPORT_MESSAGE_MAX } from '../lib/emails';
import { useSupportCollapsed } from '../lib/uiPrefs';
import { uploadTicketImage } from '../lib/ticketImageUpload';

type T = SubmitSupportInputType['type'];
const TYPES: { v: T; icon: typeof Bug; hint: string }[] = [
  { v: 'Bug Report', icon: Bug, hint: 'Something broken? Goes to the maintainers.' },
  { v: 'Feature Request', icon: Lightbulb, hint: 'An idea for the app. Goes to the admins.' },
  { v: 'General Support', icon: MessageCircleQuestion, hint: 'Help with crew stuff. Goes to student admins.' },
];

export default function SupportButton() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<T>('Bug Report');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Ticket 5a04aaf1: pictures on a ticket. Uploaded as they are picked, so Send
  // only has to pass the paths along.
  const [pictures, setPictures] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [collapsed] = useSupportCollapsed();
  const valid = subject.trim().length >= 3 && message.trim().length >= 10;

  // The command palette can open this dialog from anywhere, so it fires a window
  // event rather than the two components knowing about each other.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener('ashtec:open-support', openIt);
    return () => window.removeEventListener('ashtec:open-support', openIt);
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      const r = await submitSupport({ type, subject, message, page: loc.pathname, attachments: pictures });
      toast.success(`Sent! ${r.notified} ${r.notified === 1 ? 'person was' : 'people were'} notified.`);
      setOpen(false); setSubject(''); setMessage(''); setPictures([]);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const addPictures = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const room = 4 - pictures.length;
      const picked = Array.from(files).slice(0, Math.max(0, room));
      if (Array.from(files).length > room) toast.error('Four pictures is the limit.');
      const urls: string[] = [];
      for (const f of picked) urls.push(await uploadTicketImage(f));
      setPictures((p) => [...p, ...urls].slice(0, 4));
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <>
      {collapsed ? (
        <Button
          data-tour="support"
          onClick={() => setOpen(true)}
          aria-label="Help & feedback"
          title="Help & feedback"
          className="app-fab fixed bottom-4 left-4 z-40 h-11 w-11 rounded-full shadow-lg p-0 lg:left-auto lg:right-4"
          size="icon"
        >
          <LifeBuoy className="h-5 w-5" />
        </Button>
      ) : (
        <Button data-tour="support" onClick={() => setOpen(true)} className="app-fab fixed bottom-4 left-4 z-40 rounded-full shadow-lg lg:left-auto lg:right-4" size="sm">
          <LifeBuoy className="h-4 w-4 mr-1.5" />Help & feedback
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
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
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm">Pictures <span className="text-muted-foreground">(optional, up to 4)</span></label>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
                onChange={(e) => addPictures(e.target.files)} />
              <Button type="button" variant="outline" size="sm" disabled={uploading || pictures.length >= 4}
                onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-1.5" />}
                {uploading ? 'Uploading…' : 'Add a picture'}
              </Button>
            </div>
            {pictures.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pictures.map((url) => (
                  <div key={url} className="relative h-16 w-16 overflow-hidden rounded-lg border">
                    <img src={url} alt="Attached picture" className="h-full w-full object-cover" />
                    <button type="button" aria-label="Remove this picture" title="Remove this picture"
                      onClick={() => setPictures((p) => p.filter((u) => u !== url))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 hover:bg-destructive/20">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">A screenshot of the problem is worth a thousand words.</p>
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
