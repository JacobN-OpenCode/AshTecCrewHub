import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getDocuments, saveDocument, type GetDocumentsOutputType } from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { Skeleton } from '@project/components/ui/skeleton';
import { FileText, ExternalLink, Plus, Trash2, X, Loader2, Users, Link2 } from 'lucide-react';

type Doc = GetDocumentsOutputType['documents'][number];
type Person = GetDocumentsOutputType['people'][number];

const blank = { title: '', url: '', description: '', category: '', audience: 'crew' as 'crew' | 'members', memberIds: [] as string[] };

/**
 * Ticket 7958eb6c: the crew's documents page. Links only, with the poster
 * choosing whether the whole crew sees it or just the people named on it.
 *
 * Reading is open to everyone signed in; adding, editing and removing is for
 * staff and admins, which is what the ticket asked for.
 */
export default function Documents() {
  const [data, setData] = useState<GetDocumentsOutputType | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await getDocuments({}));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const people = data?.people ?? [];
  const picks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people.slice(0, 40);
    return people.filter((p) => p.name.toLowerCase().includes(q) || p.year.toLowerCase().includes(q)).slice(0, 40);
  }, [people, search]);

  const startNew = () => { setForm(blank); setEditingId(''); setComposing(true); };
  const startEdit = (d: Doc) => {
    setForm({
      title: d.title, url: d.url, description: d.description, category: d.category,
      audience: d.audience === 'crew' ? 'crew' : 'members', memberIds: [],
    });
    setEditingId(String(d.id));
    setComposing(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Give the document a name.'); return; }
    if (!form.url.trim()) { toast.error('Paste the link to the document.'); return; }
    if (form.audience !== 'crew' && form.memberIds.length === 0) {
      toast.error('Pick who can see it, or share it with the whole crew.');
      return;
    }
    setBusy(true);
    try {
      await saveDocument({
        ...(editingId ? { id: editingId } : {}),
        title: form.title,
        url: form.url,
        description: form.description,
        category: form.category,
        audience: form.audience,
        memberIds: form.audience === 'crew' ? [] : form.memberIds,
      });
      toast.success(editingId ? 'Saved.' : 'Added to Documents.');
      setComposing(false);
      setEditingId('');
      setSearch('');
      setForm(blank);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: Doc) => {
    setBusy(true);
    try {
      await saveDocument({ id: String(d.id), remove: true });
      toast.success('Removed.');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Links the crew needs: schedules, risk assessments, scripts, the lot. You only see what has been shared with you.
          </p>
        </div>
        {data?.canManage && !composing && (
          <Button onClick={startNew}><Plus className="mr-1.5 h-4 w-4" />Add a document</Button>
        )}
      </header>

      {composing && (
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{editingId ? 'Edit document' : 'New document'}</h2>
            <Button variant="ghost" size="sm" onClick={() => { setComposing(false); setEditingId(''); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Name</Label>
              <Input id="doc-title" value={form.title} maxLength={160} placeholder="Risk assessment - High School Musical"
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-cat">Category</Label>
              <Input id="doc-cat" value={form.category} maxLength={60} placeholder="Safety, Music, Schedules…"
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-url">Link</Label>
            <Input id="doc-url" value={form.url} maxLength={1000} placeholder="https://…"
              onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <p className="text-xs text-muted-foreground">Paste the address of the document. Only people who can see it here can open it from here.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-desc">Note (optional)</Label>
            <Textarea id="doc-desc" value={form.description} maxLength={1000} rows={2}
              placeholder="What it is, or what to do with it."
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Who can see it</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={form.audience === 'crew' ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, audience: 'crew', memberIds: [] })}>
                <Users className="mr-1.5 h-4 w-4" />The whole crew
              </Button>
              <Button type="button" size="sm" variant={form.audience === 'members' ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, audience: 'members' })}>
                <Link2 className="mr-1.5 h-4 w-4" />Only the people I pick
              </Button>
            </div>

            {form.audience === 'members' && (
              <div className="space-y-2 rounded-xl border p-3">
                {form.memberIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.memberIds.map((id) => {
                      const p = people.find((x) => x.id === id);
                      return (
                        <Badge key={id} variant="secondary" className="gap-1">
                          {p?.name ?? 'Someone'}
                          <button type="button" aria-label={`Remove ${p?.name ?? 'person'}`}
                            onClick={() => setForm({ ...form, memberIds: form.memberIds.filter((x) => x !== id) })}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <Input value={search} placeholder="Search the crew…" onChange={(e) => setSearch(e.target.value)} />
                <div className="max-h-48 overflow-y-auto">
                  {picks.map((p: Person) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={form.memberIds.includes(p.id)}
                        onChange={(e) => setForm({
                          ...form,
                          memberIds: e.target.checked ? [...form.memberIds, p.id] : form.memberIds.filter((x) => x !== p.id),
                        })}
                      />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{p.year}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void save()} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{editingId ? 'Save changes' : 'Add document'}
            </Button>
            <Button variant="outline" onClick={() => { setComposing(false); setEditingId(''); }}>Cancel</Button>
          </div>
        </section>
      )}

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      {!data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : data.documents.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing here yet.{data.canManage ? ' Add the first one.' : ' When a staff member shares something with you, it appears here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.documents.map((d: Doc) => (
            <li key={d.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{d.title}</span>
                    {d.category && <Badge variant="outline" className="text-xs">{d.category}</Badge>}
                  </p>
                  {d.description && <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.audience === 'crew' ? 'Everyone in the crew' : `Shared with ${d.sharedWith.join(', ') || 'chosen people'}`}
                    {d.createdByName ? ` · added by ${d.createdByName}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" asChild>
                    <a href={d.url} target="_blank" rel="noreferrer noopener">Open<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
                  </Button>
                  {data.canManage && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startEdit(d)}>Edit</Button>
                      <Button size="sm" variant="ghost" aria-label={`Remove ${d.title}`} disabled={busy} onClick={() => void remove(d)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
