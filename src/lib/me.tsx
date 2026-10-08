import { createContext, useContext } from 'react';
import type { GetMeOutputType } from '#api';

export type Me = NonNullable<GetMeOutputType['member']>;
export const MeContext = createContext<{
  me: Me;
  refreshMe: () => Promise<void>;
  supportAwaiting: number;
  liveShowActive: boolean;
} | null>(null);
export const useMe = () => useContext(MeContext)!;
