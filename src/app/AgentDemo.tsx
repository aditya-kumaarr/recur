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

const MAX_LEN = 4000;

const CODE_PLACEHOLDER = `function sum(a, b) {
  return a - b;
}

module.exports = { sum };`;

const TEST_PLACEHOLDER = `const test = require("node:test");
const assert = require("node:assert");
const { sum } = require("./code");

test("adds two numbers", () => {
  assert.strictEqual(sum(2, 3), 5);
});`;

export default function AgentDemo() {
  const [mode, setMode] = useState<"demo" | "custom">("demo");
  const [code, setCode] = useState("");
  const [testSource, setTestSource] = useState("");
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
      const res = await fetch("/api/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          mode === "custom"
            ? JSON.stringify({ code, test: testSource })
            : JSON.stringify({}),
      });
      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? (await res.text()));
      }

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

  function reset() {
    setState("idle");
    setSteps([]);
    setResult(null);
    setError(null);
  }

  const canSubmitCustom = code.trim().length > 0 && testSource.trim().length > 0;

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
          <div className="flex flex-col gap-4 py-5">
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setMode("demo")}
                className={
                  "rounded-full px-3 py-1.5 font-medium " +
                  (mode === "demo"
                    ? "bg-foreground text-background"
                    : "border border-border text-muted hover:text-foreground")
                }
              >
                Demo bug
              </button>
              <button
                onClick={() => setMode("custom")}
                className={
                  "rounded-full px-3 py-1.5 font-medium " +
                  (mode === "custom"
                    ? "bg-foreground text-background"
                    : "border border-border text-muted hover:text-foreground")
                }
              >
                Your own bug
              </button>
            </div>

            {mode === "demo" ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted">
                  seed-repo/sum.js has a planted bug. Run the agent to watch
                  it diagnose, patch, test, and self-review.
                </p>
                <button
                  onClick={runAgent}
                  className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                >
                  Debug it
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  Paste a broken function and a test for it. Your code must
                  export via <code>module.exports</code> and your test must{" "}
                  <code>require(&quot;./code&quot;)</code> — runs isolated,
                  no network access, {MAX_LEN} char limit each.
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Your code (code.js)
                  </label>
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value.slice(0, MAX_LEN))}
                    placeholder={CODE_PLACEHOLDER}
                    rows={6}
                    className="w-full rounded-lg border border-border bg-[#faf9f6] p-3 font-mono text-xs text-foreground outline-none focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Your test (code.test.js)
                  </label>
                  <textarea
                    value={testSource}
                    onChange={(e) => setTestSource(e.target.value.slice(0, MAX_LEN))}
                    placeholder={TEST_PLACEHOLDER}
                    rows={6}
                    className="w-full rounded-lg border border-border bg-[#faf9f6] p-3 font-mono text-xs text-foreground outline-none focus:border-foreground"
                  />
                </div>
                <button
                  onClick={runAgent}
                  disabled={!canSubmitCustom}
                  className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Fix it
                </button>
              </div>
            )}
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-[#a32d2d]">{error}</p>
            <button
              onClick={reset}
              className="rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-[#f5f3ee]"
            >
              Back
            </button>
          </div>
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
                onClick={reset}
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
