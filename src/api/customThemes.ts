import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import {
  MAX_CUSTOM_THEMES,
  buildVars,
  cleanBase,
  cleanThemeName,
  normaliseVars,
  themeProblem,
  type CustomTheme,
} from '../lib/customTheme';

/**
 * Ticket 36b2cc84: themes made for one person, usually by an AI over the MCP
 * connection. Every action is scoped to whoever is signed in, so a theme can
 * never be listed, changed or deleted by anybody else, and the MCP tools get
 * that for free because an MCP key acts as its owner.
 */
const parse = (row: Record<string, unknown>): CustomTheme => {
  let vars: Record<string, string> = {};
  try {
    vars = normaliseVars(JSON.parse(String(row.vars ?? '{}')));
  } catch {
    vars = {};
  }
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    base: cleanBase(row.base),
    vars,
    createdAt: String(row.createdAt ?? ''),
  };
};

export default createEndpoint({
  description: 'List, create and delete the colour themes made for the signed-in person',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['list', 'create', 'delete']).default('list'),
    id: z.string().max(60).optional(),
    name: z.string().max(120).optional(),
    base: z.string().max(40).optional(),
    palette: z.string().max(40).optional(),
    overrides: z.record(z.string(), z.string()).optional(),
  }),
  outputSchema: z.object({ themes: z.array(z.any()) }),
  async execute({ context, input }) {
    const me = await requireMember(context.user!.email);

    const mine = async (): Promise<CustomTheme[]> => {
      const { records } = await zite.customThemes.findAll({ limit: 1000 });
      return records
        .filter((r) => String(r.memberId ?? '') === me.id)
        .map(parse)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    };

    if (input.action === 'delete') {
      const wanted = String(input.id ?? '');
      const row = (await mine()).find((t) => t.id === wanted);
      if (!row) throw new ZiteError({ code: 'NOT_FOUND', message: 'That theme is not one of yours.' });
      await zite.customThemes.delete({ id: row.id });
      return { themes: await mine() };
    }

    if (input.action === 'create') {
      const name = cleanThemeName(input.name);
      const base = cleanBase(input.base);
      const vars = buildVars(base, input.palette, input.overrides);
      const problem = themeProblem(name, vars);
      if (problem) {
        throw new ZiteError({ code: 'BAD_REQUEST', message: problem, userFacingMessage: problem });
      }

      const already = await mine();
      // Same name means "that one, but now like this": an AI tweaking a theme
      // over a couple of messages should not leave a pile of near-copies.
      const existing = already.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        await zite.customThemes.update({
          id: existing.id,
          record: { name, base, vars: JSON.stringify(vars) },
        });
        return { themes: await mine() };
      }

      if (already.length >= MAX_CUSTOM_THEMES) {
        const message = `That is ${MAX_CUSTOM_THEMES} themes already. Delete one on the Themes page first.`;
        throw new ZiteError({ code: 'BAD_REQUEST', message, userFacingMessage: message });
      }

      await zite.customThemes.create({
        record: {
          id: randomUUID(),
          memberId: me.id,
          name,
          base,
          vars: JSON.stringify(vars),
          createdAt: new Date().toISOString(),
        },
      });
      return { themes: await mine() };
    }

    return { themes: await mine() };
  },
});
