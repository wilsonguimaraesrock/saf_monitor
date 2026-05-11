/**
 * Cliente HTTP para o dfranquias — gerencia sessão via PHPSESSID e permite
 * enviar replies de SAF sem abrir browser (Playwright).
 *
 * Estratégia:
 *  1. Login via POST /login com fetch (captura PHPSESSID)
 *  2. Caches a sessão em memória por 25 min (expira antes do servidor)
 *  3. Para cada reply: GET /saf/{id}/show → extrai reply[_token] → POST
 */

const BASE_URL   = process.env.SAF_BASE_URL  ?? 'https://app.dfranquias.com.br';
const LOGIN_URL  = `${BASE_URL}/login`;
const USERNAME   = process.env.SAF_USERNAME  ?? '';
const PASSWORD   = process.env.SAF_PASSWORD  ?? '';

// Sessão em memória — sobrevive dentro de uma instância serverless (25 min TTL)
let cachedCookie = '';
let cookieExpiry = 0;

// ──────────────────────────────────────────────────────────────────────
// Login via fetch
// ──────────────────────────────────────────────────────────────────────
async function doLogin(): Promise<string> {
  if (!USERNAME || !PASSWORD) {
    throw new Error('SAF_USERNAME e SAF_PASSWORD não configurados');
  }

  // 1. GET login page — captura PHPSESSID inicial + campos ocultos (CSRF etc)
  const getRes = await fetch(LOGIN_URL, { redirect: 'follow' });
  const setCookie = getRes.headers.get('set-cookie') ?? '';
  const html = await getRes.text();

  // Extrai cookie de sessão inicial
  const initSession = (setCookie.match(/PHPSESSID=([^;]+)/) ?? [])[1] ?? '';

  // Extrai campos hidden do formulário (ex: _token, _csrf_token)
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
    username: USERNAME,
    password: PASSWORD,
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

  // Pega o PHPSESSID do Set-Cookie da resposta de login
  const respCookies = postRes.headers.get('set-cookie') ?? '';
  const sessionMatch = respCookies.match(/PHPSESSID=([^;]+)/);

  // Se não veio novo cookie, tenta reusar o inicial (algumas implementações não re-emitem)
  const sessionId = sessionMatch?.[1] ?? initSession;
  if (!sessionId) {
    throw new Error('Login dfranquias falhou — nenhum PHPSESSID recebido');
  }

  return `PHPSESSID=${sessionId}`;
}

// ──────────────────────────────────────────────────────────────────────
// Obtém sessão válida (com cache)
// ──────────────────────────────────────────────────────────────────────
async function getSession(): Promise<string> {
  if (cachedCookie && Date.now() < cookieExpiry) return cachedCookie;
  cachedCookie = await doLogin();
  cookieExpiry = Date.now() + 25 * 60 * 1000; // 25 min
  return cachedCookie;
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

  // Procura o token no hidden input do formulário de reply
  const match =
    html.match(/name="reply\[_token\]"[^>]*value="([^"]+)"/) ??
    html.match(/value="([^"]+)"[^>]*name="reply\[_token\]"/);

  if (!match?.[1]) throw new Error('reply[_token] não encontrado na página do SAF');
  return match[1];
}

// ──────────────────────────────────────────────────────────────────────
// Envia reply para um SAF no dfranquias
// ──────────────────────────────────────────────────────────────────────
export async function sendDfranquiasReply(safId: string, message: string): Promise<void> {
  const cookie = await getSession();
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
    redirect: 'manual', // não seguir redirect — sucesso = 302
  });

  // dfranquias redireciona de volta para o show após reply com sucesso
  if (res.status !== 302 && res.status !== 200 && res.status !== 303) {
    // Se recebemos a própria página de volta, pode ainda ter dado certo
    if (res.status >= 400) {
      // Sessão pode ter expirado — limpa e lança erro para retry
      cachedCookie = '';
      cookieExpiry = 0;
      throw new Error(`Reply falhou: ${res.status}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Invalida sessão manualmente (útil se receber 401/403 em outro lugar)
// ──────────────────────────────────────────────────────────────────────
export function clearDfranquiasSession(): void {
  cachedCookie = '';
  cookieExpiry = 0;
}
