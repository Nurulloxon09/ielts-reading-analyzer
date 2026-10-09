// Checks her answers against the answer key, which never leaves the server.
import { gradeTest } from "@/lib/answers";
import { GradeRequestSchema } from "@/lib/schema";
import { getTest } from "@/lib/tests";

export async function POST(request: Request, ctx: RouteContext<"/api/tests/[id]/grade">) {
  const { id } = await ctx.params;
  const test = getTest(id);
  if (!test) return Response.json({ ok: false, error: "This test does not exist." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = GradeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid answers." }, { status: 400 });
  }

  return Response.json({ ok: true, results: gradeTest(test, parsed.data.answers) });
}
