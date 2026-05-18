import { Suspense } from "react";
import { HomeShell } from "@/components/home-shell";

export default function Home() {
  return (
    <Suspense fallback={<main className="p-6 text-sm font-bold text-rosewood">Opening Love Room...</main>}>
      <HomeShell />
    </Suspense>
  );
}
