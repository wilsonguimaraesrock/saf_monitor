/**
 * Tom de alerta de nova mensagem.
 *
 * O AudioContext é um singleton do módulo porque precisa ser criado/destravado
 * dentro de um gesto do usuário (clique no sino) e depois reutilizado pelo
 * notificador global, que toca o som sem gesto nenhum.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

/** Chamar dentro do gesto de clique para liberar áudio nas políticas do navegador. */
export async function unlockNotificationSound(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
  } catch {
    /* áudio bloqueado — notificação visual continua funcionando */
  }
}

/** Dois beeps curtos. Silencioso se o navegador bloquear o áudio. */
export function playNotificationTone(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();

    const beep = (offset: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    };

    beep(0, 880);
    beep(0.22, 1046);
  } catch {
    /* ignora */
  }
}
