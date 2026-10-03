import { ziteAuth } from 'zitejs/auth/server';
import { zite } from 'zitejs/db';

async function allowed(email: string) {
  const { rows } = await zite.sql({
    query:
      'SELECT (SELECT COUNT(*)::int FROM "CrewMembers" WHERE lower("schoolEmail") = lower($1)) AS "match", (SELECT COUNT(*)::int FROM "CrewMembers" WHERE "isAdmin" = true) AS "admins"',
    params: [email.trim()],
  });
  // Crew list members only — or anyone while no admin exists yet (first-time setup).
  return Number(rows[0]?.match) > 0 || Number(rows[0]?.admins) === 0;
}

export default ziteAuth({
  hooks: {
    async beforeSignUp(input) {
      return (await allowed(input.email))
        ? { allow: true }
        : { deny: true, reason: 'This email is not on the AshTec crew list. Ask an admin to add you.' };
    },
    async beforeSignIn(input) {
      return (await allowed(input.email))
        ? { allow: true }
        : { deny: true, reason: 'This email is not on the AshTec crew list.' };
    },
  },
});
