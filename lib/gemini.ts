// Server-only Gemini client. Never import this from client components.
import { ApiError, GoogleGenAI } from "@google/genai";

if (typeof window !== "undefined") {
  throw new Error("lib/gemini.ts must only be used on the server.");
}

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local.");
  if (!model) throw new Error("GEMINI_MODEL is not set in .env.local.");
  return { apiKey, model };
}

let client: GoogleGenAI | null = null;

function getGemini() {
  const { apiKey, model } = getGeminiConfig();
  client ??= new GoogleGenAI({ apiKey });
  return { ai: client, model };
}

// Free-tier limits: wait and retry on "too many requests" or "overloaded".
const RETRY_DELAYS_MS = [2_000, 6_000];

function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 429 || err.status >= 500);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One structured-output call. Returns the raw JSON text; callers validate it with zod.
// Temperature is left at the default: Google advises against lowering it for Gemini 3 models.
export async function generateJson(options: {
  system: string;
  prompt: string;
  jsonSchema: unknown;
}): Promise<string> {
  const { ai, model } = getGemini();
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.prompt,
        config: {
          systemInstruction: options.system,
          responseMimeType: "application/json",
          responseJsonSchema: options.jsonSchema,
        },
      });
      return response.text ?? "";
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(err)) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

// Short, key-free message for the browser.
export function describeGeminiError(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return "Gemini's free limit is used up for now. Wait a minute, or try again tomorrow if the daily limit is reached.";
  }
  if (err instanceof ApiError && err.status >= 500) {
    return "Gemini is busy right now. Try again in a minute.";
  }
  return err instanceof Error ? err.message : "Unknown error";
}
