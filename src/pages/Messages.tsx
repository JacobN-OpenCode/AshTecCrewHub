import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  getConversations, getThread, sendMessage, getMessageDirectory,
  type GetConversationsOutputType, type GetThreadOutputType, type GetMessageDirectoryOutputType,
} from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import MemberAvatar from '../components/MemberAvatar';
import { useMe } from '../lib/me';
import { MessageSquarePlus, SendHorizontal, ArrowLeft, Search, MessagesSquare } from 'lucide-react';

type Conversation = GetConversationsOutputType['conversations'][number];
type Thread = GetThreadOutputType;
type DirPerson = GetMessageDirectoryOutputType['people'][number];

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
};

const relTime = (iso: string) => {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Batch 7: direct messages between crew members. A conversation list plus a
 * thread, with a picker for starting a new one. It polls rather than holding a
 * socket, which is plenty for a crew and keeps the server simple. Scoped to the
 * caller: the endpoints only ever return your own pairs.
 */
export default function Messages() {
  const { me, refreshMe } = useMe();
  const [params, setParams] = useSearchParams();
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [dir, setDir] = useState<DirPerson[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);

  const other = params.get('to') ?? '';

  const loadConvs = useCallback(async () => {
    try {
      const r = await getConversations({});
      setConvs(r.conversations);
    } catch (e) { toast.error((e as Error).message); setConvs([]); }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    if (!id) { setThread(null); return; }
    try { setThread(await getThread({ memberId: id })); }
    catch (e) { toast.error((e as Error).message); setThread(null); }
  }, []);

  useEffect(() => { void loadConvs(); }, [loadConvs]);
  useEffect(() => { void loadThread(other); }, [other, loadThread]);

  // Poll the list so new threads and unread counts appear; poll the open thread
  // so the other person's replies show up.
  useEffect(() => {
    const a = window.setInterval(() => void loadConvs(), 15000);
    return () => window.clearInterval(a);
  }, [loadConvs]);
  useEffect(() => {
    if (!other) return;
    const b = window.setInterval(() => void loadThread(other), 6000);
    return () => window.clearInterval(b);
  }, [other, loadThread]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages.length, other]);

  const openPicker = async () => {
    setPicking(true);
    if (!dir) {
      try { const r = await getMessageDirectory({}); setDir(r.people); }
      catch (e) { toast.error((e as Error).message); setDir([]); }
    }
  };

  const openWith = (id: string) => {
    setPicking(false);
    setQuery('');
    const next = new URLSearchParams(params);
    next.set('to', id);
    setParams(next, { replace: false });
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !other) return;
    setSending(true);
    try {
      await sendMessage({ toId: other, body });
      setDraft('');
      await loadThread(other);
      await loadConvs();
      void refreshMe();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  const filteredDir = useMemo(() => {
    if (!dir) return [];
    const q = query.trim().toLowerCase();
    return (q ? dir.filter((p) => p.name.toLowerCase().includes(q)) : dir).slice(0, 60);
  }, [dir, query]);

  const activeName = thread?.member.name ?? (convs?.find((c) => c.memberId === other)?.name ?? '');

  return (
    <div className="space-y-6 hc-stagger">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><MessagesSquare className="h-7 w-7 text-primary" />Messages</h1>
          <p className="text-muted-foreground mt-1">Private messages between crew. Only you and the other person can see them.</p>
        </div>
        <Button onClick={openPicker}><MessageSquarePlus className="mr-1 h-4 w-4" />New message</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <div className={cn('rounded-2xl border bg-card', other && 'hidden lg:block')}>
          {convs === null ? (
            <div className="space-y-2 p-3"><Skeleton className="h-14 rounded-xl" /><Skeleton className="h-14 rounded-xl" /><Skeleton className="h-14 rounded-xl" /></div>
          ) : convs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No conversations yet. Start one with “New message”.</p>
          ) : (
            <ul className="divide-y">
              {convs.map((c) => {
                const { firstName, lastName } = splitName(c.name);
                return (
                  <li key={c.memberId}>
                    <button type="button" onClick={() => openWith(c.memberId)}
                      className={cn('flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50', c.memberId === other && 'bg-muted/60')}>
                      <MemberAvatar url={c.avatarUrl} firstName={firstName} lastName={lastName} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{c.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{relTime(c.lastAt)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className="truncate text-xs text-muted-foreground">{c.lastFromMe ? 'You: ' : ''}{c.lastBody}</span>
                          {c.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{c.unread}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Thread */}
        <div className={cn('flex min-h-[60vh] flex-col rounded-2xl border bg-card', !other && 'hidden lg:flex')}>
          {!other ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
              <MessagesSquare className="h-8 w-8 opacity-50" />
              <p>Pick a conversation, or start a new one.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <button type="button" className="lg:hidden" onClick={() => { const n = new URLSearchParams(params); n.delete('to'); setParams(n); }}>
                  <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <span className="text-sm font-semibold">{activeName || 'Conversation'}</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {thread === null ? (
                  <div className="space-y-2"><Skeleton className="h-10 w-2/3 rounded-2xl" /><Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" /></div>
                ) : thread.messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Say hello 👋</p>
                ) : (
                  thread.messages.map((msg) => (
                    <div key={msg.id} className={cn('flex', msg.fromMe ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', msg.fromMe ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        <span className={cn('mt-1 block text-[10px]', msg.fromMe ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{relTime(msg.at)}</span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottom} />
              </div>
              <div className="flex items-end gap-2 border-t p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder="Write a message…"
                  maxLength={4000}
                />
                <Button onClick={() => void send()} disabled={sending || !draft.trim()} aria-label="Send">
                  <SendHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {picking && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-20" role="dialog" aria-modal="true" aria-label="New message">
          <button type="button" aria-label="Close" onClick={() => setPicking(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl border bg-background p-4 shadow-2xl">
            <h2 className="mb-3 text-lg font-semibold">New message</h2>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the crew…" className="pl-9" autoFocus />
            </div>
            <div className="max-h-80 overflow-y-auto">
              {dir === null ? (
                <div className="space-y-2 p-2"><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /></div>
              ) : filteredDir.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">Nobody matches.</p>
              ) : (
                <ul>
                  {filteredDir.map((p) => {
                    const { firstName, lastName } = splitName(p.name);
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => openWith(p.id)} disabled={p.id === me.id}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60 disabled:opacity-40">
                          <MemberAvatar url={p.avatarUrl} firstName={firstName} lastName={lastName} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{p.name}{p.id === me.id ? ' (you)' : ''}</span>
                            {p.year && <span className="block text-xs text-muted-foreground">{p.year}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
