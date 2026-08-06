/**
 * Inscrições Web Push (tabela push_subscriptions — migration 004).
 */

import { query, execute } from '@/lib/db';

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_email: string | null;
}

export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userEmail?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_email, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET p256dh       = EXCLUDED.p256dh,
           auth         = EXCLUDED.auth,
           user_email   = COALESCE(EXCLUDED.user_email, push_subscriptions.user_email),
           user_agent   = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
           last_seen_at = NOW()`,
    [sub.endpoint, sub.p256dh, sub.auth, sub.userEmail ?? null, sub.userAgent ?? null]
  );
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await execute('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  return query<PushSubscriptionRecord>(
    'SELECT endpoint, p256dh, auth, user_email FROM push_subscriptions'
  );
}

export async function listPushSubscriptionsForEmail(email: string): Promise<PushSubscriptionRecord[]> {
  return query<PushSubscriptionRecord>(
    'SELECT endpoint, p256dh, auth, user_email FROM push_subscriptions WHERE user_email = $1',
    [email]
  );
}
