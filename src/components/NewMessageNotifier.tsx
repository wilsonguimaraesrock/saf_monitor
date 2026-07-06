'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, BellOff } from 'lucide-react';
import type { ChatwootConversation } from '@/integrations/chatwoot';

const STORAGE_KEY = 'saf_notifications_enabled';

interface Props {
  conversations: ChatwootConversation[];
  sectorName: string;
}

/**
 * Dispara notificação de push do navegador + tom de alerta quando entra
 * mensagem nova (conversa nova ou última mensagem alterada) no setor.
 * O usuário precisa ativar via botão de sino (exigência de gesto dos navegadores).
 */
export function NewMessageNotifier({ conversations, sectorName }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // id → última mensagem conhecida
  const seenRef = useRef<Map<number, string>>(new Map());
  const initializedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Estado inicial a partir do localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
    if (localStorage.getItem(STORAGE_KEY) === 'true') setEnabled(true);
  }, []);

  const playTone = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      // Dois beeps curtos
      const beep = (start: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.2);
      };
      beep(0, 880);
      beep(0.22, 1046);
    } catch {
      /* áudio bloqueado — ignora */
    }
  }, []);

  const notify = useCallback((conv: ChatwootConversation) => {
    playTone();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(`Nova mensagem — ${sectorName}`, {
        body: `${conv.contactName}: ${conv.lastMessage || 'nova conversa'}`,
        tag: `saf-conv-${conv.id}`,
        icon: '/logo-rockfeller-branca.png',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  }, [playTone, sectorName]);

  // Detecta novas mensagens a cada atualização das conversas
  useEffect(() => {
    if (!enabled) {
      // Mantém baseline atualizado mesmo desativado, para não disparar em massa ao ativar
      seenRef.current = new Map(conversations.map((c) => [c.id, c.lastMessage]));
      initializedRef.current = true;
      return;
    }

    if (!initializedRef.current) {
      seenRef.current = new Map(conversations.map((c) => [c.id, c.lastMessage]));
      initializedRef.current = true;
      return;
    }

    for (const conv of conversations) {
      const prev = seenRef.current.get(conv.id);
      const isNew = prev === undefined;
      const changed = prev !== undefined && prev !== conv.lastMessage;
      if (isNew || changed) notify(conv);
    }

    seenRef.current = new Map(conversations.map((c) => [c.id, c.lastMessage]));
  }, [conversations, enabled, notify]);

  async function toggle() {
    if (enabled) {
      setEnabled(false);
      localStorage.setItem(STORAGE_KEY, 'false');
      return;
    }
    // Ativar: pede permissão + destrava áudio no gesto do clique
    let perm: NotificationPermission = permission;
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      perm = await Notification.requestPermission();
      setPermission(perm);
    }
    // Destrava o AudioContext dentro do gesto
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      await audioCtxRef.current.resume();
    } catch { /* ignore */ }

    setEnabled(true);
    localStorage.setItem(STORAGE_KEY, 'true');
    playTone(); // feedback de confirmação
  }

  const denied = permission === 'denied';

  return (
    <button
      onClick={toggle}
      disabled={denied}
      title={
        denied
          ? 'Notificações bloqueadas no navegador — libere nas permissões do site'
          : enabled
            ? 'Notificações ativadas — clique para desativar'
            : 'Ativar notificações de novas mensagens'
      }
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        enabled
          ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
          : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
      } disabled:opacity-50`}
    >
      {enabled ? <Bell size={13} /> : <BellOff size={13} />}
      {enabled ? 'Alertas ativos' : 'Ativar alertas'}
    </button>
  );
}
