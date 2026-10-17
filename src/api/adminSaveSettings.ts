import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db } from '#db';
import { requireAdmin } from '../lib/server';
import { SETTING_KEYS, cleanSkillOptions } from '../lib/settings';

/**
 * The admins' settings page (the ATCMS settings hub). Writes into the generic
 * Settings key/value table, so a new setting is a new key here rather than a
 * schema change. Only the keys listed below are writable.
 */
export default createEndpoint({
  description: 'Admin: save app-wide settings (skill options, whether members can edit skills, the cat name).',
  authenticated: true,
  inputSchema: z.object({
    skillOptions: z.array(z.string()).optional(),
    skillsEditable: z.boolean().optional(),
    catName: z.string().max(40).optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);

    const writes: [string, unknown][] = [];
    if (input.skillOptions !== undefined) {
      const options = cleanSkillOptions(input.skillOptions);
      if (options.length === 0) throw new Error('Keep at least one skill option.');
      writes.push([SETTING_KEYS.skillOptions, options]);
    }
    if (input.skillsEditable !== undefined) writes.push([SETTING_KEYS.skillsEditable, !!input.skillsEditable]);
    if (input.catName !== undefined) {
      const name = input.catName.trim().slice(0, 40);
      if (!name) throw new Error('The cat needs a name.');
      writes.push([SETTING_KEYS.catName, name]);
    }

    for (const [key, value] of writes) {
      await db().query(
        'INSERT INTO "Settings" ("key", "value", "updatedAt") VALUES ($1, $2::jsonb, now()) ' +
          'ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()',
        [key, JSON.stringify(value)],
      );
    }
    return { success: true };
  },
});
