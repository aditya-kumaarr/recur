"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/useUser";

type Run = {
  id: string;
  label: string;
  pass: boolean;
  created_at: string;
  code: string | null;
  test_source: string | null;
  fixed_code: string | null;
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HistoryPanel({
  onLoad,
}: {
  onLoad: (run: { code: string; test: string }) => void;
}) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!user) return null;

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("run_history")
      .select("id, label, pass, created_at, code, test_source, fixed_code")
      .order("created_at", { ascending: false })
      .limit(15);
    setRuns(data ?? []);
    setLoading(false);
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
      >
        History
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 flex max-h-96 w-80 flex-col overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-md">
          {loading && (
            <p className="px-3 py-4 text-center text-sm text-muted">Loading…</p>
          )}
          {!loading && runs.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted">
              No runs yet.
            </p>
          )}
          {!loading &&
            runs.map((run) => (
              <div key={run.id} className="rounded-lg">
                <button
                  onClick={() =>
                    setExpanded(expanded === run.id ? null : run.id)
                  }
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f5f3ee]"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className={
                        "h-1.5 w-1.5 shrink-0 rounded-full " +
                        (run.pass ? "bg-[#3b6d11]" : "bg-[#a32d2d]")
                      }
                    />
                    <span className="truncate font-medium">{run.label}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {timeAgo(run.created_at)}
                  </span>
                </button>
                {expanded === run.id && (
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    <pre className="max-h-32 overflow-y-auto rounded-lg bg-[#faf9f6] p-2 font-mono text-[11px] text-muted">
                      {run.code}
                    </pre>
                    <button
                      onClick={() => {
                        onLoad({
                          code: run.code ?? "",
                          test: run.test_source ?? "",
                        });
                        setOpen(false);
                      }}
                      disabled={!run.code}
                      className="self-start rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-[#f5f3ee] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Load into editor
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
