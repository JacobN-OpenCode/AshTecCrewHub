/**
 * Ticket 1bbe2d65: the theme builder.
 *
 * A theme is a base set of colours (the page, the cards, the borders) plus a few
 * named palettes that swap the one colour everything is built on. They are plain
 * CSS variables, applied inline on <html>, which is why a theme can change the
 * whole app without a stylesheet per theme: the dark rule and the accent
 * preference both lose to an inline style.
 *
 * Light themes work the same way. The app still carries the `dark` class (four
 * `dark:` utilities and the backstage screens depend on it) but every colour we
 * care about is overridden by the inline variables, so a light theme still reads
 * light.
 */
export type Palette = {
  id: string;
  name: string;
  /** The colours this palette brings. Everything else comes from the theme. */
  vars: Record<string, string>;
};

export type Theme = {
  id: string;
  name: string;
  blurb: string;
  /** True for the ones that paint a light page rather than a dark one. */
  light: boolean;
  base: Record<string, string>;
  palettes: Palette[];
};

const DESTRUCTIVE = { '--destructive': '0 72% 52%', '--destructive-foreground': '0 0% 100%' };

/** A palette is mostly one colour, so build the bundle from it. */
function palette(
  id: string,
  name: string,
  primary: string,
  primaryFg: string,
  accent: string,
  accentFg: string,
): Palette {
  return {
    id,
    name,
    vars: {
      '--primary': primary,
      '--primary-foreground': primaryFg,
      '--ring': primary,
      '--accent': accent,
      '--accent-foreground': accentFg,
    },
  };
}

