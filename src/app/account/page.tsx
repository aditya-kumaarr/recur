import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const [{ data: repos }, { data: runs }] = await Promise.all([
    supabase
      .from("saved_repos")
      .select("id, repo_owner, repo_name, repo_url, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("run_history")
      .select("id, source, label, pass, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:px-10">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Recur
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight">Your account</h1>
      <p className="mt-2 text-sm text-muted">{user.email}</p>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Connected repos</h2>
        {!repos || repos.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No repos connected yet — repo connections are coming soon.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {repos.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border bg-surface px-4 py-3 text-sm"
              >
                {r.repo_owner}/{r.repo_name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Run history</h2>
        {!runs || runs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No runs yet — fix a bug on the home page and it&apos;ll show up here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {runs.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm"
              >
                <span>{r.label}</span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-medium " +
                    (r.pass
                      ? "bg-[#f0f9e2] text-[#3b6d11]"
                      : "bg-[#fcebeb] text-[#a32d2d]")
                  }
                >
                  {r.pass ? "passed" : "failed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
