import { NextRequest } from 'next/server';

/**
 * Validates the X-API-Key header against the SAF_API_KEY env var.
 * Returns null if authorized, or an error object with status to return immediately.
 */
export function validateApiKey(req: NextRequest): { error: string; status: number } | null {
  const apiKey = process.env.SAF_API_KEY?.trim();

  if (!apiKey) {
    return { error: 'SAF_API_KEY não configurada no servidor', status: 500 };
  }

  const provided = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!provided || provided !== apiKey) {
    return { error: 'API key inválida ou ausente. Use o header X-API-Key.', status: 401 };
  }

  return null;
}
