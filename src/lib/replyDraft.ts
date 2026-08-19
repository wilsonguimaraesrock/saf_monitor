/**
 * Rascunhos de resposta persistidos no navegador.
 *
 * Sem isso, uma mensagem já digitada existe só no state do React: fechar o
 * modal, recarregar a página ou perder a aba apaga o texto. Como o envio pode
 * falhar (Chatwoot sobrecarregado), o rascunho precisa sobreviver até o envio
 * ser confirmado.
 *
 * O rascunho só é apagado depois que o Chatwoot/dfranquias confirma o envio.
 */

const PREFIX = 'saf:draft:';
/** Rascunhos antigos são descartados na leitura — 7 dias. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  text: string;
  at: number;
}

function key(scope: string, id: string | number): string {
  return `${PREFIX}${scope}:${id}`;
}

export function loadDraft(scope: string, id: string | number): string {
  try {
    const raw = localStorage.getItem(key(scope, id));
    if (!raw) return '';
    const draft = JSON.parse(raw) as StoredDraft;
    if (typeof draft?.text !== 'string') return '';
    if (Date.now() - (draft.at ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(key(scope, id));
      return '';
    }
    return draft.text;
  } catch {
    // localStorage bloqueado ou JSON inválido — segue sem rascunho.
    return '';
  }
}

export function saveDraft(scope: string, id: string | number, text: string): void {
  try {
    if (!text.trim()) {
      localStorage.removeItem(key(scope, id));
      return;
    }
    localStorage.setItem(key(scope, id), JSON.stringify({ text, at: Date.now() } satisfies StoredDraft));
  } catch {
    /* cota cheia ou storage bloqueado — o texto continua no state da aba */
  }
}

/** Chame apenas após o envio ser confirmado pelo servidor. */
export function clearDraft(scope: string, id: string | number): void {
  try {
    localStorage.removeItem(key(scope, id));
  } catch {
    /* nada a fazer */
  }
}
