import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveSettings } from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { Badge } from '@project/components/ui/badge';
import { Cat, GraduationCap, LayoutGrid, List, MessageSquareHeart, Plus, Settings2, Trash2, X } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { useAppSettings, refreshAppSettings } from '../../lib/appSettings';
import { cleanSkillOptions, type CustomFeedbackForm } from '../../lib/settings';
import { useAdminLayout } from '../../lib/uiPrefs';

/**
 * The ATCMS settings hub (feedback round 2). One page for the knobs that used to
 * be scattered: the cat's name, the skill list members pick from, and the
 * feedback forms an admin can create. Everything writes to the Settings table.
 */
export default function AdminSettings() {
  const settings = useAppSettings();
  const [layout, setLayout] = useAdminLayout();

  const [catName, setCatName] = useState(settings.catName);
  const [skills, setSkills] = useState<string[]>(settings.skillOptions);
  const [skillsEditable, setSkillsEditable] = useState(settings.skillsEditable);
  const [forms, setForms] = useState<CustomFeedbackForm[]>(settings.feedbackForms);
  const [newSkill, setNewSkill] = useState('');
  const [busy, setBusy] = useState('');

  // Keep the editors in step if the settings load after first paint.
  useEffect(() => { setCatName(settings.catName); }, [settings.catName]);
  useEffect(() => { setSkills(settings.skillOptions); }, [settings.skillOptions]);
  useEffect(() => { setSkillsEditable(settings.skillsEditable); }, [settings.skillsEditable]);
  useEffect(() => { setForms(settings.feedbackForms); }, [settings.feedbackForms]);

  const save = async (key: string, payload: Parameters<typeof adminSaveSettings>[0], msg: string) => {
    setBusy(key);
    try {
      await adminSaveSettings(payload);
      await refreshAppSettings();
      toast.success(msg);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(''); }
  };

  const addSkill = () => {
    const s = newSkill.trim();
    if (!s) return;
    setSkills((prev) => cleanSkillOptions([...prev, s]));
    setNewSkill('');
  };

  const addForm = () => setForms((prev) => [
    ...prev,
    { id: '', title: 'New feedback form', intro: '', prompts: [{ id: 'q1', label: 'What do you think?' }] },
  ]);

  const patchForm = (i: number, patch: Partial<CustomFeedbackForm>) =>
    setForms((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Settings2 className="h-7 w-7 text-primary" /> ATCMS settings
        </h1>
        <p className="mt-1 text-muted-foreground">The knobs for the whole crew hub, in one place.</p>
      </div>

      {/* Cat */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Cat className="h-4 w-4 text-primary" /> The cat</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={catName} onChange={(e) => setCatName(e.target.value)} maxLength={40} className="w-56" />
          </div>
          <Button disabled={busy === 'cat' || !catName.trim()} onClick={() => save('cat', { catName }, 'Cat renamed')}>
            {busy === 'cat' ? 'Saving…' : 'Save name'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Shows on the corner cat and the mascot page.</p>
      </section>

      {/* Skills */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><GraduationCap className="h-4 w-4 text-primary" /> Skills</h2>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium">
              {s}
              <button type="button" onClick={() => setSkills((prev) => prev.filter((x) => x !== s))} className="text-muted-foreground hover:text-red-500" aria-label={`Remove ${s}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} placeholder="Add a skill option" className="max-w-xs" />
          <Button variant="outline" disabled={!newSkill.trim()} onClick={addSkill}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={skillsEditable} onCheckedChange={(c) => setSkillsEditable(!!c)} />
          Members can edit their own skills
        </label>
        <Button disabled={busy === 'skills' || skills.length === 0} onClick={() => save('skills', { skillOptions: skills, skillsEditable }, 'Skills saved')}>
          {busy === 'skills' ? 'Saving…' : 'Save skills'}
        </Button>
      </section>

      {/* Feedback forms */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><MessageSquareHeart className="h-4 w-4 text-primary" /> Feedback forms</h2>
        <p className="text-sm text-muted-foreground">
          Create a freeform form and share its link: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/feedback/&lt;id&gt;</code>.
          The two built-in forms always stay.
        </p>
        {forms.length === 0 && <p className="text-sm text-muted-foreground">No custom forms yet.</p>}
        {forms.map((f, i) => (
          <div key={i} className="space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={f.title} onChange={(e) => patchForm(i, { title: e.target.value })} className="w-64" />
              </div>
              <div className="space-y-1">
                <Label>Link id</Label>
                <Input value={f.id} onChange={(e) => patchForm(i, { id: e.target.value })} placeholder="auto from title" className="w-40 font-mono" />
              </div>
              <Button size="icon" variant="ghost" className="ml-auto" onClick={() => setForms((prev) => prev.filter((_, idx) => idx !== i))} title="Remove form">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea value={f.intro} onChange={(e) => patchForm(i, { intro: e.target.value })} placeholder="Intro text shown at the top" rows={2} />
            <div className="space-y-1.5">
              {f.prompts.map((p, pi) => (
                <div key={pi} className="flex flex-wrap gap-2">
                  <Input value={p.label} onChange={(e) => patchForm(i, { prompts: f.prompts.map((x, xi) => xi === pi ? { ...x, label: e.target.value } : x) })} placeholder="Prompt" className="max-w-xs" />
                  <Input value={p.hint ?? ''} onChange={(e) => patchForm(i, { prompts: f.prompts.map((x, xi) => xi === pi ? { ...x, hint: e.target.value } : x) })} placeholder="Hint (optional)" className="max-w-xs" />
                  <Button size="icon" variant="ghost" disabled={f.prompts.length <= 1} onClick={() => patchForm(i, { prompts: f.prompts.filter((_, xi) => xi !== pi) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => patchForm(i, { prompts: [...f.prompts, { id: `q${f.prompts.length + 1}`, label: '' }] })}>
                <Plus className="h-4 w-4 mr-1" />Add prompt
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={addForm}><Plus className="h-4 w-4 mr-1" />New form</Button>
          <Button disabled={busy === 'forms'} onClick={() => save('forms', { feedbackForms: forms }, 'Feedback forms saved')}>
            {busy === 'forms' ? 'Saving…' : 'Save forms'}
          </Button>
        </div>
      </section>

      {/* Admin layout */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><LayoutGrid className="h-4 w-4 text-primary" /> Admin pages</h2>
        <p className="text-sm text-muted-foreground">How you like admin lists shown on this device. Cards by default.</p>
        <div className="flex gap-2">
          {([['cards', 'Cards', LayoutGrid], ['lists', 'Lists', List]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLayout(id)}
              className={cn('inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium', layout === id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        <Badge variant="outline">Tip</Badge>
        Changes here apply to everyone, except the layout choice, which is yours alone.
      </div>
    </div>
  );
}
