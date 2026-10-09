// Day 1 connection test: one Gemini call. Remove once /api/analyze works.
import { connection } from "next/server";
import { getGemini } from "@/lib/gemini";
import { HEALTH_CHECK_PROMPT } from "@/lib/prompts";

export async function GET() {
  // Run at request time only, never prerendered at build.
  await connection();

  try {
    const { ai, model } = getGemini();
    const response = await ai.models.generateContent({
      model,
      contents: HEALTH_CHECK_PROMPT,
      config: { temperature: 0.2 },
    });
    return Response.json({ ok: true, model, reply: response.text ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
