"use client";

import { useEffect, useRef, useState } from "react";
import HistoryPanel from "./HistoryPanel";

type Step = {
  label: string;
  detail: string;
  status: "active" | "done" | "failed";
};

type StreamEvent =
  | ({ type: "step" } & Step)
  | { type: "result"; before: string; after: string; test: string; pass: boolean }
  | { type: "error"; message: string }
  | { type: "token"; content: string };

type Result = { before: string; after: string; test: string; pass: boolean };

const MAX_LEN = 4000;

const WAITING_MESSAGES = [
  "waiting on the model…",
  "still working…",
  "this can take a couple minutes on the free tier…",
];

const CODE_PLACEHOLDER = `function sum(a, b) {
  return a - b;
}

module.exports = { sum };`;

export default function AgentDemo() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);
  const liveRef = useRef<HTMLPreElement>(null);

  const lastStep = steps[steps.length - 1];
  const isWaiting =
    state === "streaming" && !liveText && (!lastStep || lastStep.status === "active");

  useEffect(() => {
    liveRef.current?.scrollTo({ top: liveRef.current.scrollHeight });
  }, [liveText]);

  useEffect(() => {
    if (state !== "streaming") return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (!isWaiting) return;
    const id = setInterval(
      () => setMsgIndex((i) => (i + 1) % WAITING_MESSAGES.length),
      4000
    );
    return () => clearInterval(id);
  }, [isWaiting]);

  async function runAgent() {
    setState("streaming");
    setSteps([]);
    setResult(null);
    setError(null);
    setLiveText("");
    setElapsed(0);

    try {
      const res = await fetch("/api/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
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
          if (event.type === "token") {
            setLiveText((prev) => prev + event.content);
          } else if (event.type === "step") {
            setLiveText("");
            setElapsed(0);
            setSteps((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.label === event.label && last.status === "active") {
                return [...prev.slice(0, -1), event];
              }
              return [...prev, event];
            });
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
    setLiveText("");
    setElapsed(0);
  }

  function loadFromHistory(run: { code: string }) {
    setCode(run.code);
    reset();
  }

  const canSubmit = code.trim().length > 0;

  return (
    <div className="rounded-2xl bg-[#e2ded2] p-3 sm:p-4">
      <div className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-sm font-medium">Agent log</span>
          <div className="flex items-center gap-2">
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
            <HistoryPanel onLoad={loadFromHistory} />
          </div>
        </div>

        {state === "idle" && (
          <div className="flex flex-col gap-3 py-5">
            <p className="text-sm text-muted">
              Paste a broken function. Your code must export via{" "}
              <code>module.exports</code> — the agent writes its own test to
              check it, fixes it, and verifies the fix for real. Runs
              isolated, no network access, {MAX_LEN} char limit.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Your code (code.js)
              </label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, MAX_LEN))}
                placeholder={CODE_PLACEHOLDER}
                rows={8}
                className="w-full rounded-lg border border-border bg-[#faf9f6] p-3 font-mono text-xs text-foreground outline-none focus:border-foreground"
              />
            </div>
            <button
              onClick={runAgent}
              disabled={!canSubmit}
              className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Fix it
            </button>
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
              <div className="flex flex-col gap-1 py-6">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  reading your code…
                  <span className="text-xs">{elapsed}s</span>
                </div>
              </div>
            )}
            <ol className="mt-4 flex flex-col gap-4">
              {steps.map((step, i) => {
                const isActive = step.status === "active";
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className={
                        "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full " +
                        (isActive
                          ? "bg-accent"
                          : step.status === "done"
                            ? "bg-foreground"
                            : "bg-[#e24b4a]")
                      }
                    >
                      {isActive ? (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground" />
                      ) : (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                          <path
                            d="M1 4l2 2 4-4"
                            stroke="var(--background)"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{step.label}</span>
                      <span className="block text-sm text-muted">
                        {isActive
                          ? liveText
                            ? "writing…"
                            : WAITING_MESSAGES[msgIndex]
                          : step.detail}
                        {isActive && <span className="ml-1.5 text-xs">{elapsed}s</span>}
                      </span>
                      {isActive && liveText && (
                        <pre
                          ref={liveRef}
                          className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#faf9f6] p-3 font-mono text-[11px] text-muted"
                        >
                          {liveText}
                        </pre>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
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
