import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db } from '#db';
import { SETTING_KEYS, DEFAULT_SETTINGS, DEFAULT_LISTS, cleanSkillOptions, cleanCustomForms, cleanFeatures, cleanLists } from '../lib/settings';

/** Read the Settings table into the resolved app settings. */
export async function readAppSettings() {
  const { rows } = await db().query('SELECT "key", "value" FROM "Settings"');
  const map = new Map<string, unknown>(rows.map((r: { key: string; value: unknown }) => [r.key, r.value]));

  const skillsRaw = map.get(SETTING_KEYS.skillOptions);
  const skillOptions = Array.isArray(skillsRaw) && skillsRaw.length ? cleanSkillOptions(skillsRaw) : DEFAULT_SETTINGS.skillOptions;

  const editableRaw = map.get(SETTING_KEYS.skillsEditable);
  const skillsEditable = typeof editableRaw === 'boolean' ? editableRaw : DEFAULT_SETTINGS.skillsEditable;

  const catRaw = map.get(SETTING_KEYS.catName);
  const catName = typeof catRaw === 'string' && catRaw.trim() ? catRaw.trim().slice(0, 40) : DEFAULT_SETTINGS.catName;

  const formsRaw = map.get(SETTING_KEYS.feedbackForms);
  const feedbackForms = cleanCustomForms(formsRaw);

  const platformRaw = map.get(SETTING_KEYS.platformName);
  const platformName = typeof platformRaw === 'string' && platformRaw.trim() ? platformRaw.trim().slice(0, 60) : DEFAULT_SETTINGS.platformName;

  const schoolRaw = map.get(SETTING_KEYS.schoolName);
  const schoolName = typeof schoolRaw === 'string' && schoolRaw.trim() ? schoolRaw.trim().slice(0, 80) : DEFAULT_SETTINGS.schoolName;

  const features = cleanFeatures(map.get(SETTING_KEYS.features));
  const lists = cleanLists(map.get(SETTING_KEYS.lists), DEFAULT_LISTS);

  return { skillOptions, skillsEditable, catName, feedbackForms, platformName, schoolName, features, lists };
}

/**
 * The app-wide settings every signed-in member may read: the skill options and
 * the cat's name. Nothing here is sensitive, so it is unauthenticated and the
 * public site can read the cat's name too.
 */
export default createEndpoint({
  description: 'App settings everyone can read: skill options and the cat name.',
  authenticated: false,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async () => readAppSettings(),
});
