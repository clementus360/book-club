import { Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton } from "@/components/forms/action-form";
import { Icon } from "@/components/icon";
import { Fold } from "@/components/fold";
import { FormDialog } from "@/components/forms/dialog";
import { InviteDialog } from "@/components/invite";
import { Avatar, nameOf, PageHeader, Section } from "@/components/ui";
import { leaveClub, removeMember, revokeInvitation, setMemberRole } from "@/lib/actions/clubs";
import { getMembers } from "@/lib/data/club";
import { formatDate, fromNow } from "@/lib/dates";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Members" };

export default async function Members() {
  const { supabase, club, userId, isAdmin } = await requireClub();
  const [members, invitations] = await Promise.all([
    getMembers(),
    supabase.from("invitations")
      .select("id, status, expires_at, created_at, accepted_at, invited_by, inviter:profiles!invitations_invited_by_fkey(display_name), accepter:profiles!invitations_accepted_by_fkey(display_name)")
      .eq("club_id", club.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const admins = members.filter((m) => m.role === "admin").length;
  const now = new Date();
  const invites = must(invitations).map((i) => ({ ...i, state: i.status === "pending" && new Date(i.expires_at) <= now ? "expired" as const : i.status }));
  const pending = invites.filter((i) => i.state === "pending");
  const earlier = invites.filter((i) => i.state !== "pending");

  return (
    <>
      <PageHeader kicker={club.name} title="Members" action={<InviteDialog clubId={club.id} clubName={club.name} />}>Everyone in the club. Any member can invite a friend.</PageHeader>
      <Section title={`${members.length} ${members.length === 1 ? "member" : "members"}`}>
        <ul>
          {members.map((m) => {
            const me = m.user_id === userId;
            const last = m.role === "admin" && admins === 1;
            const hidden = { club_id: club.id, user_id: m.user_id };
            return (
              <li key={m.user_id} className="row-sm flex flex-wrap items-center gap-x-4 gap-y-2">
                <Avatar person={m.profile} className="size-10 text-base" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-serif text-lg leading-tight">{nameOf(m.profile)}{me && <span className="meta"> (you)</span>}</p>
                  <p className="meta">{m.role === "admin" && <Icon of={ShieldCheck} className="mr-1.5 -mt-0.5 text-leaf" />}{m.role === "admin" ? "Administrator" : "Member"}, joined {formatDate(m.joined_at, club.timezone)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-5">
                  {isAdmin && !last && <ActionButton action={setMemberRole} hidden={{ ...hidden, role: m.role === "admin" ? "member" : "admin" }} className="btn-text">{m.role === "admin" ? "Make an ordinary member" : "Make an administrator"}</ActionButton>}
                  {isAdmin && !me && (
                    <FormDialog trigger="Remove" triggerClass="btn-text danger" title={`Remove ${nameOf(m.profile)}?`} action={removeMember} hidden={hidden} submit="Remove from the club" submitClass="btn btn-danger">
                      <p>They will lose access to this club. What they contributed stays in its history, and their personal library is untouched.</p>
                    </FormDialog>
                  )}
                  {me && (last ? <span className="meta">Sole administrator</span> : (
                    <FormDialog trigger="Leave club" triggerClass="btn-text danger" title={`Leave ${club.name}?`} action={leaveClub} hidden={{ club_id: club.id }} submit="Leave the club" submitClass="btn btn-danger">
                      <p>You will need a new invitation to come back. Your personal library stays with you.</p>
                    </FormDialog>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Pending invitations" note={isAdmin ? undefined : "The ones you made."}>
        {pending.length === 0 ? <p className="text-soft">There are no pending invitations.</p> : (
          <ul>
            {pending.map((i) => (
              <li key={i.id} className="row-sm flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
                <span>Made by {i.invited_by === userId ? "you" : nameOf(i.inviter)} <span className="meta">{fromNow(i.created_at)}. Expires {fromNow(i.expires_at)}.</span></span>
                <ActionButton action={revokeInvitation} hidden={{ id: i.id }} className="btn-text danger" pending="Revoking…">Revoke</ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {earlier.length > 0 && (
        <Section title="Earlier invitations">
          <Fold icon={Mail} title={`${earlier.length} ${earlier.length === 1 ? "invitation" : "invitations"}`} note="Used, stopped or run out.">
            <ul>
              {earlier.map((i) => (
                <li key={i.id} className="row-sm text-soft">
                  {i.state === "accepted" ? `Accepted by ${nameOf(i.accepter)}, ${formatDate(i.accepted_at!, club.timezone)}` : i.state === "revoked" ? "Revoked" : "Expired"}. <span className="text-sm">Made by {i.invited_by === userId ? "you" : nameOf(i.inviter)}.</span>
                </li>
              ))}
            </ul>
          </Fold>
        </Section>
      )}
    </>
  );
}
