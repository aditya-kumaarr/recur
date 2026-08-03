"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  function signInWith(provider: "google" | "github") {
    supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...(provider === "github" ? { scopes: "repo" } : {}),
      },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setOpen(false);
  }

  if (!user) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-[#f5f3ee]"
        >
          Sign in
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 flex w-52 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-md">
            <button
              onClick={() => signInWith("google")}
              className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f5f3ee]"
            >
              Continue with Google
            </button>
            <button
              onClick={() => signInWith("github")}
              className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f5f3ee]"
            >
              Continue with GitHub
            </button>
          </div>
        )}
      </div>
    );
  }

  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 flex w-52 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-md">
          <a
            href="/account"
            className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f5f3ee]"
          >
            Account
          </a>
          <button
            onClick={signOut}
            className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f5f3ee]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