export const THEMES: Theme[] = [
  {
    id: 'ashtec',
    name: 'AshTec',
    blurb: 'The original. Ink and cream, warm amber edges.',
    light: false,
    base: {
      '--background': '230 22% 6%',
      '--foreground': '40 20% 94%',
      '--card': '230 20% 9%',
      '--card-foreground': '40 20% 94%',
      '--popover': '230 20% 9%',
      '--popover-foreground': '40 20% 94%',
      '--muted': '230 16% 13%',
      '--muted-foreground': '230 8% 62%',
      '--border': '230 14% 17%',
      '--input': '230 14% 20%',
      '--secondary': '230 16% 14%',
      '--secondary-foreground': '40 20% 94%',
      ...DESTRUCTIVE,
    },
    palettes: [
      palette('amber', 'Amber', '38 96% 56%', '230 30% 7%', '36 50% 16%', '38 95% 70%'),
      palette('ember', 'Ember', '0 72% 55%', '0 0% 100%', '0 45% 16%', '0 80% 78%'),
      palette('ivory', 'Ivory', '45 85% 68%', '40 40% 10%', '45 30% 18%', '45 90% 78%'),
    ],
  },
  {
    id: 'christmas',
    name: 'Christmas',
    blurb: 'Deep pine, gold lights, and a bit of red ribbon.',
    light: false,
    base: {
      '--background': '162 30% 7%',
      '--foreground': '45 35% 95%',
      '--card': '162 26% 10%',
      '--card-foreground': '45 35% 95%',
      '--popover': '162 26% 10%',
      '--popover-foreground': '45 35% 95%',
      '--muted': '162 20% 14%',
      '--muted-foreground': '150 10% 66%',
      '--border': '162 18% 19%',
      '--input': '162 18% 22%',
      '--secondary': '162 22% 15%',
      '--secondary-foreground': '45 35% 95%',
      ...DESTRUCTIVE,
    },
    palettes: [
      palette('holly', 'Holly', '150 55% 46%', '150 45% 6%', '150 40% 18%', '140 60% 78%'),
      palette('gold', 'Gold', '45 85% 60%', '40 60% 8%', '45 45% 18%', '45 90% 78%'),
      palette('berry', 'Berry', '350 68% 58%', '0 0% 100%', '350 40% 18%', '350 80% 80%'),
      palette('frost', 'Frost', '195 70% 62%', '200 55% 8%', '195 40% 18%', '195 80% 82%'),
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    blurb: 'The fancy one. Pale paper, pink and yellow, dark ink text.',
    light: true,
    base: {
      '--background': '40 30% 97%',
      '--foreground': '340 18% 12%',
      '--card': '0 0% 100%',
      '--card-foreground': '340 18% 12%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '340 18% 12%',
      '--muted': '30 20% 94%',
      '--muted-foreground': '340 8% 40%',
      '--border': '30 15% 87%',
      '--input': '30 15% 87%',
      '--secondary': '30 22% 94%',
      '--secondary-foreground': '340 18% 12%',
      ...DESTRUCTIVE,
    },
    palettes: [
      palette('blush', 'Blush', '340 75% 55%', '0 0% 100%', '340 80% 95%', '340 60% 28%'),
      palette('butter', 'Butter', '45 92% 55%', '40 60% 10%', '45 90% 93%', '40 70% 28%'),
      palette('peach', 'Peach', '20 85% 58%', '20 60% 10%', '20 85% 94%', '20 70% 28%'),
      palette('ink', 'Ink', '235 25% 22%', '0 0% 100%', '235 30% 94%', '235 40% 26%'),
    ],
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    blurb: 'The pale blue one, with the crew cat where the bear was.',
    light: true,
    base: {
      '--background': '205 45% 97%',
      '--foreground': '215 30% 15%',
      '--card': '0 0% 100%',
      '--card-foreground': '215 30% 15%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '215 30% 15%',
      '--muted': '205 35% 93%',
      '--muted-foreground': '212 12% 42%',
      '--border': '205 25% 88%',
      '--input': '205 25% 88%',
      '--secondary': '205 35% 94%',
      '--secondary-foreground': '215 30% 15%',
      ...DESTRUCTIVE,
    },
    palettes: [
      palette('sky', 'Sky', '205 85% 50%', '0 0% 100%', '200 70% 94%', '205 60% 26%'),
      palette('mint', 'Mint', '165 55% 40%', '0 0% 100%', '165 50% 94%', '165 60% 22%'),
      palette('slate', 'Slate', '215 25% 30%', '0 0% 100%', '215 25% 94%', '215 30% 24%'),
      palette('lilac', 'Lilac', '265 60% 58%', '0 0% 100%', '265 55% 95%', '265 45% 28%'),
    ],
  },
  {
    id: 'plum',
    name: 'Midnight plum',
    blurb: 'Very dark violet, for people who work late.',
    light: false,
    base: {
      '--background': '270 30% 8%',
      '--foreground': '280 20% 95%',
      '--card': '270 26% 11%',
      '--card-foreground': '280 20% 95%',
      '--popover': '270 26% 11%',
      '--popover-foreground': '280 20% 95%',
      '--muted': '270 20% 15%',
      '--muted-foreground': '275 10% 66%',
      '--border': '270 18% 20%',
      '--input': '270 18% 23%',
      '--secondary': '270 22% 16%',
      '--secondary-foreground': '280 20% 95%',
      ...DESTRUCTIVE,
    },
    palettes: [
      palette('violet', 'Violet', '265 70% 62%', '0 0% 100%', '265 40% 20%', '265 80% 82%'),
      palette('orchid', 'Orchid', '300 65% 62%', '0 0% 100%', '300 35% 20%', '300 80% 84%'),
      palette('teal', 'Teal', '175 60% 45%', '180 40% 6%', '175 35% 18%', '175 70% 78%'),
      palette('gold', 'Gold', '42 85% 58%', '40 60% 8%', '42 35% 18%', '42 90% 78%'),
    ],
  },
  {
    id: 'paper',
    name: 'Paper',
    blurb: 'Cream pages and quiet type. Closest to a printed programme.',
    light: true,
    base: {
      '--background': '42 35% 96%',
      '--foreground': '30 15% 15%',
      '--card': '45 40% 99%',
      '--card-foreground': '30 15% 15%',
      '--popover': '45 40% 99%',
      '--popover-foreground': '30 15% 15%',
      '--muted': '40 20% 91%',
      '--muted-foreground': '30 10% 40%',
      '--border': '38 18% 84%',
      '--input': '38 18% 84%',
      '--secondary': '40 22% 92%',
      '--secondary-foreground': '30 15% 15%',
      ...DESTRUCTIVE,
    },
    palettes: [
      palette('sepia', 'Sepia', '30 45% 35%', '40 40% 96%', '40 60% 92%', '30 50% 24%'),
      palette('forest', 'Forest', '150 40% 32%', '0 0% 100%', '150 30% 93%', '150 45% 22%'),
      palette('brick', 'Brick', '10 60% 45%', '0 0% 100%', '10 55% 94%', '10 60% 30%'),
      palette('navy', 'Navy', '220 45% 30%', '0 0% 100%', '220 40% 93%', '220 45% 24%'),
    ],
  },
];

export const findTheme = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const findPalette = (theme: Theme, id: string): Palette =>
  theme.palettes.find((p) => p.id === id) ?? theme.palettes[0];

/** The full set of variables one theme + palette asks for. */
export function themeVars(themeId: string, paletteId: string): Record<string, string> {
  const theme = findTheme(themeId);
  return { ...theme.base, ...findPalette(theme, paletteId).vars };
}
