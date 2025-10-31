import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper: create JSON via Responses API and parse safely
export async function generateJSON({ model, prompt, schemaName, schema }) {
  // Pakai Responses API (lebih baru/sederhana daripada chat-completions).
  // Referensi: API Reference & Structured Outputs. 
  const res = await openai.responses.create({
    model,
    input: prompt,
    // Kamu bisa gunakan Structured Outputs; di sini kita tetap parse manual demi kompatibilitas luas.
    // response_format: { type: "json_schema", json_schema: { name: schemaName, schema } }
  });

  const text = res.output_text || "";
  try {
    return JSON.parse(text);
  } catch (e) {
    // fallback: coba cari blok JSON di teks
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model returned non-JSON:\n" + text);
  }
}

export async function generateText({ model, system, user }) {
  const input = [
    system ? `System:\n${system}` : "",
    `User:\n${user}`
  ].filter(Boolean).join("\n\n");

  const res = await openai.responses.create({
    model,
    input
  });

  return res.output_text?.trim() ?? "";
}
