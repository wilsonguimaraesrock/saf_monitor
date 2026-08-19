/**
 * Token somente-leitura do dashboard público.
 *
 * Separado da SAF_API_KEY de propósito: esta credencial vai rodar num painel
 * de terceiros (possivelmente dentro do navegador, onde nada é secreto), então
 * ela só destrava indicadores agregados. Se vazar, ninguém ganha acesso à API
 * v1 completa nem a dados de ticket individuais.
 *
 * Aceito por header (`X-Dashboard-Token` ou `Authorization: Bearer`) e por
 * querystring (`?token=`) — a querystring é o único caminho possível quando o
 * painel só permite colar uma URL, ou num iframe.
 */

import { NextRequest } from 'next/server';

export const DASHBOARD_TOKEN_ENV = 'SAF_DASHBOARD_TOKEN';

/** Comparação sem short-circuit por caractere, para não vazar o token por tempo. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type DashboardAuthResult =
  | { ok: true }
  | { ok: false; error: string; status: 401 | 500 };

export function extractToken(req: NextRequest): string | null {
  return (
    req.headers.get('x-dashboard-token')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    req.nextUrl.searchParams.get('token')?.trim() ||
    null
  );
}

/**
 * Validação do valor cru do token — usada pela página /publico/dashboard, que
 * é um Server Component e recebe searchParams em vez de um NextRequest.
 */
export function isValidDashboardToken(provided?: string | null): boolean {
  const expected = process.env[DASHBOARD_TOKEN_ENV]?.trim();
  if (!expected || !provided?.trim()) return false;
  return safeEqual(provided.trim(), expected);
}

export function validateDashboardToken(req: NextRequest): DashboardAuthResult {
  const expected = process.env[DASHBOARD_TOKEN_ENV]?.trim();

  if (!expected) {
    return {
      ok: false,
      status: 500,
      error: `${DASHBOARD_TOKEN_ENV} não configurada no servidor. Defina-a nas variáveis de ambiente para liberar o dashboard público.`,
    };
  }

  const provided = extractToken(req);

  if (!provided || !safeEqual(provided, expected)) {
    return {
      ok: false,
      status: 401,
      error: 'Token inválido ou ausente. Envie o header X-Dashboard-Token ou o parâmetro ?token=.',
    };
  }

  return { ok: true };
}

/**
 * O painel é uma aplicação de terceiros no navegador, então precisa de CORS.
 * `*` é aceitável aqui porque o acesso é controlado pelo token, não pela
 * origem, e o endpoint é somente-leitura e sem cookies.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'X-Dashboard-Token, Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};
