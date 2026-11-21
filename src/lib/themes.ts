/**
 * Ticket 1bbe2d65, second attempt.
 *
 * The first version only swapped colour variables, and that was not what the
 * pins showed: each one is a whole interface, with its own shell, its own card
 * language and its own type. So a theme here is more than a palette. The
 * variables below only carry colour; `data-theme` on <html> carries the rest
 * (sidebar, cards, type, texture, header band) and the rules live in index.css.
 *
 * Five themes come straight off the five pins. `ashtec` is the original and is
 * deliberately left alone.
 */

export type Vars = Record<string, string>;

export interface Palette {
  id: string;
  name: string;
  blurb: string;
  /** Only what changes between palettes inside the same theme. */
  over: Vars;
}

export interface Theme {
  id: string;
  name: string;
  /** One line for the picker card. */
  blurb: string;
  /** Where the look came from, so it is obvious this is a retheme and not a tint. */
  from: string;
  base: Vars;
  palettes: Palette[];
}

const DESTRUCTIVE: Vars = {
  '--destructive': '0 72% 52%',
  '--destructive-foreground': '0 0% 100%',
};

const palette = (id: string, name: string, blurb: string, over: Vars): Palette => ({ id, name, blurb, over });

export const THEMES: Theme[] = [
  {
    id: 'ashtec',
    name: 'AshTec',
    blurb: 'The original. Ink and cream, warm amber edges.',
    from: 'Where the app started: dark, quiet, out of the way of the work.',
    base: {
      ...DESTRUCTIVE,
      '--background': '230 22% 6%',
      '--foreground': '40 20% 94%',
      '--card': '230 20% 9%',
      '--card-foreground': '40 20% 94%',
      '--popover': '230 20% 9%',
      '--popover-foreground': '40 20% 94%',
      '--primary': '38 96% 56%',
      '--primary-foreground': '230 30% 7%',
      '--secondary': '230 16% 14%',
      '--secondary-foreground': '40 20% 94%',
      '--muted': '230 16% 13%',
      '--muted-foreground': '230 8% 62%',
      '--accent': '36 50% 16%',
      '--accent-foreground': '38 95% 70%',
      '--border': '230 14% 17%',
      '--input': '230 14% 20%',
      '--ring': '38 96% 56%',
      '--ink': '40 20% 94%',
      '--tint-1': '230 18% 13%',
      '--tint-2': '230 18% 16%',
      '--tint-3': '230 18% 19%',
      '--tint-4': '230 18% 22%',
    },
    palettes: [
      palette('amber', 'Amber', 'The one everybody knows.', {}),
      palette('ember', 'Ember', 'Warmer, closer to a stage light.', { '--primary': '18 90% 58%', '--ring': '18 90% 58%', '--primary-foreground': '20 40% 8%' }),
      palette('ivory', 'Ivory', 'Paler edges, same dark room.', { '--primary': '40 30% 92%', '--primary-foreground': '230 30% 8%', '--ring': '40 30% 92%' }),
    ],
  },

  {
    id: 'periwinkle',
    name: 'Periwinkle',
    blurb: 'Icon rail, white cards, a greeting and a bear.',
    from: 'The bold web-layout pin: pastel dashboard, icon-only rail, one wide card that says hello, notifications down the side.',
    base: {
      ...DESTRUCTIVE,
      '--background': '232 55% 95%',
      '--foreground': '234 30% 18%',
      '--card': '0 0% 100%',
      '--card-foreground': '234 30% 18%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '234 30% 18%',
      '--primary': '4 76% 60%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '232 45% 90%',
      '--secondary-foreground': '234 30% 20%',
      '--muted': '232 42% 92%',
      '--muted-foreground': '234 16% 44%',
      '--accent': '232 46% 88%',
      '--accent-foreground': '234 30% 20%',
      '--border': '232 38% 87%',
      '--input': '232 38% 82%',
      '--ring': '4 76% 60%',
      '--ink': '234 34% 22%',
      '--tint-1': '232 62% 94%',
      '--tint-2': '350 78% 94%',
      '--tint-3': '45 92% 90%',
      '--tint-4': '160 55% 90%',
    },
    palettes: [
      palette('coral', 'Coral', 'Red buttons on blue. Straight off the pin.', {}),
      palette('cobalt', 'Cobalt', 'Everything blue, quieter.', { '--primary': '228 68% 56%', '--ring': '228 68% 56%' }),
      palette('violet', 'Violet', 'The same shapes, colder.', { '--primary': '268 62% 60%', '--ring': '268 62% 60%' }),
    ],
  },

  {
    id: 'quiet',
    name: 'Quiet',
    blurb: 'Cream paper, sage, serifs, and a line of pines.',
    from: 'The writing-app pin: cream and sage, a hand-drawn forest across the top, serif headings, everything calmer and slower.',
    base: {
      ...DESTRUCTIVE,
      '--background': '42 30% 95%',
      '--foreground': '150 12% 20%',
      '--card': '44 40% 98%',
      '--card-foreground': '150 12% 20%',
      '--popover': '44 40% 98%',
      '--popover-foreground': '150 12% 20%',
      '--primary': '145 20% 34%',
      '--primary-foreground': '44 40% 98%',
      '--secondary': '100 16% 88%',
      '--secondary-foreground': '150 14% 22%',
      '--muted': '90 14% 90%',
      '--muted-foreground': '150 8% 42%',
      '--accent': '96 20% 86%',
      '--accent-foreground': '150 16% 22%',
      '--border': '60 14% 84%',
      '--input': '60 12% 80%',
      '--ring': '145 20% 40%',
      '--ink': '150 16% 24%',
      '--tint-1': '100 22% 90%',
      '--tint-2': '40 32% 93%',
      '--tint-3': '150 14% 88%',
      '--tint-4': '20 26% 92%',
    },
    palettes: [
      palette('sage', 'Sage', 'Green on cream. The pin exactly.', {}),
      palette('moss', 'Moss', 'Deeper, more forest.', { '--primary': '120 18% 28%', '--ring': '120 18% 34%' }),
      palette('clay', 'Clay', 'Warm brown instead of green.', { '--primary': '18 30% 44%', '--ring': '18 30% 48%' }),
    ],
  },

  {
    id: 'intelly',
    name: 'Intelly',
    blurb: 'Black sidebar, pastel cards, black pill buttons.',
    from: 'The healthcare-dashboard pin: black labelled sidebar, cream page, butter and lilac card fills, tight serif headings, a timeline down the right.',
    base: {
      ...DESTRUCTIVE,
      '--background': '40 28% 94%',
      '--foreground': '220 8% 14%',
      '--card': '44 70% 92%',
      '--card-foreground': '220 8% 14%',
      '--popover': '40 32% 97%',
      '--popover-foreground': '220 8% 14%',
      '--primary': '220 9% 12%',
      '--primary-foreground': '40 32% 97%',
      '--secondary': '44 55% 90%',
      '--secondary-foreground': '220 8% 16%',
      '--muted': '40 20% 90%',
      '--muted-foreground': '220 6% 40%',
      '--accent': '340 60% 92%',
      '--accent-foreground': '220 8% 16%',
      '--border': '40 12% 82%',
      '--input': '40 12% 78%',
      '--ring': '220 9% 20%',
      '--ink': '220 10% 12%',
      '--tint-1': '46 90% 88%',
      '--tint-2': '340 70% 92%',
      '--tint-3': '150 32% 88%',
      '--tint-4': '265 45% 92%',
    },
    palettes: [
      palette('butter', 'Butter', 'Yellow cards on cream, black type.', {}),
      palette('rose', 'Rose', 'Pink cards, same black sidebar.', { '--card': '342 68% 93%', '--accent': '46 90% 88%' }),
      palette('lilac', 'Lilac', 'The colder of the three.', { '--card': '265 48% 93%', '--accent': '150 32% 88%' }),
    ],
  },

  {
    id: 'school',
    name: 'School',
    blurb: 'A white shell floating on pink and mint.',
    from: 'The online-education pin: everything sits in one big rounded white shell, mint and pink behind it, filled stat cards with a circular arrow in the corner.',
    base: {
      ...DESTRUCTIVE,
      '--background': '340 60% 96%',
      '--foreground': '250 20% 18%',
      '--card': '0 0% 100%',
      '--card-foreground': '250 20% 18%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '250 20% 18%',
      '--primary': '342 72% 60%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '160 45% 90%',
      '--secondary-foreground': '250 20% 20%',
      '--muted': '250 20% 94%',
      '--muted-foreground': '250 10% 45%',
      '--accent': '160 50% 88%',
      '--accent-foreground': '250 20% 20%',
      '--border': '250 22% 91%',
      '--input': '250 18% 86%',
      '--ring': '342 72% 60%',
      '--ink': '250 24% 22%',
      '--tint-1': '160 55% 88%',
      '--tint-2': '342 78% 92%',
      '--tint-3': '46 95% 88%',
      '--tint-4': '265 50% 92%',
    },
    palettes: [
      palette('blossom', 'Blossom', 'Pink buttons, mint behind.', {}),
      palette('mint', 'Mint', 'Green buttons, calmer.', { '--primary': '160 45% 42%', '--ring': '160 45% 42%' }),
      palette('lemon', 'Lemon', 'Bright, a bit loud.', { '--primary': '42 90% 52%', '--primary-foreground': '250 24% 16%', '--ring': '42 90% 52%' }),
    ],
  },

  {
    id: 'cakeshop',
    name: 'Cakeshop',
    blurb: 'Cream paper, red ribbon, pale blue cards, dots.',
    from: 'The cake-shop branding pin: cream card stock, hand-lettered headings, a red accent, pale blue panels and a halftone dot texture.',
    base: {
      ...DESTRUCTIVE,
      '--background': '40 50% 94%',
      '--foreground': '20 22% 18%',
      '--card': '202 42% 92%',
      '--card-foreground': '215 25% 18%',
      '--popover': '40 50% 97%',
      '--popover-foreground': '20 22% 18%',
      '--primary': '355 68% 52%',
      '--primary-foreground': '40 50% 98%',
      '--secondary': '40 40% 88%',
      '--secondary-foreground': '20 22% 20%',
      '--muted': '40 32% 90%',
      '--muted-foreground': '20 12% 42%',
      '--accent': '202 42% 86%',
      '--accent-foreground': '215 25% 20%',
      '--border': '20 20% 80%',
      '--input': '20 18% 78%',
      '--ring': '355 68% 52%',
      '--ink': '20 25% 22%',
      '--tint-1': '202 42% 90%',
      '--tint-2': '40 48% 90%',
      '--tint-3': '355 48% 92%',
      '--tint-4': '20 26% 90%',
    },
    palettes: [
      palette('cherry', 'Cherry', 'Red ribbon on cream.', {}),
      palette('cocoa', 'Cocoa', 'Brown instead of red.', { '--primary': '22 35% 34%', '--ring': '22 35% 40%' }),
      palette('vanilla', 'Vanilla', 'Gold, softer.', { '--primary': '40 55% 58%', '--primary-foreground': '20 25% 16%', '--ring': '40 55% 58%' }),
    ],
  },

  {
    id: 'opening-night',
    name: 'Opening Night',
    blurb: 'House lights down, one gold spot, red velvet at the edges.',
    from: 'The High School Musical Jr ticket: the auditorium before curtain-up, a gold marquee, a lit stage and a playbill for every card.',
    base: {
      ...DESTRUCTIVE,
      '--background': '270 32% 9%',
      '--foreground': '40 28% 94%',
      '--card': '272 24% 13%',
      '--card-foreground': '40 28% 94%',
      '--popover': '272 26% 12%',
      '--popover-foreground': '40 28% 94%',
      '--primary': '43 92% 58%',
      '--primary-foreground': '270 40% 8%',
      '--secondary': '272 22% 18%',
      '--secondary-foreground': '40 26% 92%',
      '--muted': '272 20% 16%',
      '--muted-foreground': '272 12% 70%',
      '--accent': '340 52% 22%',
      '--accent-foreground': '340 88% 82%',
      '--border': '272 18% 23%',
      '--input': '272 18% 27%',
      '--ring': '43 92% 58%',
      '--ink': '40 28% 94%',
      '--tint-1': '272 24% 18%',
      '--tint-2': '43 45% 20%',
      '--tint-3': '340 42% 22%',
      '--tint-4': '200 32% 20%',
    },
    palettes: [
      palette('marquee', 'Marquee', 'Gold bulbs, plum house.', {}),
      palette('curtain', 'Curtain', 'Red velvet buttons instead of gold.', {
        '--primary': '352 72% 56%',
        '--primary-foreground': '0 0% 100%',
        '--ring': '352 72% 56%',
      }),
      palette('spotlight', 'Spotlight', 'House lights up: warm white buttons.', {
        '--primary': '42 44% 92%',
        '--primary-foreground': '270 40% 10%',
        '--ring': '42 44% 92%',
      }),
    ],
  },

  {
    id: 'christmas',
    name: 'Christmas',
    blurb: 'Pine and snow behind, holly red and gold in front, baubles across the top.',
    from: 'The theme ticket that asked for red, green and gold everywhere: an evergreen page, gold-edged cards with a red ribbon, and tree decorations hanging over the whole app.',
    base: {
      ...DESTRUCTIVE,
      '--background': '158 30% 9%',
      '--foreground': '40 38% 95%',
      '--card': '158 26% 13%',
      '--card-foreground': '40 38% 95%',
      '--popover': '158 28% 11%',
      '--popover-foreground': '40 38% 95%',
      '--primary': '0 72% 52%',
      '--primary-foreground': '40 50% 97%',
      '--secondary': '155 24% 17%',
      '--secondary-foreground': '40 34% 92%',
      '--muted': '155 22% 15%',
      '--muted-foreground': '45 16% 74%',
      '--accent': '44 58% 20%',
      '--accent-foreground': '46 92% 74%',
      '--border': '155 18% 23%',
      '--input': '155 18% 27%',
      '--ring': '44 90% 58%',
      '--ink': '40 38% 95%',
      '--tint-1': '0 38% 22%',
      '--tint-2': '150 30% 20%',
      '--tint-3': '44 48% 20%',
      '--tint-4': '350 28% 20%',
    },
    palettes: [
      palette('holly', 'Holly', 'Holly red buttons on pine.', {}),
      palette('gold', 'Gold', 'Gold buttons, red kept for the ribbon.', {
        '--primary': '44 88% 56%',
        '--primary-foreground': '150 40% 9%',
        '--ring': '44 88% 56%',
      }),
      palette('snow', 'Snow', 'White buttons, like a frosted window.', {
        '--primary': '40 36% 94%',
        '--primary-foreground': '158 40% 10%',
        '--ring': '40 36% 94%',
      }),
    ],
  },
];

export const DEFAULT_THEME = 'ashtec';
export const DEFAULT_PALETTE = 'amber';

export function findTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function findPalette(themeId: string, paletteId?: string): Palette {
  const theme = findTheme(themeId);
  return theme.palettes.find((p) => p.id === paletteId) ?? theme.palettes[0];
}

/**
 * The full variable set for one theme + palette. Every theme returns the same
 * keys, which is what lets `applyVars` clear a previous theme cleanly.
 */
export function themeVars(themeId: string, paletteId?: string): Vars {
  const theme = findTheme(themeId);
  const p = findPalette(themeId, paletteId);
  return { ...theme.base, ...p.over };
}
