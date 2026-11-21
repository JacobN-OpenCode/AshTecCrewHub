import { ChevronDown, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ShellGroup } from './types';

export function AdminMenu({ groups }: { groups: ShellGroup[] }) {
  const items = groups.find((group) => group.label === 'Admin')?.items ?? [];
  if (!items.length) return null;

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-current/20 px-2.5 py-2 text-sm [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-4 w-4" />
        <span>Admin</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <nav aria-label="Admin options" className="absolute right-0 top-full z-50 mt-2 max-h-[min(70vh,32rem)] w-60 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={(event) => {
              const details = event.currentTarget.closest('details');
              if (details) details.open = false;
            }}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge ? <span className="rounded-full bg-primary/15 px-1.5 text-xs">{item.badge}</span> : null}
          </Link>
        ))}
      </nav>
    </details>
  );
}
