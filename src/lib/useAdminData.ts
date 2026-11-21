import { useCallback, useEffect, useState } from 'react';
import { adminGetData, type AdminGetDataOutputType } from '#api';

export type AdminData = AdminGetDataOutputType;
export type AdminMember = AdminData['members'][number];
export type AdminShow = AdminData['shows'][number];
export type AdminSubEvent = AdminData['subEvents'][number];

export function useAdminData() {
  const [data, setData] = useState<AdminData | null>(null);
  const reload = useCallback(async () => setData(await adminGetData({})), []);
  useEffect(() => { reload(); }, [reload]);

  /** Merge fields into one already-loaded member, for optimistic toggles. */
  const patchMember = useCallback((id: string, patch: Partial<AdminMember>) => {
    setData((d) => (d ? { ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : d));
  }, []);

  return { data, reload, patchMember };
}

export const toIso = (d?: Date) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
export const fromIso = (s: string | null) => (s ? new Date(s + 'T12:00:00') : undefined);
