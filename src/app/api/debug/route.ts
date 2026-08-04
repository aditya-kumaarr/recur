import { Sandbox } from "@vercel/sandbox";
import { createClient } from "@/lib/supabase/server";

const MAX_LEN = 4000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

type StepEvent = {
  type: "step";
  label: string;
  detail: string;
  status: "active" | "done" | "failed";
};

type ResultEvent = {
  type: "result";
  before: string;
  after: string;
  test: string;
  pass: boolean;
};

type ErrorEvent = {
  type: "error";
  message: string;
};

type TokenEvent = {
  type: "token";
  content: string;
};

type StreamEvent = StepEvent | ResultEvent | ErrorEvent | TokenEvent;

async function callModel(
  messages: { role: string; content: string }[],
  maxTokens: number,
  onToken?: (chunk: string) => void
) {
  const apiKey = process.env.LLM_API_KEY;
  const apiUrl = process.env.LLM_API_URL;
  const model = process.env.LLM_MODEL;
  if (!apiKey || !apiUrl || !model) {
    throw new Error("LLM provider is not configured on the server");
  }
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM provider error ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken?.(delta);
        }
      } catch {
        // partial/malformed SSE line — safe to skip, next chunk fills it in
      }
    }
  }

  return full;
}

function extractCode(raw: string): string {
  const match = raw.match(/```(?:js|javascript)?\n([\s\S]*?)```/);
  return (match ? match[1] : raw).trim() + "\n";
}

function deriveLabel(code: string): string {
  const match = code.match(/function\s+(\w+)/);
  return match ? match[1] : "Custom fix";
}

function writeTestPrompt(code: string) {
  return [
    {
      role: "system",
      content:
        "You are given a JavaScript function. Infer its intended behavior from its name, parameters, and logic, then write a small node:test file with 2-3 cases (a normal case and an edge case) that check it behaves correctly. The function is exported from ./code via module.exports. Return ONLY the test file inside a single ```js code block. No prose.",
    },
    {
      role: "user",
      content: `Source file:\n\`\`\`js\n${code}\`\`\``,
    },
  ];
}

function diagnosePrompt(before: string, testSource: string, output: string) {
  return [
    {
      role: "system",
      content:
        "You are a precise debugging agent. You read a failing test output and a source file, then return ONLY the corrected full source file inside a single ```js code block. No prose, no explanation outside the code block.",
    },
    {
      role: "user",
      content: `Source file:\n\`\`\`js\n${before}\`\`\`\n\nTest file:\n\`\`\`js\n${testSource}\`\`\`\n\nTest run output:\n${output}\n\nFix the source file so all tests pass. Make the smallest possible change.`,
    },
  ];
}

function reviewPrompt(before: string, patched: string) {
  return [
    {
      role: "system",
      content:
        "You are reviewing a code fix. In one short sentence, say whether the change is minimal and safe.",
    },
    {
      role: "user",
      content: `Before:\n${before}\nAfter:\n${patched}\nIs this fix minimal and safe?`,
    },
  ];
}

// User-submitted code: runs in an isolated, network-denied Vercel Sandbox.
// Never executed in our own server process.
async function runAgent(
  userCode: string,
  send: (event: StreamEvent) => void
) {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    // Sandbox stays alive for the whole run, including the model calls in
    // between — those can take minutes under free-tier load, so this needs
    // real headroom, not just enough for the two ~10s test executions.
    timeout: 5 * 60_000,
    resources: { vcpus: 1 },
    networkPolicy: "deny-all",
  });

  try {
    async function writeCode(content: string) {
      await sandbox.writeFiles([{ path: "code.js", content }]);
    }

    async function runTests() {
      const result = await sandbox.runCommand("node", ["--test", "code.test.js"], {
        timeoutMs: 10_000,
      });
      const output = (await result.stdout()) + (await result.stderr());
      return { pass: result.exitCode === 0, output };
    }

    const before = userCode;
    await writeCode(before);

    send({ type: "step", label: "Understand", detail: "writing a test to check expected behavior", status: "active" });
    const testDraft = await callModel(
      writeTestPrompt(before),
      250,
      (chunk) => send({ type: "token", content: chunk })
    );
    const userTest = extractCode(testDraft);
    send({ type: "step", label: "Understand", detail: "wrote a test to check expected behavior", status: "done" });
    await sandbox.writeFiles([{ path: "code.test.js", content: userTest }]);

    send({ type: "step", label: "Run tests", detail: "running your test", status: "active" });
    let result = await runTests();

    if (result.pass) {
      send({ type: "step", label: "Run tests", detail: "already passing", status: "done" });
      send({ type: "result", before, after: before, test: userTest, pass: true });
      return;
    }
    send({ type: "step", label: "Run tests", detail: "confirmed the failure", status: "done" });

    send({ type: "step", label: "Diagnose", detail: "reading the failure output", status: "active" });
    const diagnosis = await callModel(
      diagnosePrompt(before, userTest, result.output),
      200,
      (chunk) => send({ type: "token", content: chunk })
    );
    send({ type: "step", label: "Diagnose", detail: "found a likely fix", status: "done" });

    const patched = extractCode(diagnosis);
    send({ type: "step", label: "Patch", detail: "writing the fix to your file", status: "active" });
    await writeCode(patched);
    send({ type: "step", label: "Patch", detail: "wrote a candidate fix", status: "done" });

    send({ type: "step", label: "Run tests", detail: "re-running your test", status: "active" });
    result = await runTests();
    send({
      type: "step",
      label: "Run tests",
      detail: result.pass ? "all tests passing" : "still failing",
      status: result.pass ? "done" : "failed",
    });

    if (result.pass) {
      send({ type: "step", label: "Self-review", detail: "checking the fix is minimal and safe", status: "active" });
      const review = await callModel(
        reviewPrompt(before, patched),
        60,
        (chunk) => send({ type: "token", content: chunk })
      );
      send({ type: "step", label: "Self-review", detail: review.trim(), status: "done" });
    }

    send({ type: "result", before, after: patched, test: userTest, pass: result.pass });
  } finally {
    await sandbox.stop();
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return Response.json(
      { error: "Too many runs from this connection — try again in a few minutes." },
      { status: 429 }
    );
  }

  let userCode = "";
  try {
    const body = await req.json();
    if (typeof body?.code === "string") userCode = body.code.trim();
  } catch {
    // no/invalid body — falls through to the validation error below
  }

  if (!userCode) {
    return Response.json(
      { error: "Paste some code first." },
      { status: 400 }
    );
  }
  if (userCode.length > MAX_LEN) {
    return Response.json(
      { error: `Keep it under ${MAX_LEN} characters.` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const steps: StepEvent[] = [];
      let finalResult: ResultEvent | null = null;
      try {
        const record = (event: StreamEvent) => {
          if (event.type === "step" && event.status !== "active") steps.push(event);
          if (event.type === "result") finalResult = event;
          send(event);
        };
        await runAgent(userCode, record);

        if (user && finalResult) {
          const result = finalResult as ResultEvent;
          await supabase.from("run_history").insert({
            user_id: user.id,
            source: "custom",
            label: deriveLabel(userCode),
            pass: result.pass,
            steps,
            code: userCode,
            test_source: result.test,
            fixed_code: result.after,
          });
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "something went wrong",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
