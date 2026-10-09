/**
 * Seeds the live-show running order (LiveShows + LiveShowScenes) for the two
 * 2026-27 productions from Jacob's materials:
 *
 *  - The Addams Family (School Edition): scenes, musical numbers and cast come
 *    from the script's own "Scenes, Characters, Musical Numbers and Pages" index;
 *    props come from Prop Lists.xlsx, matched to the scene that covers their
 *    script page. Material-backed, page for page.
 *  - High School Musical (Broadway Junior, Music Theatre International): scenes,
 *    times, locations and the musical numbers each scene carries come from a
 *    full OCR of Jacob's scanned script ("HSM SCRIPT - DO NOT EDIT OR ADJUST");
 *    cast is who actually appears somewhere in the scene. Where an OCR line was
 *    missed (scene headers 4, 5, 7, 14) the location/time is taken from the
 *    script's own flow and the MTI song order. Props are from Prop Lists.xlsx
 *    (books, mics, smartphones) mapped onto the scenes that actually use them.
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

// Script-derived running order, page by page from the OCR'd Director's Guide.
// Labels keep the script's scene numbers so the crew can cross-reference the
// printed book; titles are location + day/time exactly as the script names them.
// Minutes are staging estimates - nudge them (and props/cast/notes) in the
// admin UI as the show settles.
const HSM: Scene[] = [
  { label: 'Scene 1', title: 'East High School — Monday, 7:45 A.M.', minutes: 6,
    cast: ['Full ensemble', 'Troy', 'Gabriella', 'Sharpay', 'Ryan', 'Chad', 'Taylor', 'Drum Major', 'Cheerleaders'],
    props: ['Karaoke stage + mic (flashback)'],
    notes: ['#1 Wildcat Cheer', '#2 Start of Something New', '#3 Start of Something New (Playoff)'] },
  { label: 'Scene 2', title: 'Homeroom (Ms. Darbus) — Monday, 8 A.M.', minutes: 4,
    cast: ['Ms. Darbus', 'Troy', 'Gabriella', 'Chad', 'Sharpay', 'Ryan', 'Students'],
    props: ['Smartphones (confiscated)'],
    notes: ['#4 Homeroom', '#5 Gabriella\'s Phone', 'Auditions for "Juliet and Romeo" announced'] },
  { label: 'Scene 3', title: 'Hallway — Monday, 8:15 A.M.', minutes: 3,
    cast: ['Troy', 'Gabriella', 'Sharpay', 'Ryan', 'Students'],
    props: ['Bulletin board', 'Audition sign-up sheet', 'Books'],
    notes: ['#8 Hallway', 'Sharpay signs the entire audition sheet'] },
  { label: 'Scene 4', title: 'Gym — Monday, 8:30 A.M.', minutes: 4,
    cast: ['Troy', 'Chad', 'Zeke', 'Jocks'],
    props: ['Basketballs'],
    notes: ["#9 Get'cha Head in the Game", "Get'cha Head in the Game (Playoff)"] },
  { label: 'Scene 5', title: 'Chemistry Lab (Ms. Tenny) — Monday, 2 P.M.', minutes: 3,
    cast: ['Gabriella', 'Taylor', 'Martha', 'Kratnoff', 'Ms. Tenny', 'Sharpay', 'Ryan'],
    props: ['Smartphones'],
    notes: ['#11 Sharpay Dials', '#12 The Plot Thickens', 'Decathlon printouts planted'] },
  { label: 'Scene 6', title: 'Theater — Monday, 3 P.M.', minutes: 5,
    cast: ['Ms. Darbus', 'Troy', 'Gabriella', 'Sharpay', 'Ryan', 'Students in detention'],
    props: ['Gong', 'Clipboard', 'Sheet music'],
    notes: ['Detention (animal exercises)', '#15 Announcement Transition 3', 'Kelsi\'s music revealed'] },
  { label: 'Scene 7', title: 'Theater (auditions) — Tuesday, 3 P.M.', minutes: 6,
    cast: ['Ms. Darbus', 'Kelsi', 'Sharpay', 'Ryan', 'Susan', 'Troy', 'Gabriella', 'Students trying out'],
    props: ['Piano', 'Sheet music', 'Clipboard', 'Handheld mics'],
    notes: ['#17 What I\'ve Been Looking For', '#18 School Bell', '#19 What I\'ve Been Looking For (Reprise)'] },
  { label: 'Scene 8', title: 'Hallway — Wednesday, 8:15 A.M.', minutes: 2,
    cast: ['Full ensemble', 'Troy', 'Gabriella', 'Sharpay', 'Ryan', 'Chad', 'Taylor', 'Zeke', 'Martha'],
    props: ['Callback list'],
    notes: ['#20 The Callback List', 'Troy and Gabriella both got callbacks'] },
  { label: 'Scene 9', title: 'Cafeteria — Wednesday, 12 P.M.', minutes: 7,
    cast: ['Full ensemble', 'Chad', 'Taylor', 'Zeke', 'Martha', 'Sharpay', 'Ryan', 'Troy', 'Gabriella'],
    props: ['Cafeteria tables', 'Lunch trays'],
    notes: ['#21 Stick to the Status Quo', '#22 Status Quo (Playoff)'] },
  { label: 'Scene 10', title: 'Horticulture Headquarters — Wednesday, 12:30 P.M.', minutes: 2,
    cast: ['Troy', 'Gabriella'],
    props: ['Horticulture plants'],
    notes: ["Troy's private hideout"] },
  { label: 'Scene 11', title: 'Study Hall — Wednesday, 1 P.M.', minutes: 3,
    cast: ['Chad', 'Taylor', 'Jocks', 'Brainiacs', 'Sharpay', 'Ryan'],
    props: [],
    notes: ['#23 Study Hall', 'Jock/brainiac summit; Sharpay\'s lie to Ms. Darbus'] },
  { label: 'Scene 12', title: 'Gym — Wednesday, 3:30 P.M.', minutes: 3,
    cast: ['Coach Bolton', 'Ms. Darbus', 'Troy', 'Jocks'],
    props: ['Basketballs'],
    notes: ['#24 Gym', 'Coach vs. Ms. Darbus confrontation'] },
  { label: 'Scene 13', title: 'Locker Room / Lab — Wednesday, 4 P.M.', minutes: 6,
    cast: ['Troy', 'Chad', 'Zeke', 'Jocks', 'Gabriella', 'Taylor', 'Brainiacs'],
    props: ['Smartphones', 'Lockers'],
    notes: ['Counting On You', '#26 Taylor\'s Phone', 'Gabriella pulls out of the callbacks'] },
  { label: 'Scene 14', title: 'Theater — Wednesday, 5 P.M.', minutes: 4,
    cast: ['Troy', 'Gabriella', 'Kelsi'],
    props: ['Smartphones'],
    notes: ['The reconciliation (a cappella "Start of Something New")', '#29 Study Hall transition'] },
  { label: 'Scene 15', title: 'Cafeteria — Thursday, 1 P.M.', minutes: 6,
    cast: ['Full ensemble', 'Jack Scott', 'Ms. Darbus', 'Troy', 'Gabriella', 'Sharpay', 'Ryan', 'Chad', 'Taylor', 'Zeke', 'Martha', 'Kelsi'],
    props: ['Announcement microphone', 'Cafeteria tables'],
    notes: ['#30 Announcement Transition 4', '#31 Sorry, Troy', '#32 We\'re All in This Together'] },
  { label: 'Scene 16', title: 'Lab / Theater / Gym (split scene) — Friday, 3 P.M.', minutes: 8,
    cast: ['Gabriella', 'Taylor', 'Brainiacs', 'Moderator', 'Ms. Darbus', 'Sharpay', 'Ryan', 'Kelsi', 'Troy', 'Coach Bolton', 'Jocks', 'Cheerleaders', 'Jack Scott'],
    props: ['Gong', 'Clipboard', 'Sheet music', 'Basketballs', 'Announcement microphone'],
    notes: ['#33 Bop to the Top', '#34 Meltdown', '#36 In the Theater', '#37 Kelsi Tries', 'Decathlon / callbacks / championship all at once'] },
  { label: 'Scene 17', title: 'Gym — Friday, 5 P.M. / Finale', minutes: 6,
    cast: ['Full company', 'Coach Bolton', 'Jack Scott'],
    props: ['Basketballs'],
    notes: ['#39 Game Buzzer', '#40 We\'re All in This Together (Reprise)', '#41 High School Musical Megamix (Bows)', '#42 Bop to the Top (Exit Music)'] },
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
