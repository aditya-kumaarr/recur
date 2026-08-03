import AgentDemo from "./AgentDemo";
import TryItLink from "./TryItLink";
import TryItTarget from "./TryItTarget";

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground">
            <span className="h-2 w-2 rounded-sm bg-accent" />
          </span>
          <span className="text-base font-medium tracking-tight">Recur</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted sm:flex">
          <a href="#how-it-works" className="hover:text-foreground">
            How it works
          </a>
          <a href="#agent-loop" className="hover:text-foreground">
            Agent loop
          </a>
          <TryItLink className="hover:text-foreground">Try it</TryItLink>
        </nav>
        <TryItLink className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90">
          Try it live
        </TryItLink>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 sm:px-10">
        <section className="grid gap-10 py-10 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <h1 className="text-5xl leading-[1.05] tracking-tight sm:text-6xl">
              <span className="block">The agent</span>
              <span className="block">that debugs</span>
              <span className="block">itself.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
              Point it at a repo with failing tests. It diagnoses the failure,
              writes a patch, runs the tests, and reviews its own fix — live,
              out loud, no black box.
            </p>
          </div>

          <TryItTarget>
            <AgentDemo />
          </TryItTarget>
        </section>

        <section id="how-it-works" className="border-t border-border py-20">
          <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 max-w-xl text-muted">
            One click runs the whole loop against a repo with a planted bug —
            each step shown as it actually happens, not after the fact.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01",
                title: "Diagnose",
                detail:
                  "Reads the failing test output and the source file, forms a hypothesis about the bug.",
              },
              {
                n: "02",
                title: "Patch",
                detail:
                  "Writes a corrected version of the file — the smallest change that could fix it.",
              },
              {
                n: "03",
                title: "Run tests",
                detail:
                  "The patch is applied for real and the test suite re-run, not simulated.",
              },
              {
                n: "04",
                title: "Self-review",
                detail:
                  "A second pass checks whether the fix is minimal and safe before it's shown as done.",
                accent: true,
              },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-2xl border border-border bg-surface p-5"
              >
                <span
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium " +
                    (step.accent ? "bg-accent text-foreground" : "bg-foreground text-background")
                  }
                >
                  {step.n}
                </span>
                <h3 className="mt-4 text-base font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {step.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="agent-loop" className="border-t border-border py-20">
          <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
            The agent loop
          </h2>
          <p className="mt-3 max-w-xl text-muted">
            Why this is a loop and not one prompt dressed up as an agent.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl bg-[#e2ded2] p-5">
              <h3 className="text-base font-medium">Transparency by default</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Trust in agentic tools comes from watching the reasoning, not
                from a polished final diff. Every step streams to the screen
                as it happens.
              </p>
            </div>
            <div className="rounded-2xl bg-[#e2ded2] p-5">
              <h3 className="text-base font-medium">A real self-review pass</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Once the tests pass, a second model call reviews the diff and
                says whether the change is actually minimal and safe — it
                doesn&apos;t just stop at green.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
