import { MessageSquare, Send } from 'lucide-react';
import type { ConversationOrigin } from '@/repository/activeConversations';

export function ConversationOriginBadge({ origin }: { origin: ConversationOrigin }) {
  if (origin === 'ativo') {
    return (
      <span
        title="Conversa iniciada pela franqueadora no SAF Monitor"
        className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5
          text-xs font-medium text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
      >
        <Send size={11} />
        Ativo
      </span>
    );
  }

  return (
    <span
      title="Conversa iniciada pela escola no WhatsApp"
      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5
        text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    >
      <MessageSquare size={11} />
      Receptivo
    </span>
  );
}
