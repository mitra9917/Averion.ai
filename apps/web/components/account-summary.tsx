"use client";

import {
  Building2,
  CheckCircle2,
  ChevronDown,
  Globe2,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  XCircle
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/skeleton";
import {
  AccountProfile,
  OrganizationInvitation,
  TeamInfo,
  TeamMember,
  acceptOrganizationInvitation,
  createOrganizationInvitation,
  getAccountProfile,
  getTeamInfo,
  listOrganizationInvitations,
  removeTeamMember,
  updateAccountProfile,
  updateOrganizationName,
  updateTeamMemberRole
} from "@/lib/api";
import { initials } from "@/lib/meridian";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Status = {
  kind: "success" | "error";
  message: string;
} | null;

const inputClass =
  "h-11 w-full rounded-control border border-hairline bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted";

function displayValue(value: string | null | undefined) {
  return value?.trim() || "Not set";
}

function displayName(member: TeamMember) {
  return member.name?.trim() || member.email;
}

export function AccountSummary() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [activeTab, setActiveTab] = useState<"profile" | "team">("profile");
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [language, setLanguage] = useState("en");
  const [organizationName, setOrganizationName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "owner" | "member">("all");
  const [status, setStatus] = useState<Status>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingOrganization, setIsSavingOrganization] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const isOwner = profile?.role === "owner";
  const members = useMemo(
    () =>
      (team?.members ?? []).filter(
        (member) => roleFilter === "all" || member.role === roleFilter
      ),
    [roleFilter, team]
  );

  async function refreshWorkspace() {
    const [nextProfile, nextTeam, nextInvitations] = await Promise.all([
      getAccountProfile(),
      getTeamInfo(),
      listOrganizationInvitations()
    ]);
    setProfile(nextProfile);
    setTeam(nextTeam);
    setInvitations(nextInvitations);
    setName(nextProfile.name ?? "");
    setJobTitle(nextProfile.job_title ?? "");
    setLanguage(nextProfile.language_preference ?? "en");
    setOrganizationName(nextTeam.organization_name);
  }

  useEffect(() => {
    let active = true;

    async function loadInitialWorkspace() {
      try {
        const [nextProfile, nextTeam, nextInvitations] = await Promise.all([
          getAccountProfile(),
          getTeamInfo(),
          listOrganizationInvitations()
        ]);

        if (!active) return;

        setProfile(nextProfile);
        setTeam(nextTeam);
        setInvitations(nextInvitations);
        setName(nextProfile.name ?? "");
        setJobTitle(nextProfile.job_title ?? "");
        setLanguage(nextProfile.language_preference ?? "en");
        setOrganizationName(nextTeam.organization_name);
      } catch (error) {
        if (active) {
          setStatus({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not load account and workspace."
          });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadInitialWorkspace();

    return () => {
      active = false;
    };
  }, []);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);
    setStatus(null);

    try {
      const updated = await updateAccountProfile({
        name: name.trim() || null,
        job_title: jobTitle.trim() || null,
        language_preference: language
      });
      setProfile(updated);
      setStatus({ kind: "success", message: "Profile changes saved." });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save profile."
      });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleOrganizationSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationName.trim()) return;

    setIsSavingOrganization(true);
    setStatus(null);

    try {
      const updated = await updateOrganizationName(organizationName.trim());
      setTeam(updated);
      setProfile((current) =>
        current ? { ...current, organization_name: updated.organization_name } : current
      );
      setStatus({ kind: "success", message: "Organization name updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not update organization."
      });
    } finally {
      setIsSavingOrganization(false);
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsInviting(true);
    setStatus(null);

    try {
      const invitation = await createOrganizationInvitation(inviteEmail.trim());
      setInviteEmail("");
      setStatus({
        kind: "success",
        message: `Invitation created for ${invitation.invited_email}.`
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not send invitation."
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleAccept(invitation: OrganizationInvitation) {
    setAcceptingId(invitation.invitation_id);
    setStatus(null);

    try {
      await acceptOrganizationInvitation(invitation.invitation_id);
      await refreshWorkspace();
      setStatus({
        kind: "success",
        message: `You joined ${invitation.organization_name}.`
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not accept invitation."
      });
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleRole(member: TeamMember, role: TeamMember["role"]) {
    setUpdatingRoleId(member.user_id);
    setStatus(null);

    try {
      const updated = await updateTeamMemberRole(member.user_id, role);
      setTeam((current) =>
        current
          ? {
              ...current,
              members: current.members.map((item) =>
                item.user_id === updated.user_id ? updated : item
              )
            }
          : current
      );
      setStatus({
        kind: "success",
        message: `${displayName(updated)} is now an ${updated.role}.`
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not change role."
      });
    } finally {
      setUpdatingRoleId(null);
    }
  }

  async function handleRemove(member: TeamMember) {
    if (
      !window.confirm(
        `Remove ${displayName(member)} from this organization? They will receive a private workspace where they become owner.`
      )
    ) {
      return;
    }

    setRemovingId(member.user_id);
    setStatus(null);

    try {
      await removeTeamMember(member.user_id);
      setTeam((current) =>
        current
          ? {
              ...current,
              members: current.members.filter((item) => item.user_id !== member.user_id)
            }
          : current
      );
      setStatus({
        kind: "success",
        message: `${displayName(member)} was moved to a private workspace.`
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not remove member."
      });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleLogout() {
    setIsSigningOut(true);

    if (supabase) {
      await supabase.auth.signOut();
    }

    router.replace("/login");
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-4 px-5 pt-4 pb-28">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-5 pt-2 pb-28">
      <p className="micro">Settings</p>
      <h1 className="display mt-3 text-[30px]">Account & workspace</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Profile, language, organization name, invitations, and who can manage the library.
      </p>

      <div className="mt-8 flex gap-6 border-b border-hairline">
        {(
          [
            ["profile", "My profile"],
            ["team", "Organization & team"]
          ] as const
        ).map(([id, label]) => (
          <button
            className={`border-b-2 px-1 pb-3 text-sm font-medium ${
              activeTab === id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
            key={id}
            onClick={() => setActiveTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {status ? (
        <div
          className="mt-5 flex items-start gap-3 rounded-control border border-hairline bg-surface px-4 py-3 text-sm"
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.kind === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{status.message}</span>
        </div>
      ) : null}

      {activeTab === "profile" ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-pane border border-hairline bg-surface p-5 sm:p-7">
            <div className="flex items-center gap-4 border-b border-hairline pb-6">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="size-16 rounded-pane object-cover"
                  src={profile.avatar_url}
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-pane bg-ink text-lg font-semibold text-white">
                  {initials(profile?.name ?? profile?.email)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-medium">{displayValue(profile?.name)}</h2>
                <p className="mt-1 truncate text-sm text-muted">{displayValue(profile?.job_title)}</p>
              </div>
            </div>

            <form className="mt-6 grid gap-5" onSubmit={handleProfileSave}>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-medium text-muted">Display name</span>
                  <input
                    className={inputClass}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Add your name"
                    value={name}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-medium text-muted">Job title</span>
                  <input
                    className={inputClass}
                    maxLength={120}
                    onChange={(event) => setJobTitle(event.target.value)}
                    placeholder="Knowledge manager, founder, engineer"
                    value={jobTitle}
                  />
                </label>
              </div>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-muted">Email address</span>
                <span className="flex h-11 items-center justify-between rounded-control border border-hairline bg-soft px-3 text-sm text-muted">
                  {displayValue(profile?.email)}
                  <Lock size={14} />
                </span>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-muted">Preferred language</span>
                <span className="relative">
                  <Globe2 className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={16} />
                  <select
                    className="h-11 w-full appearance-none rounded-control border border-hairline bg-surface pr-9 pl-10 text-sm outline-none"
                    onChange={(event) => setLanguage(event.target.value)}
                    value={language}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi (हिंदी)</option>
                    <option value="es">Spanish (Español)</option>
                    <option value="fr">French (Français)</option>
                    <option value="de">German (Deutsch)</option>
                    <option value="ja">Japanese (日本語)</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
                    size={16}
                  />
                </span>
                <span className="text-xs leading-5 text-muted">
                  This controls the chatbot&apos;s response language and your saved preference.
                </span>
              </label>
              <div className="flex justify-end border-t border-hairline pt-5">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-50"
                  disabled={isSavingProfile}
                  type="submit"
                >
                  {isSavingProfile ? <LoaderCircle className="animate-spin" size={15} /> : null}
                  {isSavingProfile ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>

          <aside className="h-fit rounded-pane border border-hairline bg-surface p-5">
            <h2 className="micro">Account summary</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Email</dt>
                <dd className="mt-1 break-words">{displayValue(profile?.email)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Organization</dt>
                <dd className="mt-1">{displayValue(profile?.organization_name)}</dd>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <dt className="text-xs text-muted">Role</dt>
                  <dd className="mt-1 capitalize">{displayValue(profile?.role)}</dd>
                </div>
                <span className="rounded-full border border-hairline px-2 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase">
                  {profile?.role ?? "member"}
                </span>
              </div>
              <div className="border-t border-hairline pt-4">
                <dt className="text-xs text-muted">User ID</dt>
                <dd className="mt-2 rounded-control bg-soft p-2 font-mono text-[10px] break-all text-muted">
                  {displayValue(profile?.user_id)}
                </dd>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck size={15} />
                Authenticated with Supabase
              </div>
            </dl>
            <button
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-hairline text-sm font-semibold hover:bg-soft disabled:opacity-50"
              disabled={isSigningOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              <LogOut size={15} />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </aside>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <section className="rounded-pane border border-hairline bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-pane border border-hairline">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-medium">
                    {displayValue(team?.organization_name)}
                  </h2>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <Users size={14} />
                    {team?.members.length ?? 0} members
                    <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase">
                      {profile?.role}
                    </span>
                  </p>
                </div>
              </div>
              {isOwner ? (
                <form className="flex min-w-0 flex-1 gap-2 lg:max-w-xl" onSubmit={handleOrganizationSave}>
                  <label className="relative min-w-0 flex-1">
                    <Pencil className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={14} />
                    <input
                      aria-label="Organization name"
                      className="h-10 w-full rounded-control border border-hairline bg-surface pr-3 pl-9 text-sm outline-none"
                      maxLength={120}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      value={organizationName}
                    />
                  </label>
                  <button
                    className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-50"
                    disabled={isSavingOrganization || !organizationName.trim()}
                    type="submit"
                  >
                    {isSavingOrganization ? "Saving…" : "Save"}
                  </button>
                </form>
              ) : null}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <section className="rounded-pane border border-hairline bg-surface p-5">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <Mail size={16} />
                  {isOwner ? "Invite members" : "Workspace invitations"}
                </h2>
                {isOwner ? (
                  <form className="mt-4" onSubmit={handleInvite}>
                    <label className="micro">Email address</label>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="h-10 min-w-0 flex-1 rounded-control border border-hairline bg-surface px-3 text-sm outline-none"
                        maxLength={254}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="colleague@example.com"
                        type="email"
                        value={inviteEmail}
                      />
                      <button
                        aria-label="Send invitation"
                        className="flex size-10 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/90 disabled:opacity-50"
                        disabled={isInviting || !inviteEmail.trim()}
                        type="submit"
                      >
                        {isInviting ? <LoaderCircle className="animate-spin" size={15} /> : <Send size={15} />}
                      </button>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted">
                      The invited user can accept after signing in with the same email address.
                    </p>
                  </form>
                ) : null}
                <div className={isOwner ? "mt-5 border-t border-hairline pt-4" : "mt-4"}>
                  <h3 className="micro">Invitations for you</h3>
                  {invitations.length ? (
                    <div className="mt-3 space-y-2">
                      {invitations.map((invitation) => (
                        <div className="rounded-control border border-hairline p-3" key={invitation.invitation_id}>
                          <p className="text-sm font-medium">{invitation.organization_name}</p>
                          <p className="mt-1 text-xs text-muted">Sent to {invitation.invited_email}</p>
                          <button
                            className="mt-3 h-8 w-full rounded-full border border-hairline text-xs font-semibold hover:bg-soft disabled:opacity-50"
                            disabled={acceptingId === invitation.invitation_id}
                            onClick={() => void handleAccept(invitation)}
                            type="button"
                          >
                            {acceptingId === invitation.invitation_id ? "Accepting…" : "Accept invitation"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-muted">No pending invitations for your email.</p>
                  )}
                </div>
              </section>
              <section className="rounded-pane border border-hairline bg-surface p-5">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck size={16} />
                  Access rules
                </h2>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-muted">
                  <li>All members can upload and chat with organization documents.</li>
                  <li>Only owners can delete documents or manage team access.</li>
                  <li>Owners can promote or demote other owners and members.</li>
                </ul>
              </section>
            </div>

            <section className="overflow-hidden rounded-pane border border-hairline bg-surface">
              <div className="flex flex-col gap-3 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-medium">
                    <Users size={16} />
                    Active members
                  </h2>
                  <p className="mt-1 text-xs text-muted">{members.length} shown</p>
                </div>
                <label className="relative">
                  <select
                    aria-label="Filter members by role"
                    className="h-9 appearance-none rounded-full border border-hairline bg-surface pr-8 pl-3 text-xs outline-none"
                    onChange={(event) =>
                      setRoleFilter(event.target.value as "all" | "owner" | "member")
                    }
                    value={roleFilter}
                  >
                    <option value="all">All roles</option>
                    <option value="owner">Owners</option>
                    <option value="member">Members</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted"
                    size={14}
                  />
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-[11px] tracking-[0.08em] text-muted uppercase">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Member</th>
                      <th className="px-5 py-3 font-semibold">Job title</th>
                      <th className="px-5 py-3 font-semibold">Role</th>
                      <th className="px-5 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => {
                      const isSelf = member.user_id === profile?.user_id;
                      const canManage = isOwner && !isSelf;

                      return (
                        <tr className="border-t border-hairline" key={member.user_id}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline text-xs font-semibold">
                                {initials(member.name ?? member.email)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {displayName(member)}
                                  {isSelf ? <span className="ml-2 text-[11px] text-muted">You</span> : null}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-muted">{member.email}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-muted">{displayValue(member.job_title)}</td>
                          <td className="px-5 py-4">
                            {canManage ? (
                              <select
                                className="h-9 rounded-control border border-hairline bg-surface px-3 text-xs capitalize outline-none disabled:opacity-50"
                                disabled={updatingRoleId === member.user_id}
                                onChange={(event) =>
                                  void handleRole(member, event.target.value as TeamMember["role"])
                                }
                                value={member.role}
                              >
                                <option value="member">Member</option>
                                <option value="owner">Owner</option>
                              </select>
                            ) : (
                              <span className="rounded-full border border-hairline px-2 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase">
                                {member.role}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {canManage ? (
                              <button
                                aria-label={`Remove ${displayName(member)}`}
                                className="rounded-full p-2 text-muted hover:bg-soft hover:text-fail disabled:opacity-50"
                                disabled={removingId === member.user_id}
                                onClick={() => void handleRemove(member)}
                                title="Remove member"
                                type="button"
                              >
                                {removingId === member.user_id ? (
                                  <LoaderCircle className="animate-spin" size={16} />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                            ) : (
                              <UserRound className="ml-auto text-muted" size={16} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
