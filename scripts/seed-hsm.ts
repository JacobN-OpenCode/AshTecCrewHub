/**
 * Fills in the High School Musical show so one show page has everything.
 *
 * The running order already lived inside the live show (LiveShowScenes). This
 * copies that curated data into the show workspace (ShowScenes), turns the
 * numbered music cues in each scene's notes into a cue sheet, rolls every prop
 * and principal costume into the inventory, lays out the pre-show checklist,
 * records the two casts as a note, and schedules the term's rehearsals from the
 * production spreadsheet.
 *
 *   npm run seed:hsm
 *
 * Idempotent and additive: a section is only written when it is still empty for
 * this show, so running it again after you have edited things changes nothing.
 * Rehearsals are matched on (show, date, title) so they are never duplicated.
 */
import { randomUUID } from 'node:crypto';
import { zite, closeDb } from '../server/db/index.js';
import '../server/env.js';

const HSM_CODE = 'HSM';

/** Two casts (X and Z). Blank cell => same actor in both. */
const CAST: [string, string, string][] = [
  ['Troy', 'Harry A', 'Noah D'],
  ['Gabriella', 'Isla R', 'Sara A'],
  ['Sharpay', 'Pearl', 'Lily'],
  ['Ryan', 'Will M', 'Will M'],
  ['Chad', 'Olly W', 'Olly W'],
  ['Taylor', 'Charlotte E', 'Maia W'],
  ['Kelsi', 'Ottie G', 'Ottie G'],
  ['Jack Scott', 'Seb', 'Seb'],
  ['Martha', 'Aofie', 'Aofie'],
  ['Zeke', 'Gwinyai', 'Gwindi'],
  ['Coach Bolton', 'Mrs D', 'Mrs D'],
  ['Ms Tenny', 'Freya', 'Freya'],
  ['Moderator', 'Toby S', 'Toby S'],
];

const ENSEMBLE = [
  'Amy', 'Robin', 'Celeste', 'Isla C', 'Lissie', 'Zara A', 'Olivia', 'Safia',
  'Sadie', 'Olly', 'Sophia C', 'Matilda', 'Isaac', 'Grace', 'James', 'Hugo',
  'Ava', 'Aiden', 'Olivia', 'Chimi', 'Bronwyn', 'Henry', 'Laurence', 'Sophia M',
];

/** The term's rehearsal plan (date, plan, who is needed). */
const REHEARSALS: [string, string, string][] = [
  ['2026-09-07', 'Dance - All in This Together & Get Your Head in the Game', 'All'],
  ['2026-09-09', 'Yr 7 & New Audition', 'All'],
  ['2026-09-14', 'Read through / block opening', 'All'],
  ['2026-09-16', 'Start of Something New (singing & dance)', 'All to learn singing'],
  ['2026-09-21', 'Scene 2 & 3 / begin the dance for Get Your Head in the Game', 'Named characters. Dance - Bronwyn, Hugo, Isaac, Olly W, Gwinyai, Gwindi, Ava, Celeste, Sophia C, Olivia H, Safia, Avery'],
  ['2026-09-23', 'Get Your Head in the Game (singing & dancing)', 'All to learn singing'],
  ['2026-09-28', 'Scene 5 & 6 / begin the audition', 'Named characters. Dance - Robin, Amy, Lissie, Isla C, Laurence, Henry, James, Matilda, Sadie, Zara A, Olly D-S, Sophia M, Chimi, Aiden'],
  ['2026-09-30', 'Singing - The Audition & What I\'ve Been Looking For', 'All to learn singing'],
  ['2026-10-05', 'Dance - What I\'ve Been Looking For & Reprise / Scene 8', 'Named characters'],
  ['2026-10-07', 'Singing only - Stick to the Status Quo', 'All'],
  ['2026-10-12', 'Dance - Stick to the Status Quo', 'Named characters. Hugo, Isaac, Sophia C, Sophia M, Celeste, Grace, Safia, Bronwyn, Avery, Ava, Sadie, Toby S, Isla C, Olly D-S, Olivia, Freya'],
];

/** A sensible pre-show checklist, grouped by what owns the job. */
const CHECKLIST: [string, string][] = [
  ['Pre-show', 'Charge all radio mics and spares'],
  ['Pre-show', 'Ring the front of house and confirm doors'],
  ['Pre-show', 'Check the show relay and backstage monitor'],
  ['Pre-show', 'Publish the call time in the green room'],
  ['Sound', 'Line check every radio mic'],
  ['Sound', 'Set the band / playback levels for the opening number'],
  ['Sound', 'Check the walk-in and interval playlist'],
  ['Lighting', 'Focus check and goose the moving lights'],
  ['Lighting', 'Pre-set the opening scene look and blackout'],
  ['Stage', 'Sweep and spike the set; props table laid out'],
  ['Stage', 'Check the gong, basketballs and audition sheet are in place'],
  ['Stage', 'Confirm the quick-change rails are dressed'],
  ['Cast', 'Warm-up and fight call complete'],
  ['Cast', 'Junior cast to their positions for the top of the show'],
  ['Front of house', 'Box office float and programme stock ready'],
];

/** Principal characters also need a costume logged against them. */
const COSTUMED = ['Troy', 'Gabriella', 'Sharpay', 'Ryan', 'Chad', 'Taylor', 'Kelsi', 'Jack Scott', 'Martha', 'Zeke'];

