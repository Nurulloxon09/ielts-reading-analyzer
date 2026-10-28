// One test for the browser, without the answer key (used by mistake replay).
import { getTest, toPublicTest } from "@/lib/tests";

export async function GET(_request: Request, ctx: RouteContext<"/api/tests/[id]">) {
  const { id } = await ctx.params;
  const test = getTest(id);
  if (!test) return Response.json({ ok: false, error: "This test does not exist." }, { status: 404 });
  return Response.json({ ok: true, test: toPublicTest(test) });
}
