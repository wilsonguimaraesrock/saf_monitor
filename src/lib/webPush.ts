/**
 * Web Push no lado do navegador: registro do service worker, inscrição e
 * cancelamento. O service worker (public/sw.js) é quem mostra a notificação
 * quando o painel está fechado ou em segundo plano.
 */

const SW_PATH = '/sw.js';

/** A chave VAPID vai para o navegador como bytes (base64url → ArrayBuffer). */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    return null;
  }
}

/** true se este navegador já tem uma inscrição ativa. */
export async function hasPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (!registration) return false;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

/** Inscreve o navegador e guarda a inscrição no servidor. */
export async function subscribeToPush(): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return false;

  const registration = await getRegistration();
  if (!registration) return false;

  try {
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey),
      }));

    const res = await fetch('/api/push/subscription', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    return res.ok;
  } catch (err) {
    console.warn('[push] não foi possível inscrever:', (err as Error).message);
    return false;
  }
}

/** Cancela a inscrição no navegador e remove do servidor. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    await fetch('/api/push/subscription', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});

    await subscription.unsubscribe();
  } catch {
    /* ignora — o alerta em tela continua funcionando */
  }
}
