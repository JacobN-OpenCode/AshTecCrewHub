/**
 * Seeds the live-show running order (LiveShows + LiveShowScenes) for the two
 * 2026-27 productions from Jacob's materials:
 *
 *  - The Addams Family (School Edition): scenes, musical numbers and cast come
 *    from the script's own "Scenes, Characters, Musical Numbers and Pages" index;
 *    props come from Prop Lists.xlsx, matched to the scene that covers their
 *    script page. Material-backed, page for page.
 *  - High School Musical: no script was supplied, so this is the rehearsal-era
 *    running order derived from Rehearsal Schedule.xlsx (scenes 2/3, 5/6 and 8,
 *    plus the numbers being learned) and Prop Lists.xlsx (books p2, mic p4,
 *    smartphone p6, mic p8). Treat it as a first draft to edit in the admin UI.
 *
 * Idempotent: upserts the LiveShows row by showId and replaces its scenes.
 *
 * Usage:  npx tsx scripts/seed-live-shows.ts
 */

import '../server/env.js';
import { zite, closeDb } from '../server/db/index.js';

type Scene = { label: string; title: string; minutes: number; cast: string[]; props: string[]; notes: string[] };

const ADDAMS: Scene[] = [
  // Act One ------------------------------------------------------------------
  { label: 'Act 1 · Scene 1', title: 'Overture / Prologue — The Addams Family Tree', minutes: 7,
    cast: ['Full Ensemble (except the Beinekes)'], props: ['Oak tree (family tree)', 'Crypt gate'],
    notes: ['#1 Overture/Prologue', "#2 When You're An Addams", '#2A (We Have) A Problem', "#3 Fester's Manifesto"] },
  { label: 'Act 1 · Scene 2', title: 'A problem in the house', minutes: 9,
    cast: ['Gomez', 'Lurch', 'Morticia', 'Wednesday'], props: ['Swords (fencing)', 'Yellow flower bouquet', 'Crossbow', 'Goose', 'Arrow', 'Ring'],
    notes: ['#3A Two Things', "#4 Wednesday's Growing Up", '#5 Trapped'] },
  { label: 'Act 1 · Scene 3', title: 'Honour roll / One Normal Night', minutes: 9,
    cast: ['Full Ensemble'], props: ['Rack and ratchet wheel', 'Yellow bird with removable head', 'Rat'],
    notes: ['#5A Honour Roll', '#6 Pulled', '#6A Four Things', '#7 One Normal Night'] },
  { label: 'Act 1 · Scene 4', title: 'One Normal Night (continued)', minutes: 9,
    cast: ['Full Ensemble'], props: ['Trees', 'Central Park guidebook'],
    notes: ['#7 One Normal Night (cont.)'] },
  { label: 'Act 1 · Scene 5', title: "Morticia's entrance / But Love", minutes: 8,
    cast: ['Full Ensemble'], props: ['Coin collecting can', 'Hair-piece / toupee', 'Drinking glasses'],
    notes: ["#7A Morticia's Entrance", '#8 But Love (Reprise 1)'] },
  { label: 'Act 1 · Scene 6', title: 'Wednesday and Lucas', minutes: 2,
    cast: ['Lucas', 'Wednesday', 'Fester', 'Ancestors'], props: [],
    notes: ['#8A But Love (Reprise 2)'] },
  { label: 'Act 1 · Scene 7', title: 'Mal meets Gomez', minutes: 3,
    cast: ['Mal', 'Gomez'], props: ['Cigars', 'Antique chair'],
    notes: ['#8B Alphonso the Enormous'] },
  { label: 'Act 1 · Scene 8', title: 'Secrets', minutes: 5,
    cast: ['Morticia', 'Alice', 'Female Ancestors'], props: ['Photo album'],
    notes: ['#9 Secrets', '#9A Secrets Playoff'] },
  { label: 'Act 1 · Scene 9', title: "Gomez's What If", minutes: 4,
    cast: ['Gomez', 'Lucas', 'Wednesday', 'Morticia'], props: ["Jeweller's loupe"],
    notes: ["#10 Gomez's What If"] },
  { label: 'Act 1 · Scene 10', title: 'Lucas, Wednesday and Pugsley', minutes: 2,
    cast: ['Lucas', 'Wednesday', 'Pugsley'], props: [], notes: [] },
  { label: 'Act 1 · Scene 11', title: 'What If', minutes: 4,
    cast: ['Pugsley', 'Grandma'], props: ['Wagon of vials and bottles'],
    notes: ['#11 What If'] },
  { label: 'Act 1 · Scene 12', title: 'Full Disclosure', minutes: 13,
    cast: ['Full Ensemble'], props: ['Napkins and dinner things'],
    notes: ['#12 Full Disclosure Part 1', '#13 Waiting', '#14 Full Disclosure Part 2'] },
  // Act Two ------------------------------------------------------------------
  { label: 'Act 2 · Scene 1', title: 'Opening Act Two', minutes: 3,
    cast: ['Lucas', 'Wednesday', 'Ancestors', 'Fester'], props: [], notes: ['#15 Opening Act II'] },
  { label: 'Act 2 · Scene 2', title: 'Just Around the Corner', minutes: 5,
    cast: ['Morticia', 'Gomez', 'Ancestors'], props: [], notes: ['#16 Just Around the Corner', '#16A Playoff'] },
  { label: 'Act 2 · Scene 3', title: 'All is Black Inside My Face', minutes: 2,
    cast: ['Alice', 'Mal'], props: [], notes: ['#16B All is Black Inside My Face', '#16C Into the Moon and Me'] },
  { label: 'Act 2 · Scene 4', title: 'The Moon and Me', minutes: 2,
    cast: ['Fester', 'Female Ancestors'], props: [], notes: ['#17 The Moon and Me'] },
  { label: 'Act 2 · Scene 5', title: 'Happy Sad', minutes: 4,
    cast: ['Gomez', 'Wednesday'], props: [], notes: ['#17A Into Happy Sad', '#18 Happy Sad'] },
  { label: 'Act 2 · Scene 6', title: 'Crazier Than You', minutes: 9,
    cast: ['Wednesday', 'Lucas', 'Gomez', 'Ancestors', 'Fester', 'Mal', 'Alice'], props: [],
    notes: ['#19 Crazier Than You'] },
  { label: 'Act 2 · Scene 7', title: 'Bedtime Story', minutes: 2,
    cast: ['Morticia', 'Pugsley'], props: [], notes: ['#19A Bedtime Story'] },
  { label: 'Act 2 · Scene 8', title: 'Not Today', minutes: 3,
    cast: ['Gomez', 'Lurch', 'Fester'], props: [], notes: ['#20 Not Today', '#20A After Not Today'] },
  { label: 'Act 2 · Scene 9', title: 'Live Before We Die / Tango De Amor', minutes: 5,
    cast: ['Gomez', 'Morticia', 'Female Ancestors'], props: [], notes: ['#21 Live Before We Die', '#22 Tango De Amor'] },
  { label: 'Act 2 · Scene 10', title: 'Finale — Move Toward the Darkness', minutes: 7,
    cast: ['Full Ensemble'], props: [],
    notes: ['#22 Tango De Amor (cont.)', '#22A Before Move Toward the Darkness', '#23 Finale: Move Toward the Darkness', "#24 Bows — When You're An Addams (Reprise)"] },
];

