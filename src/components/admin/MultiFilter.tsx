import { useState } from 'react';
import { Button } from '@project/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

export type MultiFilterOption = { value: string; label: string };

/**
 * A multi-select dropdown used for the Crew page filters. Picking an option
 * keeps the menu open (onSelect is prevented) so several can be toggled
 * before closing it.
 */
export default function MultiFilter({
  label, options, selected, onChange,
}: {
  label: string;
  options: MultiFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  const summary = !selected.length
    ? label
    : selected.length === 1
      ? `${label}: ${labelFor(selected[0])}`
      : `${label}: ${selected.length} selected`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('justify-between gap-2 font-normal', selected.length > 0 && 'border-primary/50 text-primary')}>
          <SlidersHorizontal className="h-3.5 w-3.5 opacity-60" />
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onChange([]); }}>
              Clear {label.toLowerCase()}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
