import type { Metadata } from "next";
import ParaphraseDrill from "@/components/ParaphraseDrill";

export const metadata: Metadata = { title: "Spot the paraphrase · IELTS Reading" };

export default function ParaphrasePage() {
  return <ParaphraseDrill />;
}
