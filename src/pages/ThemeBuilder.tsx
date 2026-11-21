/**
 * Ticket 1bbe2d65: the theme builder.
 *
 * Six base looks (the original, Christmas, the pink-and-yellow studio one, the
 * pale blue dashboard one, and two extras), each with three or four palettes,
 * plus room to name and keep five of your own. Changing one repaints this page
 * as you click, which is the preview.
 *
 * The saved choice is per browser: a shared school computer should not hand your
 * colour scheme to the next person who signs in.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Palette as PaletteIcon, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { cn } from '@project/components/lib/utils';
import { THEMES, findTheme, themeVars } from '../lib/themes';
import { MAX_SAVED, cacheServerThemes, getServerThemes, useTheme, type ServerTheme } from '../lib/theme';
import { customThemes as customThemesApi } from '../lib/api';
import { ask } from '../lib/dialogs';

/** Three dots: the page, the cards, and the one colour everything hangs off. */
function Swatches({ vars }: { vars: Record<string, string> }) {
  const dots = [vars['--background'], vars['--card'], vars['--primary']];
  return (
    <div className="flex items-center gap-1.5">
      {dots.map((dot, i) => (
        <span
          key={i}
          className="h-4 w-4 rounded-full border border-black/20"
          style={{ background: `hsl(${dot})` }}
        />
      ))}
    </div>
  );
}

function ThemeBuilder() {
  const { choice, choose, saved, save, remove, applySaved, applyServerTheme } = useTheme();
  const [name, setName] = useState('');
  const [made, setMade] = useState<ServerTheme[]>(() => getServerThemes());

  /**
   * Ticket 36b2cc84: themes an AI made for you arrive through the MCP
   * connection, so this page only ever reads them back. The list is cached so
   * the app can still paint your theme before the request returns.
   */
  const load = () => {
    customThemesApi({ action: 'list' })
      .then((r: any) => {
        cacheServerThemes(r?.themes ?? []);
        setMade(getServerThemes());
      })
      .catch(() => {});
  };
  useEffect(load, []);

  const dropMade = async (theme: ServerTheme) => {
    const yes = await ask({
      title: `Delete "${theme.name}"?`,
      body: 'It goes away for you. Nothing else on the site changes.',
      confirm: 'Delete theme',
      danger: true,
    });
    if (!yes) return;
    try {
      const r: any = await customThemesApi({ action: 'delete', id: theme.id });
      cacheServerThemes(r?.themes ?? []);
      setMade(getServerThemes());
      toast.success(`Deleted "${theme.name}".`);
    } catch {
      toast.error('That theme could not be deleted.');
    }
  };

  const isCustom = choice.theme === 'custom';
  const mine = isCustom
    ? (saved.find((s) => s.id === choice.palette) ?? made.find((m) => m.id === choice.palette))
    : undefined;
  const theme = findTheme(choice.theme);
  // Saving while one of your own looks is on keeps that look, not the built-in
  // theme sitting underneath it.
  const current = useMemo(
    () => (isCustom ? (mine?.vars ?? {}) : themeVars(choice.theme, choice.palette)),
    [isCustom, mine, choice],
  );
  const full = saved.length >= MAX_SAVED;

  const keep = () => {
    const clean = name.trim();
    if (!clean) {
      toast.error('Give it a name first, then it can be saved.');
      return;
    }
    save(clean, current);
    setName('');
    toast.success(`Saved as "${clean}". You can keep ${MAX_SAVED}.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <PaletteIcon className="h-6 w-6 text-primary" /> Themes
          </h1>
          <p className="text-muted-foreground">
            Five looks taken off the pins, plus the original. Each one changes the shell, the cards
            and the type, not just the colour. It moves as you click. Switch between light and dark
            mode from the theme controls in the app header.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            choose({ theme: 'ashtec', palette: 'amber' });
            toast.success('Back to the original.');
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Back to the original
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {THEMES.map((t) => {
          const selected = t.id === choice.theme;
          return (
            <button
              key={t.id}
              onClick={() => choose({ theme: t.id, palette: t.palettes[0].id })}
              className={cn(
                'rounded-2xl border bg-card p-4 text-left transition hover:border-primary/60',
                selected && 'ring-2 ring-primary',
              )}
              aria-pressed={selected}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{t.name}</span>
                {selected && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
              <p className="mt-2 text-xs text-muted-foreground/80">{t.from}</p>
              <div className="mt-3">
                <Swatches vars={themeVars(t.id, t.palettes[0].id)} />
              </div>
            </button>
          );
        })}
      </div>

      {isCustom && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-accent p-4 text-accent-foreground">
          <span className="text-sm">
            You are using <strong>{mine?.name ?? 'a saved look'}</strong>. Picking a theme or a
            colour below replaces it; the saved copy stays in the list.
          </span>
          <Button size="sm" variant="outline" onClick={() => choose({ theme: 'ashtec', palette: 'amber' })}>
            Original
          </Button>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Colours for {theme.name}</h2>
          <p className="text-sm text-muted-foreground">
            Same shell, different colour. Buttons, links, the calendar and the cat's collar follow it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {theme.palettes.map((p) => {
            const selected = p.id === choice.palette;
            return (
              <button
                key={p.id}
                onClick={() => choose({ theme: theme.id, palette: p.id })}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition hover:border-primary/60',
                  selected && 'border-primary bg-accent text-accent-foreground',
                )}
                aria-pressed={selected}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-black/20"
                  style={{ background: `hsl(${themeVars(theme.id, p.id)['--primary']})` }}
                />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Made for you</h2>
          <p className="text-sm text-muted-foreground">
            Themes an AI built for you through the crew hub's MCP connection. They are kept against
            your account and nobody else sees them. Ask gorkie in Slack for one, something like
            "make me a plum theme called Midnight", and it turns up here.
          </p>
        </div>
        {made.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing made for you yet.</p>
        ) : (
          <ul className="divide-y">
            {made.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-3">
                  <Swatches vars={s.vars} />
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">on {findTheme(s.base).name}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => applyServerTheme(s.id)}>
                    Use
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void dropMade(s);
                    }}
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Keep this look</h2>
          <p className="text-sm text-muted-foreground">
            {full
              ? `That is all ${MAX_SAVED}. Delete one to make room.`
              : `Name the colours you have picked and it stays here. ${MAX_SAVED - saved.length} of ${MAX_SAVED} left. A saved look keeps the colour only, not the shell.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Christmas but green"
            maxLength={40}
            className="max-w-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') keep();
            }}
          />
          <Button onClick={keep} disabled={full || !name.trim()}>
            <Save className="mr-2 h-4 w-4" /> Save
          </Button>
        </div>

        {saved.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
        ) : (
          <ul className="divide-y">
            {saved.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-3">
                  <Swatches vars={s.vars} />
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => applySaved(s.id)}>
                    Use
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      remove(s.id);
                      toast.success(`Deleted "${s.name}".`);
                    }}
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Looks you name here are kept in this browser only, so they do not follow you to another
        computer, and the next person on a shared machine gets their own back. Themes made for you
        are the other way round: they are on your account, so they follow you.
      </p>
    </div>
  );
}

export default ThemeBuilder;
