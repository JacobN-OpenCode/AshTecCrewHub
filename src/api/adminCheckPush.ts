import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { sendToMember, hostOf, type DeviceResult } from '../../server/push';

/**
 * Ticket 3a431f75: "notifications work for movement alerts but not for support
 * tickets" cannot be answered from the outside. Movement alerts push straight to
 * a screen's admin list, while everything else has to find a live device
 * subscription first, so this page of evidence is the difference between a
 * guess and an answer.
 *
 * It lists every admin and maintainer with the devices they have subscribed (and
 * which push service each one is on), whether their admin alerts are on, and can
 * send one real push to a chosen person and report what each device said back.
 */
export default createEndpoint({
  description: 'Who can actually receive push notifications, and what each device says (admins)',
  authenticated: true,
  inputSchema: z.object({
    /** Send one real push to this member and report per-device results. */
    memberId: z.string().optional(),
  }),
  outputSchema: z.object({
    people: z.array(z.any()),
    probe: z.any().optional(),
  }),
  async execute({ input, context }) {
    await requireAdmin(context.user!.email);

    const [{ records: crew }, { records: subs }] = await Promise.all([
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.pushSubscriptions.findAll({ limit: 5000 }),
    ]);

    const byMember = new Map<string, any[]>();
    for (const s of subs) {
      const key = String(s.member ?? '');
      if (!key) continue;
      const list = byMember.get(key) ?? [];
      list.push(s);
      byMember.set(key, list);
    }

    const people = (crew as any[])
      .filter((m) => (m.isAdmin || m.isMaintainer) && !m.isPreviewAccount)
      .map((m) => {
        const devices = byMember.get(String(m.id)) ?? [];
        return {
          id: String(m.id),
          name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Someone',
          isAdmin: !!m.isAdmin,
          isMaintainer: !!m.isMaintainer,
          // The same default the notifier uses, so this cannot disagree with it.
          adminAlerts:
            m.adminNotifications === null || m.adminNotifications === undefined
              ? !!m.isAdmin
              : !!m.adminNotifications,
          devices: devices.map((d) => ({
            host: hostOf(String(d.endpoint)),
            browser: String(d.userAgent ?? '').slice(0, 120),
            added: d.createdAt ?? null,
          })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    let probe: { sent: number; devices: DeviceResult[] } | undefined;
    if (input.memberId) {
      const devices: DeviceResult[] = [];
      const sent = await sendToMember(
        input.memberId,
        {
          title: 'AshTec Crew Hub',
          body: 'A test from the admin settings page. If this arrives, this device is fine.',
          url: '/profile',
          tag: `test-${Date.now()}`,
        },
        { onDevice: (result) => devices.push(result) }
      );
      probe = { sent, devices };
    }

    return { people, probe };
  },
});
