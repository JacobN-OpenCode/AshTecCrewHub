import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminGetFeedback } from '#api';
import { Card, CardContent } from '@project/components/ui/card';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { Loader2, MessageSquareHeart, Users } from 'lucide-react';
import { getFeedbackForm, FEEDBACK_FORMS } from '../../lib/feedback';

type Response = {
  id: string;
  memberName: string;
  memberEmail: string;
  memberId: string;
  selected: string[];
  other: string;
  submittedAt: string;
};

/** Which forms exist, so the picker keeps working if a second one is added. */
const FORM_IDS = Object.keys(FEEDBACK_FORMS);

function when(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminFeedback() {
  const [formId, setFormId] = useState(FORM_IDS[0] ?? '1');
  const form = getFeedbackForm(formId);
  const [responses, setResponses] = useState<Response[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminGetFeedback({ form: formId })
      .then((r) => { if (alive) setResponses(r.responses); })
      .catch(() => { if (alive) setResponses([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [formId]);

  const labelOf = useMemo(() => {
    const map = new Map<string, string>();
    form?.sections.forEach((s) => s.features.forEach((f) => map.set(f.id, f.label)));
    return map;
  }, [form]);

  // The running tally: every feature, how many people wanted it, most wanted first.
  const tally = useMemo(() => {
    if (!form || !responses) return [];
    const counts = new Map<string, number>();
    for (const r of responses) for (const id of r.selected) counts.set(id, (counts.get(id) ?? 0) + 1);
    return form.sections.flatMap((s) =>
      s.features.map((f) => ({ ...f, section: s.title, emoji: s.emoji, count: counts.get(f.id) ?? 0 })),
    ).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [form, responses]);

  const maxCount = tally.length ? Math.max(1, ...tally.map((t) => t.count)) : 1;
  const notes = (responses ?? []).filter((r) => r.other.trim());

  if (!form) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Feedback</h1>
        <Card><CardContent className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />No feedback forms are defined.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feedback</h1>
          <p className="mt-1 text-muted-foreground">
            What the crew wants you to build next. {form.fromName} invited them from{' '}
            <Link to={`/feedback/${form.id}`} className="underline">/feedback/{form.id}</Link>.
          </p>
        </div>
        {FORM_IDS.length > 1 && (
          <select
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {FORM_IDS.map((id) => <option key={id} value={id}>{getFeedbackForm(id)?.title ?? id}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (responses ?? []).length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-12 text-center">
            <MessageSquareHeart className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="font-medium">No answers yet</p>
            <p className="text-sm text-muted-foreground">
              When someone fills in the form, their picks and their own words show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {responses!.length} {responses!.length === 1 ? 'person has' : 'people have'} answered
            {notes.length > 0 && <> · {notes.length} left a note</>}
          </div>

          {/* Most wanted first: the build list, ranked. */}
          <Card>
            <CardContent className="space-y-3 py-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">The running tally</div>
              <div className="space-y-1.5">
                {tally.filter((t) => t.count > 0).map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-sm" title={t.label}>{t.label}</div>
                    <div className="h-5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(6, (t.count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <div className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{t.count}</div>
                  </div>
                ))}
                {tally.every((t) => t.count === 0) && (
                  <p className="text-sm text-muted-foreground">Nobody picked any options — see the notes below.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Everyone's own words, because that is where the good ideas hide. */}
          {notes.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In their own words</div>
              {notes.map((r) => (
                <Card key={`note-${r.id}`}>
                  <CardContent className="space-y-1 py-4">
                    <div className="text-sm font-medium">{r.memberName || r.memberEmail} <span className="font-normal text-muted-foreground">· {when(r.submittedAt)}</span></div>
                    <p className="whitespace-pre-wrap text-sm italic text-foreground/90">{r.other}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Every answer</div>
            {responses!.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium">{r.memberName || r.memberEmail || 'A crew member'}</div>
                    <div className="text-xs text-muted-foreground">{when(r.submittedAt)}{r.memberEmail ? ` · ${r.memberEmail}` : ''}</div>
                  </div>
                  {r.selected.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {r.selected.map((id) => (
                        <Badge key={id} variant="secondary" className="font-normal">{labelOf.get(id) ?? id}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Picked nothing.</p>
                  )}
                  {r.other.trim() && <p className="whitespace-pre-wrap text-sm italic text-foreground/90">{r.other}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