// Rehearsal-era draft. Labels keep the script scene numbers so it lines up with
// Rehearsal Schedule.xlsx; titles are the numbers/beats being worked.
const HSM: Scene[] = [
  { label: 'Scene 1', title: 'Start of Something New (read-through / opening)', minutes: 6,
    cast: ['Troy', 'Gabriella', 'Sharpay', 'Ryan', 'Ensemble'], props: [],
    notes: ['Block the opening', "#1 Start of Something New"] },
  { label: 'Scene 2', title: "Get'cha Head in the Game", minutes: 5,
    cast: ['Troy', 'Chad', 'Zeke', 'Basketball team', 'Ensemble'], props: ['Books'],
    notes: ["#2 Get'cha Head in the Game — rehearse with Scene 3"] },
  { label: 'Scene 3', title: 'East High (blocked with Scene 2)', minutes: 5,
    cast: ['Sharpay', 'Ryan', 'Kelsi', 'Ms Darbus', 'Ensemble'], props: [], notes: ['Rehearsed with Scene 2'] },
  { label: 'Scene 4', title: 'Audition announcement', minutes: 4,
    cast: ['Sharpay', 'Ryan', 'Kelsi', 'Troy', 'Gabriella', 'Ensemble'], props: [], notes: [] },
  { label: 'Scene 5', title: "What I've Been Looking For", minutes: 5,
    cast: ['Sharpay', 'Ryan', 'Kelsi', 'Ensemble'], props: ['Handheld microphones'],
    notes: ["The Audition / What I've Been Looking For — rehearse with Scene 6"] },
  { label: 'Scene 6', title: 'The callback', minutes: 5,
    cast: ['Troy', 'Gabriella', 'Sharpay', 'Ryan', 'Kelsi', 'Ensemble'], props: ['Smartphones'],
    notes: ["Rehearsed with Scene 5"] },
  { label: 'Scene 7', title: 'Jocks, brainiacs and the in-between', minutes: 4,
    cast: ['Chad', 'Taylor', 'Zeke', 'Martha', 'Ensemble'], props: [], notes: [] },
  { label: 'Scene 8', title: "What I've Been Looking For (Reprise)", minutes: 5,
    cast: ['Troy', 'Gabriella', 'Ensemble'], props: ['Handheld microphone'],
    notes: ['#? Reprise'] },
  { label: 'Scene 9', title: 'Stick to the Status Quo', minutes: 6,
    cast: ['Chad', 'Taylor', 'Zeke', 'Martha', 'Sharpay', 'Ryan', 'Ensemble'], props: ['Mobile phones (cardboard)'],
    notes: ['# Stick to the Status Quo'] },
  { label: 'Scene 10', title: 'All in This Together / finale', minutes: 6,
    cast: ['Full company'], props: ['Red lockers', 'Notice board'], notes: ['# All in This Together', '# Bows'] },
];

