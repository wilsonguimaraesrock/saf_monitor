import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // hard limit
  });
  return res.data[0].embedding;
}

export async function chatCompletion(
  systemPrompt: string,
  userMessage: string,
  contextChunks: string[]
): Promise<string> {
  const context = contextChunks.length > 0
    ? `\n\n# BASE DE CONHECIMENTO (única fonte de verdade)\n${contextChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}\n\n# REGRAS OBRIGATÓRIAS\n- Responda usando SOMENTE as informações da base acima.\n- NUNCA invente, suponha ou use conhecimento externo.\n- Os trechos acima são todos do MESMO documento/assunto — não misture com outros produtos ou tópicos.\n- Se a resposta não estiver claramente na base acima, responda exatamente: "Não tenho essa informação aqui. Posso te transferir para um atendente humano?"\n- Seja direto e objetivo; cite procedimentos passo a passo quando houver.`
    : `\n\n# ATENÇÃO\nNenhum documento relevante foi encontrado na base de conhecimento. NÃO invente uma resposta. Responda exatamente: "Não tenho essa informação aqui. Posso te transferir para um atendente humano?"`;

  const res = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt + context },
      { role: 'user',   content: userMessage },
    ],
    max_tokens: 900,
    temperature: 0.2,
  });

  return res.choices[0].message.content ?? '';
}
