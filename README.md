# Recur

**The agent that debugs itself.**

Point it at a repo with failing tests. It diagnoses the failure, writes a patch,
runs the tests, and reviews its own fix — live, out loud, no black box.

Built for the ChatGPT Codex India Hackathon 2026 — **Agentic Coding** track.

## Live demo

[recur-swart.vercel.app](https://recur-swart.vercel.app)

## The problem

Debugging AI agents today are black boxes: you get a diff, and you have to trust
it. Recur makes every step of the loop visible — the hypothesis, the patch, the
test run, and a self-review that checks the fix is minimal and safe — so a human
watching can actually follow the agent's reasoning instead of just accepting its
output.

## How it works

Paste a broken JS function and a test for it. Clicking **Fix it** triggers the
loop:

1. **Diagnose** — the agent reads the failing test output and the source file
2. **Patch** — it writes a corrected version of the file
3. **Run tests** — the patch is applied and the test suite re-run for real
4. **Self-review** — a second model call checks whether the fix is minimal and safe

Every step is shown in the UI as it happens, not hidden behind a spinner.
Submitted code never runs in the app's own server process — it executes inside
an isolated Vercel Sandbox with no outbound network access and a 60s timeout.

Sign in with Google or GitHub to have your runs saved to your account.

## Tech stack

- **Next.js 16** (App Router) + **Tailwind CSS v4**
- **Supabase** for auth (Google / GitHub) and storing run history
- **Vercel Sandbox** for isolated, network-denied execution of submitted code
- Test execution via Node's built-in test runner (`node --test`)
- Built with **OpenAI Codex** as the primary coding agent

## Running locally

```bash
npm install
cp .env.local.example .env.local   # add your own API keys
npm run dev
```

## A note on latency

The free tier of the underlying inference provider has variable throughput
under load — a full run (diagnose + patch + self-review, two model calls)
typically takes anywhere from 15 seconds to a couple of minutes. This is a
free-tier characteristic of the provider, not the agent loop itself.
