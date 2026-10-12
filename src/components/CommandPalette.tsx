import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@project/components/ui/command';

export type PaletteItem = {
  to: string;
  label: string;
  group: string;
  icon: LucideIcon;
  /** Extra words that should match, e.g. an old name for a page. */
  keywords?: string;
};

/**
 * Jump-to-page search for the whole app. The real value is that navigation no
 * longer depends on spotting the right tab or group, which matters now the app
 * has this many destinations. Opened with Cmd/Ctrl-K or the search buttons.
 */
export default function CommandPalette({
  open, onOpenChange, items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
}) {
  const nav = useNavigate();
  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and jump to..." />
      <CommandList>
        <CommandEmpty>No matching page.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group} heading={group}>
            {items
              .filter((i) => i.group === group)
              .map((i) => (
                <CommandItem
                  key={i.to}
                  value={`${i.label} ${i.group} ${i.keywords ?? ''}`}
                  onSelect={() => {
                    onOpenChange(false);
                    nav(i.to);
                  }}
                >
                  <i.icon className="mr-2 h-4 w-4" />
                  {i.label}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
