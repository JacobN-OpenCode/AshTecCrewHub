import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getAnnouncements, saveAnnouncement, type GetAnnouncementsOutputType } from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { Switch } from '@project/components/ui/switch';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { useMe } from '../lib/me';
import { playSfx } from '../lib/sfx';
import { Megaphone, Pin, Plus, Pencil, Trash2, Loader2, X } from 'lucide-react';

type Item = GetAnnouncementsOutputType['items'][number];

const relTime = (iso: string) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Batch 7: the crew-wide announcements feed. Everyone reads it; admins post,
 * edit, pin and delete. Posting pushes the crew, so it lands somewhere it will
 * actually be seen rather than only in email.
 */
export default function Announcements() {
  const { me } = useMe();
  const [items, setItems] = useState<Item[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getAnnouncements({});
      setItems(r.items);
    } catch (e) {
      toast.error((e as Error).message);
      setItems([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    try { await saveAnnouncement({ id, remove: true }); toast.success('Announcement deleted'); await load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const togglePin = async (a: Item) => {
    try { await saveAnnouncement({ id: a.id, pinned: !a.pinned }); await load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (!items) return <div className="space-y-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>;

  return (
    <div className="space-y-6 hc-stagger">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Megaphone className="h-7 w-7 text-primary" />Announcements</h1>
          <p className="text-muted-foreground mt-1">Crew-wide notices. Everyone sees these, and new ones send a push.</p>
        </div>
        {me.isAdmin && !composing && !editing && (
          <Button onClick={() => setComposing(true)}><Plus className="mr-1 h-4 w-4" />New announcement</Button>
        )}
      </div>

      {me.isAdmin && (composing || editing) && (
        <Composer
          initial={editing}
          busy={busy}
          onCancel={() => { setComposing(false); setEditing(null); }}
          onSave={async (title, body, pinned) => {
            setBusy(true);
            try {
              await saveAnnouncement(editing ? { id: editing.id, title, body, pinned } : { title, body, pinned });
              playSfx(editing ? 'success' : 'badge');
              toast.success(editing ? 'Announcement updated' : 'Announcement posted');
              setComposing(false); setEditing(null);
              await load();
            } catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}
        />
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">
          <Megaphone className="mx-auto mb-2 h-7 w-7 opacity-60" />
          No announcements yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <article key={a.id} className={cn('rounded-2xl border bg-card p-5', a.pinned && 'border-primary/40 bg-primary/5')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {a.pinned && <Pin className="h-4 w-4 text-primary" />}{a.title}
                </h2>
                {me.isAdmin && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => void togglePin(a)} title={a.pinned ? 'Unpin' : 'Pin'}
                      className={cn('flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted/60', a.pinned ? 'text-primary' : 'text-muted-foreground')}>
                      <Pin className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => { setEditing(a); setComposing(false); }} title="Edit"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => void remove(a.id)} title="Delete"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{a.body}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                {a.authorName && <span className="font-medium">{a.authorName}</span>}
                <span aria-hidden>·</span>
                <span>{relTime(a.createdAt)}</span>
                {a.updatedAt && a.updatedAt !== a.createdAt && <Badge variant="outline" className="text-[10px]">edited</Badge>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Composer({ initial, busy, onSave, onCancel }: {
  initial: Item | null;
  busy: boolean;
  onSave: (title: string, body: string, pinned: boolean) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{initial ? 'Edit announcement' : 'New announcement'}</h2>
        <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="an-title">Title</Label>
        <Input id="an-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Costume fitting moved to Thursday" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="an-body">Message</Label>
        <Textarea id="an-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={10000} placeholder="What the crew needs to know." />
      </div>
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm font-medium">Pin to the top</span>
        <Switch checked={pinned} onCheckedChange={setPinned} aria-label="Pin to the top" />
      </label>
      <div className="flex gap-2">
        <Button disabled={busy || !title.trim() || !body.trim()} onClick={() => onSave(title, body, pinned)}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{initial ? 'Save changes' : 'Post announcement'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
