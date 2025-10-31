// src/lib/openai.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // SDK sudah dukung timeout (ms) dan retries
  timeout: 15000,        // 15s hard timeout ke OpenAI
  maxRetries: 1
});

// Fallback AbortController (untuk jaga-jaga)
async function withTimeout(promise, ms, label = "timeout") {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await promise(ac.signal);
  } catch (e) {
    if (e.name === "AbortError") throw new Error(label);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function generateText({
  model,
  system,
  user,
  temperature = 0.2,
  max_tokens = 500 // batasi jawaban biar cepat & tidak kebanyakan
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }
  const m = model || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  // panggilan dibungkus timeout tambahan supaya benar2 fail-fast < 15s
  const resp = await withTimeout(
    (signal) => client.chat.completions.create({
      model: m,
      temperature,
      max_tokens,
      messages: [
        { role: "system", content: system || "You are a helpful assistant." },
        { role: "user", content: user || "" }
      ]
    }, { signal }),
    15000,
    "openai_timeout"
  );

  return resp.choices?.[0]?.message?.content || "";
}
