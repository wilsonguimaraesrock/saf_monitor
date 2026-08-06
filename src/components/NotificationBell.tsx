'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  readNotificationsEnabled,
  subscribeNotificationsEnabled,
  writeNotificationsEnabled,
} from '@/lib/notificationPrefs';
import { unlockNotificationSound, playNotificationTone } from '@/lib/notificationSound';
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from '@/lib/webPush';

/**
 * Liga/desliga os alertas de nova mensagem. O disparo em si é feito pelo
 * GlobalNewMessageNotifier (montado no layout) — aqui só pedimos a permissão
 * do navegador e destravamos o áudio, que exigem gesto do usuário.
 */
export function NotificationBell() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    setEnabled(readNotificationsEnabled());
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    return subscribeNotificationsEnabled(setEnabled);
  }, []);

  async function toggle() {
    if (enabled) {
      writeNotificationsEnabled(false);
      await unsubscribeFromPush();
      return;
    }

    let granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
    if (typeof Notification !== 'undefined' && !granted) {
      const result = await Notification.requestPermission();
      setPermission(result);
      granted = result === 'granted';
    }
    await unlockNotificationSound();

    // Web Push: é o que faz a notificação chegar com o painel fechado
    if (granted && isPushSupported()) {
      const ok = await subscribeToPush();
      if (!ok) console.warn('[push] inscrição não concluída — alertas só com a aba aberta');
    }

    writeNotificationsEnabled(true);
    playNotificationTone(); // confirmação audível
  }

  const denied = permission === 'denied';

  return (
    <button
      onClick={toggle}
      disabled={denied}
      aria-pressed={enabled}
      title={
        denied
          ? 'Notificações bloqueadas no navegador — libere nas permissões do site'
          : enabled
            ? 'Alertas de nova mensagem ativos — clique para desativar'
            : 'Ativar alertas de nova mensagem (funciona com a aba em segundo plano)'
      }
      className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${
          enabled
            ? 'text-white bg-white/15 hover:bg-white/25 dark:text-emerald-300 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20'
            : 'text-white/90 hover:text-white hover:bg-white/10 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
        }`}
    >
      {enabled ? <Bell size={17} /> : <BellOff size={17} />}
      {enabled && (
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
      )}
    </button>
  );
}
