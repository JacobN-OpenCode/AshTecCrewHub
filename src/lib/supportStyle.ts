export const TYPE_STYLE: Record<string, string> = {
  'Bug Report': 'border-red-500/40 text-red-400',
  'Feature Request': 'border-violet-500/40 text-violet-400',
  'General Support': 'border-sky-500/40 text-sky-400',
};

export const STATUS_STYLE: Record<string, string> = {
  Open: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'In Progress': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Closed: 'bg-muted text-muted-foreground',
};

/** Ticket de51f9e1: how urgent a report is, worst first. */
export const SEVERITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_STYLE: Record<string, string> = {
  Low: 'border-slate-500/40 text-slate-300',
  Medium: 'border-amber-500/40 text-amber-400',
  High: 'border-orange-500/50 text-orange-400',
  Urgent: 'border-red-500/60 bg-red-500/15 text-red-400',
};

export const REPLY_KIND_STYLE: Record<string, string> = {
  'To User': 'border-blue-500/40 text-blue-400',
  'Internal Note': 'border-yellow-500/40 text-yellow-400',
  'From User': 'border-emerald-500/40 text-emerald-400',
};
