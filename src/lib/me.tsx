import { createContext, useContext } from 'react';
import type { GetMeOutputType } from '#api';

export type Me = NonNullable<GetMeOutputType['member']>;
export type Mentor = { id: string; firstName: string; lastName: string; email: string };
export const MeContext = createContext<{
  me: Me;
  mentor: Mentor | null;
  refreshMe: () => Promise<void>;
  supportAwaiting: number;
  liveShowActive: boolean;
  specialNote: string | null;
} | null>(null);
export const useMe = () => useContext(MeContext)!;
