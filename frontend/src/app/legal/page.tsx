"use client";

import type { LegalDocument } from "@social-matching/shared";
import { useRouter } from "next/navigation";

import { Button, Card, Screen, Spinner } from "@/components/ui";
import { useLegal } from "@/lib/queries";

/** Public: the terms must be readable before signing in. */
export default function LegalPage() {
  const router = useRouter();
  const legal = useLegal();

  return (
    <Screen>
      <header className="flex items-center gap-3">
        <Button variant="ghost" className="px-2" onClick={() => router.back()} aria-label="Back">
          ←
        </Button>
        <h1 className="text-2xl font-bold">Terms &amp; privacy</h1>
      </header>

      {legal.isPending && <Spinner className="mx-auto size-8" />}
      <Document title="Terms of use" document={legal.data?.terms} />
      <Document title="Privacy policy" document={legal.data?.privacy} />
    </Screen>
  );
}

function Document({ title, document }: { title: string; document: LegalDocument | null | undefined }) {
  if (document === undefined) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{document?.title ?? title}</h2>
        {document && <span className="text-xs text-zinc-500">v{document.revision}</span>}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{document?.content ?? "Not published yet."}</p>
    </Card>
  );
}
