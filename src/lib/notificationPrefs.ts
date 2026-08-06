/**
 * Preferência global "alertas de nova mensagem" — compartilhada entre o botão
 * de sino (NotificationBell) e o notificador global (GlobalNewMessageNotifier),
 * que vivem em árvores diferentes da aplicação.
 */

export const NOTIFICATIONS_STORAGE_KEY = 'saf_notifications_enabled';
const NOTIFICATIONS_EVENT = 'saf-notifications-changed';

export function readNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeNotificationsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* localStorage bloqueado — mantém apenas em memória nesta aba */
  }
  window.dispatchEvent(new CustomEvent<boolean>(NOTIFICATIONS_EVENT, { detail: enabled }));
}

/** Observa mudanças nesta aba (evento custom) e em outras abas (evento storage). */
export function subscribeNotificationsEnabled(onChange: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = (event: Event) => {
    onChange((event as CustomEvent<boolean>).detail === true);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === NOTIFICATIONS_STORAGE_KEY) onChange(event.newValue === 'true');
  };

  window.addEventListener(NOTIFICATIONS_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(NOTIFICATIONS_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
