# Recur

**The agent that debugs itself.**

Point it at a repo with failing tests. It diagnoses the failure, writes a patch,
runs the tests, and reviews its own fix — live, out loud, no black box.

Built for the ChatGPT Codex India Hackathon 2026 — **Agentic Coding** track.

## Live demo

[Add your deployed Vercel URL here]

## The problem

Debugging AI agents today are black boxes: you get a diff, and you have to trust
it. Recur makes every step of the loop visible — the hypothesis, the patch, the
test run, and a self-review that checks the fix is minimal and safe — so a human
watching can actually follow the agent's reasoning instead of just accepting its
output.

## How it works

A seed repo (`seed-repo/sum.js`) ships with one deliberate bug and a failing test
suite. Clicking **Debug it** triggers the loop:

1. **Diagnose** — the agent reads the failing test output and the source file
2. **Patch** — it writes a corrected version of the file
3. **Run tests** — the patch is applied and the test suite re-run for real
4. **Self-review** — a second model call checks whether the fix is minimal and safe

Every step is shown in the UI as it happens, not hidden behind a spinner.

## Tech stack

- **Next.js 16** (App Router) + **Tailwind CSS v4**
- **Meta Llama 3.3 70B Instruct**, served free via **NVIDIA NIM** (OpenAI-compatible
  API — `https://integrate.api.nvidia.com/v1`)
- Test execution via Node's built-in test runner (`node --test`), run directly
  in the API route
- Built with **OpenAI Codex** as the primary coding agent

## Running locally

```bash
npm install
cp .env.local.example .env.local   # add your own NVIDIA_API_KEY
npm run dev
```

Get a free API key at [build.nvidia.com](https://build.nvidia.com/meta/llama-3_3-70b-instruct).

## A note on latency

The free NVIDIA NIM endpoint's throughput varies under load — a full run
(diagnose + patch + self-review, two model calls) typically takes anywhere from
15 seconds to a couple of minutes. This is a free-tier characteristic of the
inference provider, not the agent loop itself.
