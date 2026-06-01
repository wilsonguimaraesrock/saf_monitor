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
    ? `\n\nBase de conhecimento relevante:\n${contextChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}`
    : '';

  const res = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt + context },
      { role: 'user',   content: userMessage },
    ],
    max_tokens: 600,
    temperature: 0.3,
  });

  return res.choices[0].message.content ?? '';
}
