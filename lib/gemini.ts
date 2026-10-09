// Server-only Gemini client. Never import this from client components.
import { ApiError, GoogleGenAI } from "@google/genai";

if (typeof window !== "undefined") {
  throw new Error("lib/gemini.ts must only be used on the server.");
}

// GEMINI_MODEL is tried first, then each model in GEMINI_FALLBACK_MODELS (comma-separated).
// Free-tier quotas are counted per model, so a fallback model has its own daily limit.
export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local.");
  if (!model) throw new Error("GEMINI_MODEL is not set in .env.local.");
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m && m !== model);
  return { apiKey, models: [model, ...new Set(fallbacks)] };
}

let client: GoogleGenAI | null = null;

function getGemini() {
  const { apiKey, models } = getGeminiConfig();
  client ??= new GoogleGenAI({ apiKey });
  return { ai: client, models };
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

// Worth trying the next model: out of quota, overloaded, or not available on this account.
function shouldTryNextModel(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 429 || err.status === 404 || err.status >= 500);
}

// How long until the daily quota resets, from Gemini's "retryDelay" (default: 1 hour).
function resetDelayMs(err: ApiError): number {
  const seconds = /"retryDelay":\s*"(\d+)s"/.exec(err.message)?.[1];
  return seconds ? Number(seconds) * 1000 : 60 * 60 * 1000;
}

// Models whose daily quota is used up, and when to try them again. Kept in memory,
// so a used-up model is skipped instead of costing a wasted call every time.
const usedUpUntil = new Map<string, number>();

// Thrown when every configured model has used up its daily quota.
export class QuotaUsedUpError extends Error {
  resetsInMs: number;
  constructor(resetsInMs: number) {
    super("Every Gemini model has used up its free daily limit.");
    this.resetsInMs = resetsInMs;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type JsonRequest = { system: string; prompt: string; jsonSchema: unknown };

async function generateWithRetry(ai: GoogleGenAI, model: string, options: JsonRequest): Promise<string> {
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

// One structured-output call. Returns the raw JSON text; callers validate it with zod.
// Tries each configured model in order until one answers.
// Temperature is left at the default: Google advises against lowering it for Gemini 3 models.
export async function generateJson(options: JsonRequest): Promise<string> {
  const { ai, models } = getGemini();
  let lastError: unknown = null;

  for (const model of models) {
    if ((usedUpUntil.get(model) ?? 0) > Date.now()) continue;
    try {
      return await generateWithRetry(ai, model, options);
    } catch (err) {
      lastError = err;
      if (!shouldTryNextModel(err)) throw err;
      if (isDailyLimit(err)) usedUpUntil.set(model, Date.now() + resetDelayMs(err));
      console.warn(`[gemini] ${model} failed (${(err as ApiError).status}); trying the next model if there is one.`);
    }
  }

  // Every model is used up for today: say when the first one comes back.
  const resets = models.map((m) => usedUpUntil.get(m) ?? 0);
  if (resets.every((t) => t > Date.now())) throw new QuotaUsedUpError(Math.min(...resets) - Date.now());
  throw lastError;
}

// Short, key-free message for the browser.
export function describeGeminiError(err: unknown): string {
  if (err instanceof QuotaUsedUpError) {
    const hours = Math.max(1, Math.ceil(err.resetsInMs / 3_600_000));
    return `Today's free Gemini limit is used up. It resets in about ${hours} ${hours === 1 ? "hour" : "hours"}.`;
  }
  if (err instanceof ApiError && err.status === 429) {
    return "Gemini is getting too many requests. Wait a minute and try again.";
  }
  if (err instanceof ApiError && err.status === 404) {
    return "The Gemini model in .env.local was not found. Check GEMINI_MODEL.";
  }
  if (err instanceof ApiError && err.status >= 500) {
    return "Gemini is busy right now. Try again in a minute.";
  }
  return err instanceof Error ? err.message : "Unknown error";
}
