import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateText({ model, system, user, temperature = 0.2 }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }
  const m = model || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const resp = await client.chat.completions.create({
    model: m,
    temperature,
    messages: [
      { role: 'system', content: system || 'You are a helpful assistant.' },
      { role: 'user', content: user || '' }
    ]
  });
  return resp.choices?.[0]?.message?.content || '';
}
