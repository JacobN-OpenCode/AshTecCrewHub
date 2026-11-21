import { Moon, Sun } from 'lucide-react';

export function ThemeModeToggle({ isDarkMode, onToggle, className = '' }: {
  isDarkMode: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = `Switch to ${isDarkMode ? 'light' : 'dark'} mode`;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={isDarkMode}
      className={className}
    >
      {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
