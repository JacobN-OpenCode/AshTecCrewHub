/**
 * Loads .env once, before anything reads process.env.
 *
 * This has to happen before the endpoint modules are imported, not lazily:
 * src/api/supportEscalate.ts captures `const APP = process.env.APP_URL` at module
 * scope, so a late load would bake in `undefined` and every escalation email
 * would link to "undefined/admin/support".
 *
 * Real environment variables always win over the file, so a systemd unit or
 * `docker run -e` can override anything here without editing it.
 */

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    try {
      process.loadEnvFile(full);
    } catch (e) {
      console.warn(`[env] could not read ${file}:`, (e as Error)?.message);
    }
  }
}

loadEnv();