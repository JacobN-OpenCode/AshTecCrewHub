import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { REPLY_KIND_STYLE, SEVERITIES, SEVERITY_STYLE, STATUS_STYLE, TYPE_STYLE } from '../src/lib/supportStyle';

test('every severity has a badge style', () => {
  for (const s of SEVERITIES) assert.ok(SEVERITY_STYLE[s], `no style for severity ${s}`);
});

test('the four ticket states all have a style', () => {
  for (const s of ['Open', 'In Progress', 'Resolved', 'Closed']) assert.ok(STATUS_STYLE[s], `no style for status ${s}`);
});

test('every style value is a class string, not an empty pocket', () => {
  for (const group of [TYPE_STYLE, STATUS_STYLE, SEVERITY_STYLE, REPLY_KIND_STYLE]) {
    for (const [k, v] of Object.entries(group)) assert.ok(String(v).trim().length > 0, `${k} has an empty style`);
  }
});

test('every ticket type the form accepts has a colour', () => {
  // Read the list out of the endpoint that validates it, so adding a fourth
  // type on one side and not the other fails here instead of showing a grey
  // badge to a member.
  const source = readFileSync(join(import.meta.dirname, '../src/api/submitSupport.ts'), 'utf8');
  const enumLine = /z\.enum\(\[([^\]]+)\]\)/.exec(source);
  assert.ok(enumLine, 'could not find the ticket type enum in src/api/submitSupport.ts');
  const types = enumLine[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  assert.ok(types.length >= 3, 'only found ' + types.length + ' ticket types');
  for (const t of types) assert.ok(TYPE_STYLE[t], 'no style for type ' + t);
});
