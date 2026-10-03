import { createContext, useContext } from 'react';
import type { GetMeOutputType } from 'zitejs/api';

export type Me = NonNullable<GetMeOutputType['member']>;
export const MeContext = createContext<{ me: Me; refreshMe: () => Promise<void>; supportAwaiting: number } | null>(null);
export const useMe = () => useContext(MeContext)!;
