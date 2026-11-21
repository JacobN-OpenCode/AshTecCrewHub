/**
 * Apply server/db/schema.sql without importing anything.
 *
 * `npm run migrate` also replays the Zite CSV export, which is not what you want
 * when the only change is a new column. The DDL is idempotent (every statement is
 * CREATE ... IF NOT EXISTS or ALTER TABLE ... ADD COLUMN IF NOT EXISTS), so this
 * is safe to run on a live database as many times as you like.
 *
 *   npm run schema
 */
import '../server/env.js';
import { closeDb, migrateSchema } from '../server/db/index.js';

async function main() {
  await migrateSchema();
  console.log('  applied server/db/schema.sql');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
