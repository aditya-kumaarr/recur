import AgentDemo from "./AgentDemo";

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
          <a href="#try-it" className="hover:text-foreground">
            Try it
          </a>
        </nav>
        <a
          href="#try-it"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Try it live
        </a>
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
            <div className="mt-8 flex items-center gap-3">
              <a
                href="#try-it"
                className="flex items-center gap-4 rounded-full bg-surface py-2 pl-6 pr-2 text-left shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
              >
                <span className="text-sm leading-tight">
                  <span className="block font-medium">Watch it</span>
                  <span className="block text-muted">fix a real bug</span>
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 8h10M9 4l4 4-4 4"
                      stroke="#17171A"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </a>
            </div>
          </div>

          <div id="try-it">
            <AgentDemo />
          </div>
        </section>
      </main>
    </div>
  );
}
