/* Service worker do painel SAF — só trata Web Push (não faz cache offline).
   Registrado por src/lib/webPush.ts quando o atendente ativa os alertas. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'Nova mensagem';
  const body  = data.body || '';
  const url   = data.url || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Avisa as abas abertas para mostrarem o toast laranja na hora
      for (const client of clients) {
        client.postMessage({ type: 'saf-push', data });
      }

      // Se o painel está aberto e à vista, o toast já cobre — evita aviso duplo
      const hasVisible = clients.some((client) => client.visibilityState === 'visible');
      if (hasVisible) return;

      await self.registration.showNotification(title, {
        body,
        tag: data.tag,
        icon: '/logo-rockfeller-branca.png',
        badge: '/logo-rockfeller-branca.png',
        data: { url },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));

      if (existing) {
        await existing.focus();
        if ('navigate' in existing) {
          try { await existing.navigate(url); } catch { /* aba ocupada — só foca */ }
        }
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});

// O navegador pode rotacionar a inscrição — reinscreve e reenvia ao servidor
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
      if (!applicationServerKey) return;

      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      await fetch('/api/push/subscription', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
    })()
  );
});
