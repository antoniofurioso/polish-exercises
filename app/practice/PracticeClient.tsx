"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AccessGate } from "@/components/AccessGate";
import { SyncOnFinish } from "@/components/account";
import { Runner } from "@/components/Runner";
import { DRILLS } from "@/lib/drills";
import { parseSession, randomSeed, sessionParams } from "@/lib/session";
import type { Config } from "@/lib/types";

/**
 * The session lives entirely in the query string, read on the client so the
 * whole app can be exported as static files.
 */
export function PracticePage() {
  const params = useSearchParams();
  const session = useMemo(() => parseSession(new URLSearchParams(params.toString())), [params]);

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-24 text-center">
        <p className="text-muted">This practice link has no settings in it.</p>
        <Link href="/learn" className="btn btn-primary mt-6">
          Set up a session
        </Link>
      </main>
    );
  }

  // a new seed means a new set of sentences, so start the runner from scratch
  return (
    <AccessGate from="practice">
      <ConfiguredSession key={session.seed} config={session.config} seed={session.seed} />
    </AccessGate>
  );
}

function ConfiguredSession({ config, seed }: { config: Config; seed: number }) {
  const router = useRouter();
  const kind = config.kind ?? "cases";
  const exercises = useMemo(() => DRILLS[kind].build(config, seed), [kind, config, seed]);

  return (
    <Runner
      exercises={exercises}
      kind={kind}
      home={DRILLS[kind].route}
      onRestart={() => router.push(`/practice?${sessionParams(config, randomSeed())}`)}
      summaryExtra={<SyncOnFinish />}
    />
  );
}
