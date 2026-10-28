import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import GistDrill from "@/components/GistDrill";
import { TestLoading } from "@/components/TestRunner";
import { compareLists, gistLabels } from "@/lib/gist";
import { getTest, listTests, toPublicTest } from "@/lib/tests";

export function generateStaticParams() {
  return listTests()
    .filter((t) => gistLabels(toPublicTest(t)).length >= 2)
    .map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: PageProps<"/gist/[id]">): Promise<Metadata> {
  const { id } = await params;
  const test = getTest(id);
  return { title: test ? `Main ideas: ${test.title} · IELTS Reading` : "Test not found" };
}

export default function GistPage({ params }: PageProps<"/gist/[id]">) {
  return (
    <Suspense fallback={<TestLoading />}>
      <LoadedGist params={params} />
    </Suspense>
  );
}

async function LoadedGist({ params }: Pick<PageProps<"/gist/[id]">, "params">) {
  const { id } = await params;
  const test = getTest(id);
  if (!test) notFound();
  const publicTest = toPublicTest(test);
  const labels = gistLabels(publicTest);
  if (labels.length < 2) notFound();

  // No answer key: only the passage and the lists she also sees in the test.
  return <GistDrill test={publicTest} labels={labels} compare={compareLists(publicTest)} />;
}
