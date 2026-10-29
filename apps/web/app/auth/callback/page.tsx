"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  buildAllowedDomainError,
  getAllowedEmailDomains,
  isEmailDomainAllowed
} from "@/lib/auth-validation";
import {
  getSupabaseBrowserClient,
  getSupabaseSessionSafely
} from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing your sign in...");

  useEffect(() => {
    let ignore = false;

    async function handleCallback() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setMessage("Supabase auth is not configured yet.");
        return;
      }

      const session = await getSupabaseSessionSafely(supabase);

      if (ignore) {
        return;
      }

      if (session) {
        const userEmail = session.user.email ?? "";
        const allowedDomains = getAllowedEmailDomains();

        if (!isEmailDomainAllowed(userEmail, allowedDomains)) {
          await supabase.auth.signOut();

          if (!ignore) {
            setMessage(buildAllowedDomainError(allowedDomains));
          }

          return;
        }

        router.replace("/");
        return;
      }

      setMessage("Email confirmed. You can sign in now.");
    }

    void handleCallback();

    return () => {
      ignore = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 text-ink">
      <section className="w-full max-w-md rounded-pane border border-hairline bg-surface p-8 shadow-float">
        <p className="micro">Auth callback</p>
        <h1 className="mt-3 text-2xl tracking-[-0.02em]">Almost there</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
        <Link
          className="mt-6 inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white"
          href="/login"
        >
          Go to sign in
        </Link>
      </section>
    </main>
  );
}
