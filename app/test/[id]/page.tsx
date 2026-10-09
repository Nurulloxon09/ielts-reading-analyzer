import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TestRunner from "@/components/TestRunner";
import { getTest, listTests, toPublicTest } from "@/lib/tests";

export function generateStaticParams() {
  return listTests().map((test) => ({ id: test.id }));
}

export async function generateMetadata({ params }: PageProps<"/test/[id]">): Promise<Metadata> {
  const { id } = await params;
  const test = getTest(id);
  return { title: test ? `${test.title} · IELTS Reading` : "Test not found" };
}

export default async function TestPage({ params }: PageProps<"/test/[id]">) {
  const { id } = await params;
  const test = getTest(id);
  if (!test) notFound();

  // The answer key stays on the server; the browser only gets the passage and questions.
  return <TestRunner test={toPublicTest(test)} />;
}
