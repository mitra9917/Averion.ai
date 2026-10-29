"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { validateEmail, validatePassword } from "@/lib/auth-validation";
import {
  getAuthRedirectUrl,
  getSupabaseBrowserClient,
  getSupabaseSessionSafely
} from "@/lib/supabase";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  mode: AuthMode;
};

type FormStatus = {
  kind: "idle" | "success" | "error";
  message: string;
};

const copy = {
  login: {
    eyebrow: "Welcome back",
    title: "Sign in to Averion",
    description: "Use your work email to continue to your knowledge workspace.",
    button: "Sign in",
    pending: "Signing in…",
    alternatePrompt: "New to Averion?",
    alternateLabel: "Create an account",
    alternateHref: "/signup"
  },
  signup: {
    eyebrow: "Create account",
    title: "Start your Averion workspace",
    description:
      "Create your account with a valid email address. Domain rules follow the workspace configuration.",
    button: "Create account",
    pending: "Creating account…",
    alternatePrompt: "Already have an account?",
    alternateLabel: "Sign in",
    alternateHref: "/login"
  }
} satisfies Record<AuthMode, Record<string, string>>;

const fieldClass =
  "mt-2 h-11 w-full rounded-control border border-hairline bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted";

function getSafeNextPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  const next = new URLSearchParams(window.location.search).get("next");

  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOAuthSubmitting, setIsOAuthSubmitting] = useState(false);
  const [status, setStatus] = useState<FormStatus>({
    kind: "idle",
    message: ""
  });

  const formCopy = copy[mode];
  const isSignup = mode === "signup";

  useEffect(() => {
    let ignore = false;

    async function redirectAuthenticatedUser() {
      if (!supabase) {
        return;
      }

      const session = await getSupabaseSessionSafely(supabase);

      if (!ignore && session) {
        router.replace(getSafeNextPath());
      }
    }

    void redirectAuthenticatedUser();

    return () => {
      ignore = true;
    };
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (emailError || passwordError) {
      setStatus({
        kind: "error",
        message: emailError ?? passwordError ?? "Check your login details."
      });
      return;
    }

    if (isSignup && password !== confirmPassword) {
      setStatus({
        kind: "error",
        message: "Passwords must match."
      });
      return;
    }

    if (!supabase) {
      setStatus({
        kind: "error",
        message:
          "Supabase auth is not configured yet. Add the frontend Supabase env values first."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus({ kind: "idle", message: "" });

    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(),
            data: {
              full_name: name.trim() || null
            }
          }
        });

        if (error) {
          throw error;
        }

        setStatus({
          kind: "success",
          message:
            "Account created. Check your email to verify your account before signing in."
        });
        setPassword("");
        setConfirmPassword("");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) {
        throw error;
      }

      setStatus({
        kind: "success",
        message: "Signed in. Opening your workspace..."
      });
      router.replace(getSafeNextPath());
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Authentication failed. Try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!supabase) {
      setStatus({
        kind: "error",
        message:
          "Supabase auth is not configured yet. Add the frontend Supabase env values first."
      });
      return;
    }

    setIsOAuthSubmitting(true);
    setStatus({ kind: "idle", message: "" });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(),
        queryParams: {
          access_type: "offline",
          prompt: "consent"
        }
      }
    });

    if (error) {
      setIsOAuthSubmitting(false);
      setStatus({
        kind: "error",
        message: error.message
      });
    }
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between px-12 py-12 lg:flex">
          <Link className="flex items-center gap-3" href="/">
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-ink text-sm font-semibold text-white">
              A
            </span>
            <span>
              <span className="block text-sm font-medium">Averion</span>
              <span className="micro mt-1 block">Knowledge copilot</span>
            </span>
          </Link>
          <div className="max-w-md">
            <p className="micro">{formCopy.eyebrow}</p>
            <h1 className="display mt-4 text-[40px]">
              Secure access for your company knowledge.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted">
              Sign in before uploading documents, asking questions, or saving feedback.
              Supabase Auth handles the session. Averion keeps the library inside your organization.
            </p>
          </div>
          <p className="text-xs text-muted">Answers stay attached to the passage they came from.</p>
        </section>

        <section className="flex items-center px-4 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-md rounded-pane border border-hairline bg-surface p-6 shadow-float sm:p-8">
            <div className="lg:hidden">
              <Link className="flex items-center gap-3" href="/">
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-ink text-sm font-semibold text-white">
                  A
                </span>
                <span className="text-sm font-medium">Averion</span>
              </Link>
            </div>
            <div className="mt-8 lg:mt-0">
              <p className="micro">{formCopy.eyebrow}</p>
              <h2 className="mt-3 text-[28px] tracking-[-0.02em]">{formCopy.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{formCopy.description}</p>
            </div>

            <button
              className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-control border border-hairline bg-surface text-sm font-semibold hover:bg-soft disabled:opacity-60"
              disabled={isSubmitting || isOAuthSubmitting}
              onClick={handleGoogleSignIn}
              type="button"
            >
              <span className="flex size-5 items-center justify-center rounded-full border border-hairline text-[11px] font-semibold">
                G
              </span>
              {isOAuthSubmitting ? "Opening Google…" : "Continue with Google"}
            </button>

            <div className="mt-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-hairline" />
              <span className="micro">or</span>
              <span className="h-px flex-1 bg-hairline" />
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {isSignup ? (
                <label className="block">
                  <span className="text-sm font-medium">Full name</span>
                  <input
                    autoComplete="name"
                    className={fieldClass}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    type="text"
                    value={name}
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="text-sm font-medium">Email</span>
                <input
                  autoComplete="email"
                  className={fieldClass}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Password</span>
                <input
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  className={fieldClass}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  required
                  type="password"
                  value={password}
                />
              </label>
              {isSignup ? (
                <label className="block">
                  <span className="text-sm font-medium">Confirm password</span>
                  <input
                    autoComplete="new-password"
                    className={fieldClass}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your password"
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </label>
              ) : null}
              {status.kind !== "idle" ? (
                <div
                  className="flex items-start gap-2 rounded-control border border-hairline bg-soft px-3 py-3 text-sm"
                  role="status"
                >
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      status.kind === "success" ? "bg-ready" : "bg-fail"
                    }`}
                  />
                  <span>{status.message}</span>
                </div>
              ) : null}
              <button
                className="h-11 w-full rounded-full bg-ink text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-50"
                disabled={isSubmitting || isOAuthSubmitting}
                type="submit"
              >
                {isSubmitting ? formCopy.pending : formCopy.button}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-muted">
              {formCopy.alternatePrompt}{" "}
              <Link className="font-semibold text-ink underline decoration-hairline underline-offset-4" href={formCopy.alternateHref}>
                {formCopy.alternateLabel}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
