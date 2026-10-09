import InputForm from "@/components/InputForm";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">IELTS Reading Mistake Analyzer</h1>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        Paste a passage, the questions and your answers. Then check which ones you got wrong.
      </p>
      <InputForm />
    </main>
  );
}
