import { NextResponse } from 'next/server';
import { getInboxes, getLabels, getTeams } from '@/integrations/chatwoot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [inboxes, labels, teams] = await Promise.all([
      getInboxes(),
      getLabels(),
      getTeams(),
    ]);

    return NextResponse.json({
      inboxes: inboxes.map((i) => ({ id: i.id, name: i.name, type: i.channel_type, phone: i.phone_number })),
      labels:  labels.map((l)  => ({ id: l.id, title: l.title })),
      teams:   teams.map((t)   => ({ id: t.id, name: t.name })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
