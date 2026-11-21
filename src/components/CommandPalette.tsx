import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@project/components/ui/command';

export type PaletteItem = {
  /** Stable unique key. */
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  /** Extra words that should match, e.g. an old name for a page. */
  keywords?: string;
  /** Where to go. Mutually exclusive with run, but if both are set, run wins. */
  to?: string;
  /** A quick function to perform instead of navigating. */
  run?: () => void;
  /** Right-aligned hint text, e.g. "Admin". */
  hint?: string;
  /** A crew member's picture, shown instead of the icon when present. */
  avatarUrl?: string;
};

/**
 * The whole-app search: pages, quick functions, events, shows and the crew.
 * Opened with Cmd/Ctrl-K or the search buttons. Pages and actions are built by
 * the shell; events and crew are fetched when it opens. cmdk filters what it is
 * given, so typing narrows every group at once.
 */
export default function CommandPalette({
  open, onOpenChange, items, loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  loading?: boolean;
}) {
  const nav = useNavigate();
  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, events, crew and actions..." />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading events and crew...
          </div>
        )}
        <CommandEmpty>No matches.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group} heading={group}>
            {items
              .filter((i) => i.group === group)
              .map((i) => (
                <CommandItem
                  key={i.id}
                  value={`${i.label} ${i.group} ${i.keywords ?? ''}`}
                  onSelect={() => {
                    onOpenChange(false);
                    if (i.run) i.run();
                    else if (i.to) nav(i.to);
                  }}
                >
                  <PaletteIcon item={i} />
                  <span className="truncate">{i.label}</span>
                  {i.hint && <span className="ml-auto pl-2 text-[10px] uppercase tracking-wider text-muted-foreground">{i.hint}</span>}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/** Crew members render their picture when they have one, otherwise the icon. */
function PaletteIcon({ item }: { item: PaletteItem }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [item.avatarUrl]);
  if (item.avatarUrl && !broken) {
    return (
      <img
        src={item.avatarUrl}
        alt=""
        onError={() => setBroken(true)}
        className="mr-2 h-4 w-4 shrink-0 rounded-full object-cover"
      />
    );
  }
  return <item.icon className="mr-2 h-4 w-4 shrink-0" />;
}
