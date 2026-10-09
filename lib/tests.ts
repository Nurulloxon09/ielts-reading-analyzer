// Server-only: loads reading tests from content/tests/*.json.
// Files are read synchronously so Next can prerender the pages at build time.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { TestSchema, type PublicTest, type Test } from "@/lib/test-schema";

if (typeof window !== "undefined") {
  throw new Error("lib/tests.ts must only be used on the server.");
}

const TESTS_DIR = path.join(process.cwd(), "content", "tests");

function loadFile(file: string): Test {
  const fullPath = path.join(TESTS_DIR, file);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (err) {
    throw new Error(`content/tests/${file} is not valid JSON: ${err instanceof Error ? err.message : err}`);
  }
  const result = TestSchema.safeParse(json);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`)
      .join("\n");
    throw new Error(`content/tests/${file} has problems:\n${problems}`);
  }
  if (`${result.data.id}.json` !== file) {
    throw new Error(`content/tests/${file}: "id" must match the file name ("${file.replace(/\.json$/, "")}").`);
  }
  return result.data;
}

export function listTests(): Test[] {
  let files: string[];
  try {
    files = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map(loadFile).sort((a, b) => a.title.localeCompare(b.title));
}

export function getTest(id: string): Test | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  if (!existsSync(path.join(TESTS_DIR, `${id}.json`))) return null;
  return loadFile(`${id}.json`);
}

// Removes the answer key before anything is sent to the browser.
export function toPublicTest(test: Test): PublicTest {
  const { answers: _answers, ...rest } = test;
  void _answers;
  return rest;
}

export function acceptedAnswers(test: Test, n: number): string[] {
  const raw = test.answers[String(n)];
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}
