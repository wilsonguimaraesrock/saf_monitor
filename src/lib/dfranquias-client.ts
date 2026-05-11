/**
 * Cliente HTTP para o dfranquias — gerencia sessão via PHPSESSID e permite
 * enviar replies de SAF sem abrir browser (Playwright).
 *
 * Estratégia:
 *  1. Login via POST /login com fetch (captura PHPSESSID)
 *  2. Cache de sessão por usuário em Map (25 min TTL cada)
 *  3. Para cada reply: GET /saf/{id}/show → extrai reply[_token] → POST
 *
 * Credenciais do servidor (SAF_USERNAME/SAF_PASSWORD) são usadas apenas
 * pelo scraper para listar SAFs. Replies usam credenciais por atendente.
 */

const BASE_URL  = process.env.SAF_BASE_URL ?? 'https://app.dfranquias.com.br';
const LOGIN_URL = `${BASE_URL}/login`;

// Cache por usuário: username → { cookie, expiry }
const sessionCache = new Map<string, { cookie: string; expiry: number }>();

// ──────────────────────────────────────────────────────────────────────
// Login via fetch
// ──────────────────────────────────────────────────────────────────────
async function doLogin(username: string, password: string): Promise<string> {
  // 1. GET login page — captura PHPSESSID inicial + campos ocultos
  const getRes = await fetch(LOGIN_URL, { redirect: 'follow' });
  const setCookie = getRes.headers.get('set-cookie') ?? '';
  const html = await getRes.text();

  const initSession = (setCookie.match(/PHPSESSID=([^;]+)/) ?? [])[1] ?? '';

  const hiddenFields: Record<string, string> = {};
  for (const [, name, value] of html.matchAll(/type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)) {
    hiddenFields[name] = value;
  }
  for (const [, name, value] of html.matchAll(/name="([^"]+)"[^>]*type="hidden"[^>]*value="([^"]*)"/g)) {
    hiddenFields[name] = value;
  }

  // 2. POST credentials
  const body = new URLSearchParams({
    ...hiddenFields,
    username,
    password,
  });

  const postRes = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': initSession ? `PHPSESSID=${initSession}` : '',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: body.toString(),
    redirect: 'manual',
  });

  const respCookies = postRes.headers.get('set-cookie') ?? '';
  const sessionMatch = respCookies.match(/PHPSESSID=([^;]+)/);
  const sessionId = sessionMatch?.[1] ?? initSession;

  if (!sessionId) {
    throw new Error('Login dfranquias falhou — nenhum PHPSESSID recebido');
  }

  // Verifica se o login realmente funcionou (dfranquias redireciona para / em caso de sucesso)
  const location = postRes.headers.get('location') ?? '';
  if (location.includes('/login') || postRes.status === 200) {
    // Ficou na página de login — credenciais incorretas
    throw new Error('Usuário ou senha incorretos no dfranquias');
  }

  return `PHPSESSID=${sessionId}`;
}

// ──────────────────────────────────────────────────────────────────────
// Obtém sessão válida (com cache por usuário)
// ──────────────────────────────────────────────────────────────────────
async function getSession(username: string, password: string): Promise<string> {
  const cached = sessionCache.get(username);
  if (cached && Date.now() < cached.expiry) return cached.cookie;

  const cookie = await doLogin(username, password);
  sessionCache.set(username, { cookie, expiry: Date.now() + 25 * 60 * 1000 });
  return cookie;
}

// ──────────────────────────────────────────────────────────────────────
// Extrai o reply[_token] da página do SAF
// ──────────────────────────────────────────────────────────────────────
async function getReplyToken(safId: string, cookie: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/saf/${safId}/show`, {
    headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) throw new Error(`Falha ao carregar SAF ${safId}: ${res.status}`);

  const html = await res.text();

  const match =
    html.match(/name="reply\[_token\]"[^>]*value="([^"]+)"/) ??
    html.match(/value="([^"]+)"[^>]*name="reply\[_token\]"/);

  if (!match?.[1]) throw new Error('reply[_token] não encontrado na página do SAF');
  return match[1];
}

// ──────────────────────────────────────────────────────────────────────
// Envia reply para um SAF no dfranquias usando credenciais do atendente
// ──────────────────────────────────────────────────────────────────────
export async function sendDfranquiasReply(
  safId: string,
  message: string,
  username: string,
  password: string,
): Promise<void> {
  const cookie = await getSession(username, password);
  const token  = await getReplyToken(safId, cookie);

  const body = new URLSearchParams({
    'reply[mensagem]': message,
    'reply[_token]':   token,
  });

  const res = await fetch(`${BASE_URL}/saf/${safId}/show`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'Referer': `${BASE_URL}/saf/${safId}/show`,
      'User-Agent': 'Mozilla/5.0',
    },
    body: body.toString(),
    redirect: 'manual',
  });

  if (res.status >= 400) {
    // Sessão expirada — invalida cache e lança erro
    sessionCache.delete(username);
    throw new Error(`Reply falhou: ${res.status}`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Invalida sessão de um usuário específico
// ──────────────────────────────────────────────────────────────────────
export function clearDfranquiasSession(username?: string): void {
  if (username) {
    sessionCache.delete(username);
  } else {
    sessionCache.clear();
  }
}