const SPACES = (s: string) => s.replace(/\s+/g, ' ').trim();

async function seed(showName: string, shortCode: string, areaName: string, scenes: Scene[]) {
  const { records: shows } = await zite.shows.findAll({ limit: 200 });
  const show = shows.find((s) => SPACES(String(s.showName)).toLowerCase() === showName.toLowerCase());
  if (!show) {
    console.log(`  ! no Shows row for "${showName}" (looked for shortCode ${shortCode}); skipping`);
    return;
  }
  const existing = await zite.liveShows.findOne({ filters: { showId: show.id } });
  let live = existing;
  if (!live) {
    live = await zite.liveShows.create({
      record: { showId: show.id, name: showName, areaName, status: 'standby', open: false, intermissionMinutes: 15, crewCanEdit: false } as never,
    });
    console.log(`  + created LiveShows for ${showName}`);
  } else {
    await zite.liveShows.update({ id: live.id, record: { name: showName, areaName } });
    console.log(`  = LiveShows already existed for ${showName}`);
  }
  const { records: oldScenes } = await zite.liveShowScenes.findAll({ filters: { liveShowId: live.id }, limit: 500 });
  for (const s of oldScenes) await zite.liveShowScenes.delete({ id: s.id });
  await zite.liveShowScenes.bulkCreate({
    records: scenes.map((s, i) => ({
      liveShowId: live.id,
      label: s.label,
      title: s.title,
      minutes: Math.max(0, Math.floor(s.minutes)),
      cast: s.cast,
      props: s.props,
      notes: s.notes,
      sortIndex: i,
    })) as never,
  });
  console.log(`  ↳ ${scenes.length} scenes written`);
}

await seed('The Addams Family', 'TAF', 'Stage', ADDAMS);
await seed('High School Musical', 'HSM', 'Stage', HSM);
await closeDb();
