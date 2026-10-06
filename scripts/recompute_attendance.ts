/**
 * One-shot production script: triggers the attendance recompute that the
 * admin button ships in the app. Same logic as adminRecomputeAttendance
 * but invoked directly so we can backfill on existing data without a
 * signed-in admin firing up the button in the UI.
 *
 * Usage: npx tsx scripts/recompute_attendance.ts
 */

import { db, closeDb } from '../server/db/index.js';
import { zite } from '../server/db/index.js';
import { syncAutoAttendance } from '../src/lib/server.js';

await db().query('BEGIN');
try {
  const beforeAtt = (await zite.attendance.findAll({ limit: 5000 })).records;
  const beforeEA = beforeAtt.filter((a) => a.status === 'Expected Arrival').length;
  const beforeMaybe = beforeAtt.filter((a) => a.status === 'Maybe').length;

  const r = await syncAutoAttendance({});

  const afterAtt = (await zite.attendance.findAll({ limit: 5000 })).records;
  const afterEA = afterAtt.filter((a) => a.status === 'Expected Arrival').length;
  const afterMaybe = afterAtt.filter((a) => a.status === 'Maybe').length;

  await db().query('COMMIT');
  console.log('Recompute results:');
  console.log(`  Added ${r.added} pending rows`);
  console.log(`    - ${afterEA - beforeEA} Expected Arrival`);
  console.log(`    - ${afterMaybe - beforeMaybe} Maybe`);
  console.log(`  Auto-marked ${r.autoSet} declines (Not Attending Event)`);
  console.log(`  Cleared ${r.clearedAuto} stale auto-declines`);
} catch (err) {
  await db().query('ROLLBACK');
  throw err;
}

await closeDb();
