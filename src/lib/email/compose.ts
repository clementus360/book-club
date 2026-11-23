import { formatDateTime, zoneLabel } from "@/lib/dates";
import { isKind, words } from "@/lib/kinds";

/** What claim_emails() hands out for each email. */
export type EmailItem = {
  id: string; type: string; user_id: string; email: string; name: string;
  club_id: string; club: string; kind?: string; timezone: string; actor: string | null; reference_id: string | null;
  cycle: { status: string; nomination_closes_at: string; voting_closes_at: string; runoff_closes_at: string | null; book: string | null; authors: string[] | null } | null;
  meeting: { title: string; starts_at: string; timezone: string; location: string | null } | null;
  poll: { title: string } | null;
};
export type Email = { subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/**
 * The email for one milestone. Only what is needed to act on it: no reviews,
 * notes, votes or anything else written inside the club.
 */
export function compose(item: EmailItem, site: string, stopUrl: string): Email | null {
  const someone = item.actor ?? "An administrator";
  const when = (iso: string | null | undefined, zone = item.timezone) => (iso ? `${formatDateTime(iso, zone)} (${zoneLabel(zone, iso)})` : null);
  const c = item.cycle, m = item.meeting;
  const w = words(isKind(item.kind) ? item.kind : "book");
  const { one, many, a, verb } = w;
  const book = c?.book ? `${c.book}${c.authors?.length && w.kind !== "anime" ? ` by ${c.authors.join(", ")}` : ""}` : null;
  // A deadline line, or none if the date is missing.
  const by = (label: string, iso: string | null | undefined) => (iso ? [`${label} ${when(iso)}.`] : []);
  const meetingLines = m ? [`When: ${when(m.starts_at, m.timezone)}`, `Where: ${m.location ? oneLine(m.location) : "to be decided"}`] : [];

  const parts: Record<string, [string, string[], string, string]> = {
    // subject, lines, button, where it leads
    nominations_opened: ["Nominations are open", [`Time to choose the next ${one}. Put forward one you would like the club to ${verb}.`, ...by("Nominations close", c?.nomination_closes_at)], `Nominate ${a}`, "/app/add-book?to=nominate"],
    nominations_reopened: ["More time to nominate", [`${someone} gave everyone more time to put forward ${a}.`, ...by("Nominations now close", c?.nomination_closes_at)], `Nominate ${a}`, "/app/add-book?to=nominate"],
    nominations_closed: ["Nominations have closed", [`There are not enough ${many} to vote on yet, so an administrator will decide what happens next.`], "See the nominations", "/app/selection"],
    voting_opened: ["Voting is open", [`Put the nominated ${many} in the order you would like to ${verb} them. Nobody can see how you voted.`, ...by("Voting closes", c?.voting_closes_at)], "Vote now", "/app/selection#vote"],
    voting_reopened: ["Voting is open again", [`${someone} opened voting again.`, ...by("Voting closes", c?.voting_closes_at)], "Vote now", "/app/selection#vote"],
    runoff_opened: ["Voting is over: it was a tie", [`The top ${many} came level, so there is a second vote between them.`, ...by("It closes", c?.runoff_closes_at)], "Vote again", "/app/selection#vote"],
    decision_needed: ["Voting is over: no clear winner", [`The vote did not settle it, so an administrator will agree the ${one} with the club.`], "See the result", "/app/selection"],
    book_selected: [c?.book ? `Voting is over: ${oneLine(c.book)}` : "Voting is over", [book ? `The club is ${w.verbing} ${book}.` : `The club has chosen its next ${one}.`], `See the ${one}`, "/app/current-book"],
    cycle_cancelled: [`Choosing ${a} was stopped`, [`${someone} stopped this round of choosing ${a}. Nothing is needed from you.`], "Open the club", "/app"],
    meeting_created: [`Meeting: ${oneLine(m?.title ?? "")}`, [`${someone} arranged a meeting.`, ...meetingLines], "Say if you are coming", `/app/meetings/${item.reference_id}`],
    meeting_updated: [`Meeting changed: ${oneLine(m?.title ?? "")}`, [`${someone} changed the time or place.`, ...meetingLines], "See the meeting", `/app/meetings/${item.reference_id}`],
    meeting_cancelled: [`Meeting cancelled: ${oneLine(m?.title ?? "")}`, [`${someone} cancelled this meeting.`, ...meetingLines.slice(0, 1)], "See the meeting", `/app/meetings/${item.reference_id}`],
    poll_opened: ["When can you meet?", [`${someone} suggested some times${item.poll ? ` for ${oneLine(item.poll.title)}` : ""}. Say which suit you.`], "Answer", `/app/meetings/find/${item.reference_id}`],
  };
  const part = parts[item.type];
  if (!part) return null;
  // A meeting or a poll that has gone since the notification was made.
  if ((item.type.startsWith("meeting_") && !m) || (item.type === "poll_opened" && !item.poll)) return null;
  const [title, lines, label, path] = part;
  const club = oneLine(item.club);
  const subject = `${club}: ${oneLine(title)}`;
  const link = `${site}/app/go?${new URLSearchParams({ club: item.club_id, to: path })}`;
  const foot = `You are getting this because you are in ${club} on Commonplace. To stop these emails: ${stopUrl}`;

  const text = [`Hello ${oneLine(item.name)},`, "", ...lines, "", `${label}: ${link}`, "", "—", foot, ""].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f1eee6;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;color:#211f1b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#faf8f2;border:1px solid #d8d2c3">
<tr><td style="padding:28px 28px 8px"><p style="margin:0 0 6px;font-style:italic;color:#8f2d1d;font-size:15px">${esc(club)}</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:normal">${esc(title)}</h1>
<p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55">Hello ${esc(oneLine(item.name))},</p>
${lines.map((l) => `<p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55">${esc(l)}</p>`).join("\n")}
<p style="margin:22px 0 26px"><a href="${esc(link)}" style="display:inline-block;background:#1e4a3c;color:#faf8f2;text-decoration:none;padding:11px 18px;border-radius:3px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold">${esc(label)}</a></p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #d8d2c3;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#5b564c">You are getting this because you are in ${esc(club)} on Commonplace. <a href="${esc(stopUrl)}" style="color:#5b564c">Stop these emails</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
