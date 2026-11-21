import type { ComponentType } from 'react';
import type { ShellProps } from './types';
import { Shell as PeriwinkleShell, Dash as PeriwinkleDash } from './periwinkle';
import { Shell as QuietShell, Dash as QuietDash } from './quiet';
import { Shell as IntellyShell, Dash as IntellyDash } from './intelly';
import { Shell as EducationShell, Dash as EducationDash } from './education';
import { Shell as CakeshopShell, Dash as CakeshopDash } from './cakeshop';

/**
 * Theme id to shell and home page. Anything not listed here uses the original
 * AshTec layout, which stays exactly as it was.
 */
export const SHELLS: Record<string, ComponentType<ShellProps>> = {
  periwinkle: PeriwinkleShell,
  quiet: QuietShell,
  intelly: IntellyShell,
  school: EducationShell,
  cakeshop: CakeshopShell,
};

export const DASHES: Record<string, ComponentType> = {
  periwinkle: PeriwinkleDash,
  quiet: QuietDash,
  intelly: IntellyDash,
  school: EducationDash,
  cakeshop: CakeshopDash,
};
