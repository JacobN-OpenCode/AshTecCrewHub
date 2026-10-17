/**
 * The crew mascot (Batch 8): a name, a backstory and a voice.
 *
 * The cat that hosts the feedback forms had no name and no reason to be here.
 * Now it does. This is the single source of truth for the mascot's identity and
 * its lines, shared by the Mascot page, the floating CatCompanion, and (via the
 * same list) the feedback pages.
 */

export const MASCOT = {
  name: 'Tabby',
  role: 'Crew mascot',
  image: '/cat.png',
  tagline: 'Nine lives, all spent backstage.',
  /** A short backstory, told in the cat's voice. */
  backstory: [
    'I turned up during the first Tech Week and never left. Someone left a tuna sandwich in the lighting box and, well, that was that.',
    'Since then I have supervised every get-in, slept through every run-through, and inspected every coil of cable in the building. I have opinions about cable management. Strong ones.',
    'I do not carry a radio and I have never once been on a call sheet, but every show runs better when I am watching from the fly rail.',
  ],
  /** Facts, for a little character sheet. */
  facts: [
    { label: 'Lives left', value: 'Nine (allegedly)' },
    { label: 'Preferred department', value: 'Lighting (it is warm)' },
    { label: 'Favourite cue', value: 'Blackout, obviously' },
    { label: 'Least favourite', value: 'The sound of a dry ice machine' },
    { label: 'Years on the crew', value: 'Since before you were in Year 7' },
  ],
  /** Things the cat says. Keep them kind, dry and short. */
  lines: [
    'Meow. Pick away.',
    'I read every one of these. Every. One.',
    'No rush. I have nine lives.',
    '*taps the checkbox with a paw*',
    'Do it for the crew.',
    'Have you coiled that cable properly? I checked. You have not.',
    'The blackout is the best cue and I will not be taking questions.',
    'I have been asleep on the followspot since the interval.',
    'Turn the house lights down. I am about to make an entrance.',
    'Mic check. Meow. Meow. Thank you, sound desk.',
    'Someone has left a water bottle in the wings again. I have moved it.',
    'Being on book is easy. Being a cat is easier.',
    'That is a lovely gel frame. I shall sit on it.',
    'Five minutes to curtain. I have been ready since Tuesday.',
    'Do not forget to strike the set. Or do. I will watch.',
    'I have nine lives and eight of them were spent waiting for a cue.',
  ],
  /** A random line, handy for anywhere that just wants one. */
  line: () => MASCOT.lines[Math.floor(Math.random() * MASCOT.lines.length)],
} as const;
