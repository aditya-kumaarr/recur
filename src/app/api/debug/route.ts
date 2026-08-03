import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const REPO_ROOT = process.cwd();
const TARGET_FILE = path.join(REPO_ROOT, "seed-repo", "sum.js");
const TEST_FILE = path.join(REPO_ROOT, "seed-repo", "sum.test.js");

const BUGGY_SOURCE = `function sum(a, b) {\n  return a - b;\n}\n\nmodule.exports = { sum };\n`;

const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";

type Step = {
  label: string;
  detail: string;
  status: "done" | "failed";
};

async function runTests() {
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      ["--test", TEST_FILE],
      { cwd: REPO_ROOT }
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

  // Reset to the original buggy version so every demo run starts the same way.
  await fs.writeFile(TARGET_FILE, BUGGY_SOURCE, "utf8");
  const testFile = await fs.readFile(TEST_FILE, "utf8");

  const before = await fs.readFile(TARGET_FILE, "utf8");
  let result = await runTests();

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
        content: `Source file (seed-repo/sum.js):\n\`\`\`js\n${before}\`\`\`\n\nTest file (seed-repo/sum.test.js):\n\`\`\`js\n${testFile}\`\`\`\n\nTest run output:\n${result.output}\n\nFix the source file so all tests pass. Make the smallest possible change.`,
      },
    ],
    150
  );

  steps.push({ label: "Patch", detail: "writing a candidate fix", status: "done" });

  const patched = extractCode(diagnosis);
  await fs.writeFile(TARGET_FILE, patched, "utf8");

  result = await runTests();
  steps.push({
    label: "Run tests",
    detail: result.pass ? "all tests passing" : "still failing",
    status: result.pass ? "done" : "failed",
  });

  let review = "";
  if (result.pass) {
    review = await callModel(
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

  const after = await fs.readFile(TARGET_FILE, "utf8");
  return Response.json({ steps, before, after, pass: result.pass });
}
