"use client";

import { useState } from "react";

type Step = {
  label: string;
  detail: string;
  status: "done" | "failed";
};

type StreamEvent =
  | ({ type: "step" } & Step)
  | { type: "result"; before: string; after: string; pass: boolean }
  | { type: "error"; message: string };

type Result = { before: string; after: string; pass: boolean };

export default function AgentDemo() {
  const [state, setState] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAgent() {
    setState("streaming");
    setSteps([]);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/debug", { method: "POST" });
      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event: StreamEvent = JSON.parse(line);
          if (event.type === "step") {
            setSteps((prev) => [...prev, event]);
          } else if (event.type === "result") {
            setResult(event);
            setState("done");
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
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
          {state === "streaming" && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              running
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

        {state === "error" && (
          <div className="py-6 text-sm text-[#a32d2d]">{error}</div>
        )}

        {(state === "streaming" || state === "done") && (
          <>
            {steps.length === 0 && (
              <div className="flex items-center gap-2 py-6 text-sm text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                reading the failure…
              </div>
            )}
            <ol className="mt-4 flex flex-col gap-4">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
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
            {state === "streaming" && steps.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                next step…
              </div>
            )}
            {state === "done" && (
              <button
                onClick={runAgent}
                className="mt-5 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-[#f5f3ee]"
              >
                Run again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
