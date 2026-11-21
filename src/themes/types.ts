import type { ReactNode } from 'react';

/**
 * The pieces every theme shell needs. Each theme gets the same data and the
 * same jobs (navigate, search, sign out) but decides for itself where the nav
 * lives, what it looks like and how much room the page gets.
 */
export type ShellUser = {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
};

export type ShellItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; live?: boolean };
export type ShellGroup = { label: string; items: ShellItem[] };

export type ShellProps = {
  groups: ShellGroup[];
  me: ShellUser;
  platformName: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSearch: () => void;
  onSignOut: () => void;
  memberViewToggle: ReactNode;
  children: ReactNode;
};

/** Every group flattened, for the themes that use one long list or a tab row. */
export function flatNav(groups: ShellGroup[]): ShellItem[] {
  return groups.flatMap((g) => g.items);
}

export function initials(first: string, last: string) {
  return `${(first || '?')[0] ?? ''}${(last || '')[0] ?? ''}`.toUpperCase();
}
