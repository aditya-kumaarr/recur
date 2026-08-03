"use client";

import { useState } from "react";

type Step = {
  label: string;
  detail: string;
  status: "done" | "failed";
};

type DebugResponse = {
  steps: Step[];
  before: string;
  after: string;
  pass: boolean;
};

export default function AgentDemo() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<DebugResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAgent() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/debug", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data: DebugResponse = await res.json();
      setResult(data);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl bg-[#e2ded2] p-3 sm:p-4">
      <div className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-sm font-medium">Agent log</span>
          {state === "done" && result && (
            <span
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (result.pass
                  ? "bg-[#f0f9e2] text-[#3b6d11]"
                  : "bg-[#fcebeb] text-[#a32d2d]")
              }
            >
              {result.pass ? "tests green" : "tests still red"}
            </span>
          )}
        </div>

        {state === "idle" && (
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted">
              seed-repo/sum.js has a planted bug. Run the agent to watch it
              diagnose, patch, test, and self-review.
            </p>
            <button
              onClick={runAgent}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Debug it
            </button>
          </div>
        )}

        {state === "loading" && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            thinking, patching, testing…
          </div>
        )}

        {state === "error" && (
          <div className="py-6 text-sm text-[#a32d2d]">{error}</div>
        )}

        {state === "done" && result && (
          <>
            <ol className="mt-4 flex flex-col gap-4">
              {result.steps.map((step) => (
                <li key={step.label} className="flex items-start gap-3">
                  <span
                    className={
                      "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full " +
                      (step.status === "done" ? "bg-foreground" : "bg-[#e24b4a]")
                    }
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                      <path
                        d="M1 4l2 2 4-4"
                        stroke="var(--background)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{step.label}</span>
                    <span className="block text-sm text-muted">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            <button
              onClick={runAgent}
              className="mt-5 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-[#f5f3ee]"
            >
              Run again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
