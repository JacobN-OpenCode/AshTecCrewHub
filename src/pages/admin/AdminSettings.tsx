import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveSettings, adminGetSupportSettings, adminSetSupportSettings } from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { Checkbox } from '@project/components/ui/checkbox';
import { Switch } from '@project/components/ui/switch';
import { Badge } from '@project/components/ui/badge';
import { Cat, GraduationCap, MessageCircle, Plus, Settings2, SlidersHorizontal, Tag, Trash2, X } from 'lucide-react';
import { useAppSettings, refreshAppSettings } from '../../lib/appSettings';
import {
  cleanSkillOptions, FEATURE_KEYS, FEATURE_LABELS, type Features, type CrewLists,
} from '../../lib/settings';

/**
 * The ATCMS settings hub (feedback round 2). One page for the knobs: how admin
 * pages look, branding, which parts of the app are on, the cat, the skill list,
 * the option lists every picker draws from, and the feedback forms.
 */
export default function AdminSettings() {
  const settings = useAppSettings();

  const [catName, setCatName] = useState(settings.catName);
  const [platformName, setPlatformName] = useState(settings.platformName);
  const [schoolName, setSchoolName] = useState(settings.schoolName);
  const [features, setFeatures] = useState<Features>(settings.features);
  const [lists, setLists] = useState<CrewLists>(settings.lists);
  const [skills, setSkills] = useState<string[]>(settings.skillOptions);
  const [skillsEditable, setSkillsEditable] = useState(settings.skillsEditable);
  const [newSkill, setNewSkill] = useState('');
  const [busy, setBusy] = useState('');
  // Tickets d1ae2a76 / 09b3e402 / 26239458: the site-wide default for support
  // email. Each member can override it in their own profile.
  const [summaryMode, setSummaryMode] = useState<'per-ticket' | 'daily'>('per-ticket');
  useEffect(() => {
    adminGetSupportSettings({}).then((r) => setSummaryMode(r.mode as 'per-ticket' | 'daily')).catch(() => {});
  }, []);
  const setDaily = async (daily: boolean) => {
    const prev = summaryMode;
    const mode = daily ? 'daily' : 'per-ticket';
    setSummaryMode(mode);
    try {
      await adminSetSupportSettings({ mode });
      toast.success(daily ? 'The default is now one daily summary' : 'The default is now an email per ticket');
    } catch (e) {
      setSummaryMode(prev);
      toast.error((e as Error).message);
    }
  };

  useEffect(() => { setCatName(settings.catName); }, [settings.catName]);
  useEffect(() => { setPlatformName(settings.platformName); }, [settings.platformName]);
  useEffect(() => { setSchoolName(settings.schoolName); }, [settings.schoolName]);
  useEffect(() => { setFeatures(settings.features); }, [settings.features]);
  useEffect(() => { setLists(settings.lists); }, [settings.lists]);
  useEffect(() => { setSkills(settings.skillOptions); }, [settings.skillOptions]);
  useEffect(() => { setSkillsEditable(settings.skillsEditable); }, [settings.skillsEditable]);

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

  const listNames: [keyof CrewLists, string][] = [
    ['roles', 'Roles'],
    ['years', 'Years'],
    ['memberTypes', 'Member types'],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Settings2 className="h-7 w-7 text-primary" /> ATCMS Settings
        </h1>
        <p className="mt-1 text-muted-foreground">The knobs for the whole crew hub, in one place.</p>
      </div>

      {/* Ticket 26239458: the cards-or-lists choice is a per-device preference, so
          it now lives in the member's own profile with the other device settings.
          This page is for the things that apply to everyone. */}

      {/* Support email default (tickets d1ae2a76 / 09b3e402 / 26239458) */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4 text-primary" /> Support email</h2>
        <label className="flex items-start justify-between gap-3 cursor-pointer">
          <span>
            <span className="block text-sm font-medium">Default: one daily summary instead of per-ticket email</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              This is only the default. Everyone can choose per-ticket or daily for themselves in their profile, and their choice wins.
              Off: a new ticket emails each maintainer straight away. On: one email a day listing the last day&apos;s tickets.
            </span>
          </span>
          <Switch checked={summaryMode === 'daily'} onCheckedChange={setDaily} aria-label="Default to one daily support summary" />
        </label>
      </section>

      {/* Branding */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Tag className="h-4 w-4 text-primary" /> Branding</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="platform">Platform name</Label><Input id="platform" value={platformName} onChange={(e) => setPlatformName(e.target.value)} maxLength={60} /></div>
          <div className="space-y-1"><Label htmlFor="school">School / crew name</Label><Input id="school" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} maxLength={80} /></div>
        </div>
        <Button disabled={busy === 'brand' || !platformName.trim() || !schoolName.trim()} onClick={() => save('brand', { platformName, schoolName }, 'Branding saved')}>
          {busy === 'brand' ? 'Saving…' : 'Save branding'}
        </Button>
      </section>

      {/* Features */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-primary" /> Features</h2>
        <p className="text-sm text-muted-foreground">Turn whole parts of the app off. A switch off hides the nav entry for everyone.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURE_KEYS.map((k) => (
            <label key={k} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
              <span>{FEATURE_LABELS[k]}</span>
              <Switch checked={features[k]} onCheckedChange={(v) => setFeatures((f) => ({ ...f, [k]: v }))} />
            </label>
          ))}
        </div>
        <Button disabled={busy === 'features'} onClick={() => save('features', { features }, 'Features saved')}>
          {busy === 'features' ? 'Saving…' : 'Save features'}
        </Button>
      </section>

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

      {/* Option lists */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Tag className="h-4 w-4 text-primary" /> Crew options</h2>
        <p className="text-sm text-muted-foreground">The lists every picker draws from. Removing one does not unassign it from anyone already set.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {listNames.map(([key, label]) => (
            <ListEditor
              key={key}
              label={label}
              values={lists[key]}
              onChange={(next) => setLists((l) => ({ ...l, [key]: next }))}
            />
          ))}
        </div>
        <Button disabled={busy === 'lists'} onClick={() => save('lists', { lists }, 'Option lists saved')}>
          {busy === 'lists' ? 'Saving…' : 'Save option lists'}
        </Button>
      </section>

      <div className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        <Badge variant="outline">Tip</Badge>
        Changes here apply to everyone, except the layout choice, which is yours alone.
      </div>
    </div>
  );
}

/** A small chip editor for one option list. */
function ListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...new Set([...values, v])]);
    setDraft('');
  };
  return (
    <div className="space-y-1.5 rounded-xl border p-3">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-muted-foreground hover:text-red-500" aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add…" className="h-8" />
        <Button size="sm" variant="outline" disabled={!draft.trim()} onClick={add}><Plus className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
