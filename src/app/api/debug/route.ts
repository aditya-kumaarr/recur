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
  status: "done" | "failed";
};

type ResultEvent = {
  type: "result";
  before: string;
  after: string;
  pass: boolean;
};

type ErrorEvent = {
  type: "error";
  message: string;
};

type StreamEvent = StepEvent | ResultEvent | ErrorEvent;

async function callModel(
  messages: { role: string; content: string }[],
  maxTokens: number
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
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM provider error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}

function extractCode(raw: string): string {
  const match = raw.match(/```(?:js|javascript)?\n([\s\S]*?)```/);
  return (match ? match[1] : raw).trim() + "\n";
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
  userTest: string,
  send: (event: StreamEvent) => void
) {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 60_000,
    resources: { vcpus: 1 },
    networkPolicy: "deny-all",
  });

  try {
    async function writeCode(content: string) {
      await sandbox.writeFiles([{ path: "code.js", content }]);
    }

    await writeCode(userCode);
    await sandbox.writeFiles([{ path: "code.test.js", content: userTest }]);

    async function runTests() {
      const result = await sandbox.runCommand("node", ["--test", "code.test.js"], {
        timeoutMs: 10_000,
      });
      const output = (await result.stdout()) + (await result.stderr());
      return { pass: result.exitCode === 0, output };
    }

    const before = userCode;
    let result = await runTests();

    if (result.pass) {
      send({ type: "step", label: "Run tests", detail: "already passing", status: "done" });
      send({ type: "result", before, after: before, pass: true });
      return;
    }

    send({ type: "step", label: "Diagnose", detail: "reading failure output", status: "done" });
    const diagnosis = await callModel(diagnosePrompt(before, userTest, result.output), 200);

    send({ type: "step", label: "Patch", detail: "writing a candidate fix", status: "done" });
    const patched = extractCode(diagnosis);
    await writeCode(patched);

    result = await runTests();
    send({
      type: "step",
      label: "Run tests",
      detail: result.pass ? "all tests passing" : "still failing",
      status: result.pass ? "done" : "failed",
    });

    if (result.pass) {
      const review = await callModel(reviewPrompt(before, patched), 60);
      send({ type: "step", label: "Self-review", detail: review.trim(), status: "done" });
    }

    send({ type: "result", before, after: patched, pass: result.pass });
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
  let userTest = "";
  try {
    const body = await req.json();
    if (typeof body?.code === "string") userCode = body.code.trim();
    if (typeof body?.test === "string") userTest = body.test.trim();
  } catch {
    // no/invalid body — falls through to the validation error below
  }

  if (!userCode || !userTest) {
    return Response.json(
      { error: "Both your code and a test for it are required." },
      { status: 400 }
    );
  }
  if (userCode.length > MAX_LEN || userTest.length > MAX_LEN) {
    return Response.json(
      { error: `Keep each file under ${MAX_LEN} characters.` },
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
          if (event.type === "step") steps.push(event);
          if (event.type === "result") finalResult = event;
          send(event);
        };
        await runAgent(userCode, userTest, record);

        if (user && finalResult) {
          await supabase.from("run_history").insert({
            user_id: user.id,
            source: "custom",
            label: "Your own bug",
            pass: (finalResult as ResultEvent).pass,
            steps,
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
