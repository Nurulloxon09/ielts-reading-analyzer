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
  const where = process.env.VERCEL ? "in Vercel (Settings → Environment Variables), then redeploy" : "in .env.local";
  if (!apiKey) throw new Error(`The Gemini API key is missing. Add GEMINI_API_KEY ${where}.`);
  if (!model) throw new Error(`The Gemini model is missing. Add GEMINI_MODEL ${where}.`);
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

// One call gives up after this long. A model that is hanging is skipped for the next
// one instead of keeping her waiting on "Explaining…".
const CALL_TIMEOUT_MS = 45_000;

// The SDK aborts the request when httpOptions.timeout runs out.
function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

// The free tier has a per-minute and a per-day request limit. Waiting a few seconds
// only helps with the per-minute one.
function isDailyLimit(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 429 && /PerDay/i.test(err.message);
}

// A 504 or a timeout means the model is too slow right now: waiting again would not help.
function isRetryable(err: unknown): boolean {
  if (isDailyLimit(err)) return false;
  return err instanceof ApiError && (err.status === 429 || (err.status >= 500 && err.status !== 504));
}

// Worth trying the next model: out of quota, overloaded, too slow, or not available on this account.
function shouldTryNextModel(err: unknown): boolean {
  if (isTimeout(err)) return true;
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

// Models that were overloaded or too slow a moment ago go to the back of the line for a
// while, so the next explanation does not wait on them again. They are still tried last.
const SLOW_COOLDOWN_MS = 5 * 60_000;
const slowUntil = new Map<string, number>();

// Thrown when every configured model has used up its daily quota.
export class QuotaUsedUpError extends Error {
  resetsInMs: number;
  constructor(resetsInMs: number) {
    super("Every Gemini model has used up its free daily limit.");
    this.resetsInMs = resetsInMs;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type JsonRequest = {
  system: string;
  prompt: string;
  jsonSchema: unknown;
  // "lite": try the configured Flash-Lite models first (bigger free daily limit),
  // then the others. The model list itself still comes only from the env.
  prefer?: "lite";
};

function modelOrder(models: string[], prefer?: "lite"): string[] {
  if (prefer !== "lite") return models;
  const isLite = (m: string) => /lite/i.test(m);
  return [...models.filter(isLite), ...models.filter((m) => !isLite(m))];
}

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
          httpOptions: { timeout: CALL_TIMEOUT_MS },
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
  const { ai, models: configured } = getGemini();
  const ordered = modelOrder(configured, options.prefer);
  const isSlow = (m: string) => (slowUntil.get(m) ?? 0) > Date.now();
  const models = [...ordered.filter((m) => !isSlow(m)), ...ordered.filter(isSlow)];
  let lastError: unknown = null;

  for (const model of models) {
    if ((usedUpUntil.get(model) ?? 0) > Date.now()) continue;
    try {
      const text = await generateWithRetry(ai, model, options);
      slowUntil.delete(model);
      return text;
    } catch (err) {
      lastError = err;
      if (!shouldTryNextModel(err)) throw err;
      if (isDailyLimit(err)) usedUpUntil.set(model, Date.now() + resetDelayMs(err));
      else if (isTimeout(err) || (err instanceof ApiError && err.status >= 500)) {
        slowUntil.set(model, Date.now() + SLOW_COOLDOWN_MS);
      }
      const why = isTimeout(err) ? `no answer in ${CALL_TIMEOUT_MS / 1000}s` : (err as ApiError).status;
      console.warn(`[gemini] ${model} failed (${why}); trying the next model if there is one.`);
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
  if (isTimeout(err)) {
    return "Gemini took too long to answer. Try again in a minute.";
  }
  if (err instanceof ApiError && /API_KEY_INVALID|API key not valid/i.test(err.message)) {
    return "The Gemini API key is not valid. Check GEMINI_API_KEY (only the key, no quotes or spaces).";
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
