/**
 * Envio de Web Push (servidor).
 *
 * Diferente do stream SSE, o push chega mesmo com o painel fechado — o
 * navegador entrega para o service worker (public/sw.js). Só depende das
 * chaves VAPID e das inscrições salvas em push_subscriptions.
 */

import webpush from 'web-push';
import { createChildLogger } from '@/lib/logger';
import {
  deletePushSubscription,
  listPushSubscriptions,
  listPushSubscriptionsForEmail,
  type PushSubscriptionRecord,
} from '@/repository/pushSubscriptions';

const log = createChildLogger('push');

export interface PushPayload {
  title: string;
  body: string;
  /** Notificações com a mesma tag se substituem em vez de empilhar */
  tag?: string;
  /** Caminho aberto ao clicar na notificação */
  url?: string;
  // Campos extras: as abas abertas usam isso para montar o toast laranja
  sectorSlug?: string | null;
  sectorName?: string;
  contactName?: string;
  message?: string;
}

export interface PushResult {
  sent: number;
  removed: number;
  failed: number;
}

let configured: boolean | null = null;

/** true se as chaves VAPID estão configuradas. */
export function isPushConfigured(): boolean {
  if (configured !== null) return configured;

  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject    = process.env.VAPID_SUBJECT?.trim() || 'mailto:ti@rockfeller.com.br';

  if (!publicKey || !privateKey) {
    log.warn('VAPID não configurado — Web Push desativado');
    configured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

async function deliver(subs: PushSubscriptionRecord[], payload: PushPayload): Promise<PushResult> {
  if (!isPushConfigured() || subs.length === 0) return { sent: 0, removed: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 600, urgency: 'high' }
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = inscrição morta (usuário desinstalou/limpou o navegador)
        if (status === 404 || status === 410) {
          await deletePushSubscription(sub.endpoint).catch(() => {});
          removed += 1;
          return;
        }
        failed += 1;
        log.error(`Falha ao enviar push (${status ?? 'sem status'}): ${(err as Error).message}`);
      }
    })
  );

  return { sent, removed, failed };
}

/** Envia para todos os navegadores inscritos. */
export async function sendPushToAll(payload: PushPayload): Promise<PushResult> {
  if (!isPushConfigured()) return { sent: 0, removed: 0, failed: 0 };
  return deliver(await listPushSubscriptions(), payload);
}

/** Envia só para os dispositivos de um usuário (usado no teste de configuração). */
export async function sendPushToEmail(email: string, payload: PushPayload): Promise<PushResult> {
  if (!isPushConfigured()) return { sent: 0, removed: 0, failed: 0 };
  return deliver(await listPushSubscriptionsForEmail(email), payload);
}
