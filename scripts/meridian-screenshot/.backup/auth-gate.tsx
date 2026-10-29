"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

import {
  getSupabaseBrowserClient,
  getSupabaseSessionSafely
} from "@/lib/supabase";

type AuthGateProps = {
  children: ReactNode;
};

type AuthState = "checking" | "authenticated" | "missing-config";

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [authState, setAuthState] = useState<AuthState>(
    supabase ? "checking" : "missing-config"
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    let ignore = false;

    async function checkSession() {
      const session = await getSupabaseSessionSafely(client);

      if (ignore) {
        return;
      }

      if (session) {
        setAuthState("authenticated");
        return;
      }

      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthState("authenticated");
        return;
      }

      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });

    void checkSession();

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [pathname, router, supabase]);

  if (authState === "authenticated") {
    return children;
  }

  if (authState === "missing-config") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 text-ink">
        <section className="w-full max-w-md rounded-pane border border-hairline bg-surface p-8 shadow-float">
          <p className="micro">Auth setup required</p>
          <h1 className="mt-3 text-2xl tracking-[-0.02em]">Add the Supabase keys</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Protected Averion pages need `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`.
          </p>
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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 text-ink">
      <section className="w-full max-w-sm rounded-pane border border-hairline bg-surface p-8 text-center shadow-float">
        <p className="micro">Checking session</p>
        <h1 className="mt-3 text-2xl tracking-[-0.02em]">Opening Averion</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Confirming your session before loading the workspace.
        </p>
      </section>
    </main>
  );
}
