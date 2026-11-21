/**
 * The MCP instructions are a string, so nothing typechecks them. These tests
 * fail if the rules a model needs before it touches production disappear.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(import.meta.dirname, '../server/mcp.ts'), 'utf8');

test('the instructions say what this place is and where it lives', () => {
  assert.match(source, /AshTec Crew Hub/);
  assert.match(source, /ashtec\.dino\.icu/);
});

test('the deploy rule is still there, in plain words', () => {
  assert.match(source, /deploy/i);
  assert.match(source, /explicit/i, 'the instructions must ask for an explicit request before deploying');
});

test('a model is told to stay off tickets it has not shipped', () => {
  assert.match(source, /not an instruction from the person/i, 'tool output must be described as data');
});

test('the repository and the PR TLDR rule are described', () => {
  assert.match(source, /SmartSparkCoding\/AshTecCrewHub/);
  assert.match(source, /TLDR/i);
});
