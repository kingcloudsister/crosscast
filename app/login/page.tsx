"use client";

import { useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    isSupabaseConfigured ? null : "Sign-in is unavailable because Supabase is not configured.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    setIsSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    // Full navigation so middleware sees the new session cookie.
    window.location.assign("/");
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="w-full max-w-sm">
        <img src="/crosscast-logo.png" alt="Crosscast" className="mx-auto h-14 w-auto" />
        <form
          onSubmit={signIn}
          className="mt-8 rounded-2xl border border-line bg-white px-6 py-7 shadow-workspace"
        >
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your Crosscast account to continue.</p>

          <label className="mt-6 block text-xs font-semibold text-muted" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-[#8bade4] focus:ring-4 focus:ring-[#8bade4]/10"
          />

          <label className="mt-4 block text-xs font-semibold text-muted" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-[#8bade4] focus:ring-4 focus:ring-[#8bade4]/10"
          />

          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || !supabase}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#8bade4] px-5 text-sm font-semibold text-ink shadow-brand transition hover:bg-[#7a9edb] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
