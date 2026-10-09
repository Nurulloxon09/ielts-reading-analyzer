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

// The free tier has a per-minute and a per-day request limit. Waiting a few seconds
// only helps with the per-minute one.
function isDailyLimit(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 429 && /PerDay/i.test(err.message);
}

function isRetryable(err: unknown): boolean {
  if (isDailyLimit(err)) return false;
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
  if (isDailyLimit(err)) {
    const hours = /retry in (\d+)h/i.exec(err.message)?.[1];
    return hours
      ? `Today's free Gemini limit is used up. It resets in about ${Number(hours) + 1} hours.`
      : "Today's free Gemini limit is used up. Try again tomorrow.";
  }
  if (err instanceof ApiError && err.status === 429) {
    return "Gemini is getting too many requests. Wait a minute and try again.";
  }
  if (err instanceof ApiError && err.status >= 500) {
    return "Gemini is busy right now. Try again in a minute.";
  }
  return err instanceof Error ? err.message : "Unknown error";
}
