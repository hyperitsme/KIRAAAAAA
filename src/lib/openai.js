import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 15000,
  maxRetries: 1
});

async function withTimeout(promiseFn, ms, label="timeout"){
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await promiseFn(ac.signal); }
  catch (e){ if (e.name === "AbortError") throw new Error(label); throw e; }
  finally { clearTimeout(t); }
}

export async function generateText({ model, system, user, temperature=0.2, max_tokens=500 }){
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const m = model || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const resp = await withTimeout(
    (signal) => client.chat.completions.create({
      model: m,
      temperature,
      max_tokens,
      messages: [
        { role: "system", content: system || "You are a helpful assistant." },
        { role: "user",   content: user || "" }
      ]
    }, { signal }),
    15000,
    "openai_timeout"
  );

  return resp.choices?.[0]?.message?.content || "";
}
