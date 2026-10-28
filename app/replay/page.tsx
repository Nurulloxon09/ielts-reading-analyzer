import type { Metadata } from "next";
import MistakeReplay from "@/components/MistakeReplay";

export const metadata: Metadata = { title: "Re-try your mistakes · IELTS Reading" };

export default function ReplayPage() {
  return <MistakeReplay />;
}
