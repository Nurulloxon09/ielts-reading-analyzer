import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import TestRunner, { TestLoading } from "@/components/TestRunner";
import { getTest, listTests, toPublicTest } from "@/lib/tests";

export function generateStaticParams() {
  return listTests().map((test) => ({ id: test.id }));
}

export async function generateMetadata({ params }: PageProps<"/test/[id]">): Promise<Metadata> {
  const { id } = await params;
  const test = getTest(id);
  return { title: test ? `${test.title} · IELTS Reading` : "Test not found" };
}

// params are read inside <Suspense> so the page shell can show instantly.
export default function TestPage({ params }: PageProps<"/test/[id]">) {
  return (
    <Suspense fallback={<TestLoading />}>
      <LoadedTest params={params} />
    </Suspense>
  );
}

async function LoadedTest({ params }: Pick<PageProps<"/test/[id]">, "params">) {
  const { id } = await params;
  const test = getTest(id);
  if (!test) notFound();

  // The answer key stays on the server; the browser only gets the passage and questions.
  return <TestRunner test={toPublicTest(test)} />;
}
