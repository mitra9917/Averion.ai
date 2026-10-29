"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { CommandPalette } from "@/components/command-palette";
import {
  destinationForPath,
  destinations,
  isDestinationActive
} from "@/components/destinations";
import {
  WorkspaceProvider,
  type WorkspaceChrome
} from "@/components/workspace-context";
import { getAccountProfile } from "@/lib/api";
import { firstName, initials } from "@/lib/meridian";
import {
  getSupabaseBrowserClient,
  getSupabaseSessionSafely
} from "@/lib/supabase";

type DashboardShellProps = {
  children: ReactNode;
  immersive?: boolean;
};

export function DashboardShell({
  children,
  immersive = false
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [orgName, setOrgName] = useState("Workspace");
  const [userName, setUserName] = useState("there");
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [trail, setTrailState] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [modLabel] = useState(() =>
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
      ? "⌘"
      : "Ctrl"
  );

  const setTrail = useCallback((value: string | null) => {
    setTrailState(value);
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    let ignore = false;

    async function loadSession() {
      const session = await getSupabaseSessionSafely(client);
      const user = session?.user;
      const name =
        user?.user_metadata?.full_name ??
        user?.user_metadata?.name ??
        user?.email?.split("@")[0];

      if (!ignore && typeof name === "string" && name.trim()) {
        setUserName(name.trim());
      }

      if (!ignore && user?.email) {
        setEmail(user.email);
      }
    }

    void loadSession();

    return () => {
      ignore = true;
    };
  }, [supabase]);

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      try {
        const profile = await getAccountProfile();

        if (ignore) return;

        setOrgName(profile.organization_name?.trim() || "Workspace");
        setRole(profile.role);
        setEmail(profile.email);
        setAvatarUrl(profile.avatar_url);

        const name = profile.name?.trim() || profile.email?.split("@")[0];

        if (name) {
          setUserName(name);
        }
      } catch {
        if (!ignore) {
          setOrgName((current) => current || "Workspace");
        }
      }
    }

    void loadProfile();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;

      if (!meta) return;

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }

      const shortcut = destinations.find((item) => item.shortcut === event.key);

      if (shortcut) {
        event.preventDefault();
        router.push(shortcut.href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const section = destinationForPath(pathname);
  const trailSuffix = pathname.startsWith("/chat") ? trail : null;
  const givenName = firstName(userName) ?? "there";
  const chrome = useMemo<WorkspaceChrome>(
    () => ({
      orgName,
      userName: givenName,
      userInitials: initials(userName),
      orgInitials: initials(orgName),
      role,
      email,
      avatarUrl,
      openSearch,
      setTrail
    }),
    [avatarUrl, email, givenName, openSearch, orgName, role, setTrail, userName]
  );

  return (
    <WorkspaceProvider value={chrome}>
      <div
        className={`bg-canvas text-ink ${
          immersive ? "h-dvh overflow-hidden" : "min-h-dvh"
        }`}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 bg-canvas/90 px-4 backdrop-blur-md sm:px-5">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-2 text-sm"
          >
            <Link
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink text-[11px] font-semibold text-white"
              href="/"
            >
              A
            </Link>
            <Link className="truncate text-muted hover:text-ink" href="/">
              {orgName}
            </Link>
            <span className="text-hairline">/</span>
            <Link
              className={`truncate ${trailSuffix ? "text-muted hover:text-ink" : "text-ink"}`}
              href={section.href}
            >
              {section.crumb}
            </Link>
            {trailSuffix ? (
              <>
                <span className="text-hairline">/</span>
                <span className="truncate text-ink">{trailSuffix}</span>
              </>
            ) : null}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="inline-flex h-8 items-center gap-2 rounded-full border border-hairline bg-surface px-2.5 text-muted hover:text-ink"
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <Search size={14} />
              <span className="hidden text-xs sm:inline">Search</span>
              <kbd className="rounded-md border border-hairline bg-soft px-1.5 py-0.5 font-mono text-[10px] text-muted">
                {modLabel}K
              </kbd>
            </button>
            <Link
              aria-label={`Open settings for ${userName}`}
              className="relative flex size-8 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface text-[11px] font-semibold"
              href="/account"
              title={userName}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="size-full object-cover" src={avatarUrl} />
              ) : (
                initials(userName)
              )}
            </Link>
          </div>
        </header>
        <main className={immersive ? "flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col" : undefined}>
          {children}
        </main>
        <nav
          aria-label="Workspace"
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-[20px] border border-hairline bg-surface/95 p-1.5 shadow-float backdrop-blur-md"
        >
          <span className="flex size-10 items-center justify-center rounded-[12px] bg-ink text-xs font-semibold text-white">
            A
          </span>
          <span className="mx-1 h-6 w-px bg-hairline" />
          {destinations.map((item) => {
            const active = isDestinationActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className="group relative flex size-10 items-center justify-center"
                href={item.href}
                key={item.href}
                title={`${item.label} (${modLabel}${item.shortcut})`}
              >
                <span
                  className={`absolute inset-0.5 rounded-[12px] transition ${
                    active ? "bg-surface shadow-float" : "group-hover:bg-soft"
                  }`}
                />
                <Icon
                  aria-hidden="true"
                  className={`relative ${active ? "text-accent" : "text-muted group-hover:text-ink"}`}
                  size={18}
                  strokeWidth={1.75}
                />
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-full bg-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
          })}
          <span className="mx-1 h-6 w-px bg-hairline" />
          <Link
            aria-label={`${orgName}, signed in`}
            className="relative flex size-10 items-center justify-center rounded-full text-[11px] font-semibold"
            href="/account"
            title={`${orgName} · signed in`}
          >
            {initials(orgName)}
            <span className="absolute right-1.5 bottom-1.5 size-1.5 rounded-full bg-ready ring-2 ring-surface" />
          </Link>
        </nav>
        <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </WorkspaceProvider>
  );
}
