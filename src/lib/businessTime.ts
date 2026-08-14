/**
 * Tempo útil — a espera não conta durante o fim de semana.
 *
 * Regra do negócio: nada é contabilizado entre sexta 18:00 e segunda 08:00
 * (horário de Brasília). O Brasil não tem horário de verão desde 2019, então
 * UTC-3 é constante e um offset fixo basta.
 */

const TZ_OFFSET_SEC = -3 * 3600;
const DAY = 86400;
const WEEKEND_START_HOUR = 18; // sexta-feira
const WEEKEND_END_HOUR   = 8;  // segunda-feira

/** Segundos de [startLocal, endLocal] que caem dentro de janelas de fim de semana. */
function weekendOverlapSeconds(startLocal: number, endLocal: number): number {
  const startDay = Math.floor(startLocal / DAY);
  // 1970-01-01 foi quinta-feira → 0 = domingo, 5 = sexta
  const dow = (((startDay + 4) % 7) + 7) % 7;
  let fridayDay = startDay - ((dow - 5 + 7) % 7); // sexta mais recente até startLocal

  let total = 0;
  for (;;) {
    const winStart = fridayDay * DAY + WEEKEND_START_HOUR * 3600;
    const winEnd   = (fridayDay + 3) * DAY + WEEKEND_END_HOUR * 3600;
    if (winStart >= endLocal) break;
    const overlap = Math.min(endLocal, winEnd) - Math.max(startLocal, winStart);
    if (overlap > 0) total += overlap;
    fridayDay += 7;
  }
  return total;
}

/** Segundos úteis entre dois instantes (epoch em segundos), sem o fim de semana. */
export function businessElapsedSeconds(fromSec: number, toSec: number): number {
  if (!fromSec || !toSec || toSec <= fromSec) return 0;
  const start = fromSec + TZ_OFFSET_SEC;
  const end   = toSec   + TZ_OFFSET_SEC;
  return Math.max(0, end - start - weekendOverlapSeconds(start, end));
}

/** Espera útil de uma conversa desde `waitingSinceSec` até agora. */
export function businessWaitSeconds(
  waitingSinceSec: number,
  nowSec: number = Math.floor(Date.now() / 1000)
): number {
  return businessElapsedSeconds(waitingSinceSec, nowSec);
}
