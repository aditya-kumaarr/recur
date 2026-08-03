import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

type Step = {
  label: string;
  detail: string;
  status: "done" | "failed";
};

async function runTests(dir: string) {
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

export async function POST() {
  const steps: Step[] = [];

  // Every run gets its own writable scratch dir in /tmp — required on Vercel,
  // where the deployed app's own filesystem is read-only.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recur-"));
  const targetFile = path.join(dir, "sum.js");
  await fs.writeFile(targetFile, BUGGY_SOURCE, "utf8");
  await fs.writeFile(path.join(dir, "sum.test.js"), TEST_SOURCE, "utf8");

  const before = BUGGY_SOURCE;
  let result = await runTests(dir);

  if (result.pass) {
    steps.push({ label: "Run tests", detail: "already passing", status: "done" });
    return Response.json({ steps, before, after: before, pass: true });
  }

  steps.push({ label: "Diagnose", detail: "reading failure output", status: "done" });

  const diagnosis = await callModel(
    [
      {
        role: "system",
        content:
          "You are a precise debugging agent. You read a failing test output and a source file, then return ONLY the corrected full source file inside a single ```js code block. No prose, no explanation outside the code block.",
      },
      {
        role: "user",
        content: `Source file (sum.js):\n\`\`\`js\n${before}\`\`\`\n\nTest file (sum.test.js):\n\`\`\`js\n${TEST_SOURCE}\`\`\`\n\nTest run output:\n${result.output}\n\nFix the source file so all tests pass. Make the smallest possible change.`,
      },
    ],
    150
  );

  steps.push({ label: "Patch", detail: "writing a candidate fix", status: "done" });

  const patched = extractCode(diagnosis);
  await fs.writeFile(targetFile, patched, "utf8");

  result = await runTests(dir);
  steps.push({
    label: "Run tests",
    detail: result.pass ? "all tests passing" : "still failing",
    status: result.pass ? "done" : "failed",
  });

  if (result.pass) {
    const review = await callModel(
      [
        {
          role: "system",
          content:
            "You are reviewing a code fix. In one short sentence, say whether the change is minimal and safe.",
        },
        {
          role: "user",
          content: `Before:\n${before}\nAfter:\n${patched}\nIs this fix minimal and safe?`,
        },
      ],
      60
    );
    steps.push({ label: "Self-review", detail: review.trim(), status: "done" });
  }

  await fs.rm(dir, { recursive: true, force: true });

  return Response.json({ steps, before, after: patched, pass: result.pass });
}
