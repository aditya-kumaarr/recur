import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";

const execFileAsync = promisify(execFile);

const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";

const BUGGY_SOURCE = `function sum(a, b) {\n  return a - b;\n}\n\nmodule.exports = { sum };\n`;

const TEST_SOURCE = `const test = require("node:test");
const assert = require("node:assert");
const { sum } = require("./sum");

test("sum adds two positive numbers", () => {
  assert.strictEqual(sum(2, 3), 5);
});

test("sum adds negative numbers", () => {
  assert.strictEqual(sum(-1, -1), -2);
});

test("sum with zero returns the other number", () => {
  assert.strictEqual(sum(0, 7), 7);
});
`;

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
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not set on the server");
  }
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NVIDIA API error ${res.status}: ${text}`);
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

// Built-in demo bug: runs locally in /tmp. This is our own trusted code, so
// no sandbox is needed — it's cheap and instant.
async function runDemoAgent(send: (event: StreamEvent) => void) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recur-"));
  try {
    const targetFile = path.join(dir, "sum.js");
    await fs.writeFile(targetFile, BUGGY_SOURCE, "utf8");
    await fs.writeFile(path.join(dir, "sum.test.js"), TEST_SOURCE, "utf8");

    async function runTests() {
      try {
        const { stdout, stderr } = await execFileAsync(
          "node",
          ["--test", path.join(dir, "sum.test.js")],
          { cwd: dir }
        );
        return { pass: true, output: stdout + stderr };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string };
        return { pass: false, output: (e.stdout ?? "") + (e.stderr ?? "") };
      }
    }

    const before = BUGGY_SOURCE;
    let result = await runTests();

    if (result.pass) {
      send({ type: "step", label: "Run tests", detail: "already passing", status: "done" });
      send({ type: "result", before, after: before, pass: true });
      return;
    }

    send({ type: "step", label: "Diagnose", detail: "reading failure output", status: "done" });
    const diagnosis = await callModel(diagnosePrompt(before, TEST_SOURCE, result.output), 150);

    send({ type: "step", label: "Patch", detail: "writing a candidate fix", status: "done" });
    const patched = extractCode(diagnosis);
    await fs.writeFile(targetFile, patched, "utf8");

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
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// User-submitted code: runs in an isolated, network-denied Vercel Sandbox.
// Never executed in our own server process.
async function runCustomAgent(
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
    // no body / not JSON — falls through to the demo path
  }

  const isCustom = userCode.length > 0 || userTest.length > 0;

  if (isCustom) {
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
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        if (isCustom) {
          await runCustomAgent(userCode, userTest, send);
        } else {
          await runDemoAgent(send);
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