async function countFor(table: string, showId: string): Promise<number> {
  const { rows } = await zite.sql({ query: `SELECT count(*)::int AS n FROM "${table}" WHERE "show" = $1`, params: [showId] });
  return rows[0]?.n ?? 0;
}

async function main() {
  const show = await zite.shows.findOne({ filters: { shortCode: HSM_CODE } });
  if (!show) throw new Error(`No show with shortCode ${HSM_CODE}`);
  const showId = String(show.id);
  console.log(`Seeding "${show.showName}" (${showId})`);

  const liveShow = await zite.liveShows.findOne({ filters: { showId } });
  const scenes: any[] = liveShow
    ? (await zite.liveShowScenes.findAll({ filters: { liveShowId: String(liveShow.id) } })).records
    : [];
  scenes.sort((a, b) => Number(a.sortIndex) - Number(b.sortIndex));
  console.log(`  live running order: ${scenes.length} scenes`);

  // --- Rehearsals (match on show + date + title so re-runs never duplicate) ---
  let addedRehearsals = 0;
  for (const [date, plan, who] of REHEARSALS) {
    const { rows } = await zite.sql({
      query: 'SELECT id FROM "SubEvents" WHERE "shows" @> ARRAY[$1]::uuid[] AND "date"::text = $2 AND "title" = $3',
      params: [showId, date, plan],
    });
    if (rows.length) continue;
    await zite.subEvents.create({
      record: {
        id: randomUUID(),
        title: plan,
        type: 'Rehearsal',
        subtype: 'Part Day Rehearsal',
        shows: [showId],
        date,
        dateTbc: false,
        description: `Rehearsal plan: ${plan}`,
        thingsToBring: who,
        importance: 'Medium',
        hidden: false,
      },
    });
    addedRehearsals += 1;
  }
  console.log(`  rehearsals added: ${addedRehearsals}`);

  // --- Scenes (only if the workspace has none yet) ---
  if (scenes.length && (await countFor('ShowScenes', showId)) === 0) {
    for (const s of scenes) {
      await zite.showScenes.create({
        record: {
          id: randomUUID(),
          show: showId,
          label: s.label ?? '',
          title: s.title ?? '',
          minutes: Number(s.minutes) || 0,
          cast: s.cast ?? [],
          position: Number(s.sortIndex) || 0,
        },
      });
    }
    console.log(`  scenes seeded: ${scenes.length}`);
  } else {
    console.log('  scenes already present, skipped');
  }

  // --- Cue sheet from the numbered music cues in the scene notes ---
  if ((await countFor('ShowCues', showId)) === 0) {
    let position = 0;
    for (const s of scenes) {
      for (const note of (s.notes ?? []) as string[]) {
        const m = note.match(/^#(\d+)\s+(.+)$/);
        if (!m) continue;
        await zite.showCues.create({
          record: {
            id: randomUUID(),
            show: showId,
            number: `#${m[1]}`,
            department: 'Sound',
            scene: s.label ?? '',
            description: m[2].replace(/\s*\(Playoff\)\s*$/i, ' (playoff)').trim(),
            standby: `Standby #${m[1]}`,
            go: `GO #${m[1]}`,
            notes: '',
            position: position++,
          },
        });
      }
    }
    console.log(`  cues seeded: ${position}`);
  } else {
    console.log('  cues already present, skipped');
  }

  // --- Props & costumes (only if the inventory is empty) ---
  if ((await countFor('ShowProps', showId)) === 0) {
    const seen = new Set<string>();
    const props: string[] = [];
    for (const s of scenes) {
      for (const p of (s.props ?? []) as string[]) {
        const key = p.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        props.push(p);
      }
    }
    for (const name of props) {
      await zite.showProps.create({ record: { id: randomUUID(), show: showId, name, category: 'Prop', quantity: 1, status: 'Available' } });
    }
    for (const character of COSTUMED) {
      await zite.showProps.create({ record: { id: randomUUID(), show: showId, name: `${character} costume`, category: 'Costume', quantity: 1, status: 'Available' } });
    }
    console.log(`  props seeded: ${props.length} props + ${COSTUMED.length} costumes`);
  } else {
    console.log('  props already present, skipped');
  }

  // --- Checklist (only if empty) ---
  if ((await countFor('ShowChecklistItems', showId)) === 0) {
    let position = 0;
    for (const [category, label] of CHECKLIST) {
      await zite.showChecklistItems.create({ record: { id: randomUUID(), show: showId, category, label, position: position++ } });
    }
    console.log(`  checklist seeded: ${CHECKLIST.length}`);
  } else {
    console.log('  checklist already present, skipped');
  }

  // --- Cast list as a rehearsal note (only if there are no notes yet) ---
  if ((await countFor('RehearsalNotes', showId)) === 0) {
    const width = 14;
    const lines = [
      'CAST LIST',
      '',
      `${'Character'.padEnd(width)}Cast X`.padEnd(width + 12) + 'Cast Z',
      ...CAST.map(([c, x, z]) => `${c.padEnd(width)}${(x || '—').padEnd(12)}${z || '—'}`),
      '',
      `Ensemble: ${ENSEMBLE.join(', ')}`,
    ];
    await zite.rehearsalNotes.create({ record: { id: randomUUID(), show: showId, scene: '', body: lines.join('\n') } });
    console.log('  cast note added: 1');
  } else {
    console.log('  notes already present, skipped');
  }

  console.log('Done.');
}

main()
  .then(() => closeDb())
  .catch(async (err) => { console.error(err); await closeDb(); process.exit(1); });
