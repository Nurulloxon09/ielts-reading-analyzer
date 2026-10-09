// Server-only Gemini client. Never import this from client components.
import { GoogleGenAI } from "@google/genai";

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

export function getGemini() {
  const { apiKey, model } = getGeminiConfig();
  client ??= new GoogleGenAI({ apiKey });
  return { ai: client, model };
}
