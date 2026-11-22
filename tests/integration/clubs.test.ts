import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Harness } from "../support/harness";

let h: Harness;
beforeAll(async () => { h = await Harness.create("clubs"); });
afterAll(() => h.end());

describe("accounts and profiles", () => {
  it("creates a profile on registration and reads nothing but the name from metadata", async () => {
    const [u] = await h.sql(
      `insert into auth.users (email, raw_user_meta_data) values ('a@x.test', '{"display_name":"Ada","role":"admin"}') returning id`);
    expect(await h.sql("select display_name from profiles where id = $1", [u!.id])).toEqual([{ display_name: "Ada" }]);
  });
  it("gives a profile to accounts that predate the migrations", async () => {
    const early = await Harness.create("early", { before: `insert into auth.users (email, raw_user_meta_data) values ('early@x.test', '{"display_name":"Early"}'), ('bare@x.test', '{}')` });
    expect(await early.sql("select display_name from profiles order by 1")).toEqual([{ display_name: "Early" }, { display_name: "Reader" }]);
    await early.end();
  });
  it("takes a name from Google, but not a picture or a role", async () => {
    const [u] = await h.sql(`insert into auth.users (email, raw_user_meta_data) values ('g@x.test', '{"full_name":"Grace Hopper","avatar_url":"https://lh3.googleusercontent.com/x","role":"admin"}') returning id`);
    expect(await h.sql("select display_name, avatar_url from profiles where id = $1", [u!.id])).toEqual([{ display_name: "Grace Hopper", avatar_url: null }]);
  });
  it("falls back when no name is given", async () => {
    const [u] = await h.sql("insert into auth.users (email) values ('b@x.test') returning id");
    expect((await h.sql("select display_name from profiles where id = $1", [u!.id]))[0]!.display_name).toBe("Reader");
  });
  it("hides strangers' profiles and forbids editing others", async () => {
    const [a, b] = [await h.user(), await h.user()];
    expect(await h.as(a, "select * from profiles where id = $1", [b])).toEqual([]);
    expect(await h.as(a, "update profiles set display_name = 'x' where id = $1 returning id", [b])).toEqual([]);
  });
  it("shows nothing to signed-out visitors", async () => {
    for (const table of ["profiles", "clubs", "books", "user_books", "invitations", "votes"]) {
      await expect(h.as(null, `select * from ${table}`)).rejects.toThrow(/permission denied/);
    }
    await expect(h.rpc(null, "create_club", { p_name: "x" })).rejects.toThrow(/permission denied/);
  });
});

describe("clubs and roles", () => {
  it("makes the creator the first administrator", async () => {
    const a = await h.user();
    const club = await h.club(a);
    expect(await h.as(a, "select user_id, role from club_memberships where club_id = $1", [club])).toEqual([{ user_id: a, role: "admin" }]);
  });
  it("keeps clubs invisible to outsiders", async () => {
    const [a, outsider] = [await h.user(), await h.user()];
    const club = await h.club(a);
    expect(await h.as(outsider, "select * from clubs where id = $1", [club])).toEqual([]);
    expect(await h.as(outsider, "select * from club_memberships where club_id = $1", [club])).toEqual([]);
    expect(await h.as(outsider, "select * from activity_events where club_id = $1", [club])).toEqual([]);
  });
  it("gives no direct write access to memberships", async () => {
    const [a, outsider] = [await h.user(), await h.user()];
    const club = await h.club(a);
    await expect(h.as(outsider, "insert into club_memberships (club_id, user_id, role) values ($1, $2, 'admin')", [club, outsider])).rejects.toThrow(/permission denied/);
    await h.join(a, club, outsider);
    await expect(h.as(outsider, "update club_memberships set role = 'admin' where user_id = $1", [outsider])).rejects.toThrow(/permission denied/);
  });
  it("lets only administrators change roles, remove people or edit the club", async () => {
    const [a, b, c] = [await h.user(), await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    await h.join(a, club, c);
    await expect(h.rpc(b, "set_member_role", { p_club_id: club, p_user_id: b, p_role: "admin" })).rejects.toThrow(/Only a club administrator/);
    await expect(h.rpc(b, "remove_member", { p_club_id: club, p_user_id: c })).rejects.toThrow(/Only a club administrator/);
    expect(await h.as(b, "update clubs set name = 'Mine' where id = $1 returning id", [club])).toEqual([]);
    await h.rpc(a, "set_member_role", { p_club_id: club, p_user_id: b, p_role: "admin" });
    expect(await h.as(b, "update clubs set name = 'Renamed' where id = $1 returning name", [club])).toEqual([{ name: "Renamed" }]);
  });
  it("does not let an administrator of one club act in another", async () => {
    const [a, b] = [await h.user(), await h.user()];
    await h.club(a);
    const other = await h.club(b);
    await expect(h.rpc(a, "remove_member", { p_club_id: other, p_user_id: b })).rejects.toThrow(/not a member/);
    await expect(h.rpc(a, "create_invitation", { p_club_id: other })).rejects.toThrow(/not a member/);
  });
  it("protects the last administrator from demotion and leaving", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    await expect(h.rpc(a, "set_member_role", { p_club_id: club, p_user_id: a, p_role: "member" })).rejects.toThrow(/at least one administrator/);
    await expect(h.rpc(a, "leave_club", { p_club_id: club })).rejects.toThrow(/at least one administrator/);
    await h.rpc(a, "set_member_role", { p_club_id: club, p_user_id: b, p_role: "admin" });
    await h.rpc(a, "leave_club", { p_club_id: club });
    await expect(h.rpc(b, "leave_club", { p_club_id: club })).rejects.toThrow(/at least one administrator/);
  });
  it("survives two administrators demoting each other at once", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    await h.rpc(a, "set_member_role", { p_club_id: club, p_user_id: b, p_role: "admin" });
    const demote = "select set_member_role($1, $2, 'member')";
    const [first, second] = [await h.begin(a), await h.begin(b)];
    await first.query(demote, [club, b]);
    // The second starts before the first commits, and must wait for it.
    const pending = second.query(demote, [club, a]).then(() => second.commit(), async (e) => { await second.rollback(); throw e; });
    const outcome = expect(pending).rejects.toThrow(/at least one administrator/);
    await new Promise((r) => setTimeout(r, 150));
    await first.commit();
    await outcome;
    expect(await h.sql("select user_id from club_memberships where club_id = $1 and role = 'admin'", [club])).toEqual([{ user_id: a }]);
  });
  it("lets a sole member close a club, but nobody else", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    await expect(h.rpc(a, "close_club", { p_club_id: club })).rejects.toThrow(/last remaining member/);
    await h.rpc(a, "remove_member", { p_club_id: club, p_user_id: b });
    await h.rpc(a, "close_club", { p_club_id: club });
    expect(await h.sql("select 1 from clubs where id = $1", [club])).toEqual([]);
  });
  it("keeps a former member's name readable to the club but ends their access", async () => {
    const [a, b] = [await h.user("A"), await h.user("Former")];
    const club = await h.club(a);
    await h.join(a, club, b);
    await h.rpc(b, "leave_club", { p_club_id: club });
    expect(await h.as(a, "select display_name from profiles where id = $1", [b])).toEqual([{ display_name: "Former" }]);
    expect(await h.as(b, "select * from clubs where id = $1", [club])).toEqual([]);
    expect(await h.as(b, "select * from profiles where id = $1", [a])).toEqual([]);
  });
});

describe("invitations", () => {
  it("stores only a hash and never exposes it", async () => {
    const a = await h.user();
    const club = await h.club(a);
    const inv = await h.rpc(a, "create_invitation", { p_club_id: club });
    expect(inv.token).toMatch(/^[0-9a-f]{64}$/);
    const [row] = await h.sql("select encode(token_hash, 'hex') hash from invitations where id = $1", [inv.id]);
    expect(row!.hash).not.toBe(inv.token);
    await expect(h.as(a, "select token_hash from invitations")).rejects.toThrow(/permission denied/);
    const days = (new Date(inv.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7.001);
  });
  it("admits an invitee as an ordinary member, once", async () => {
    const [a, b, c] = [await h.user("Ann"), await h.user(), await h.user()];
    const club = await h.club(a, "Readers");
    const { token } = await h.rpc(a, "create_invitation", { p_club_id: club });
    expect(await h.rpc(null, "preview_invitation", { p_token: token })).toMatchObject({ status: "pending", club_name: "Readers", invited_by: "Ann" });
    expect(await h.rpc(b, "accept_invitation", { p_token: token })).toMatchObject({ status: "joined", club_id: club });
    expect(await h.sql("select role from club_memberships where user_id = $1", [b])).toEqual([{ role: "member" }]);
    expect(await h.rpc(c, "accept_invitation", { p_token: token })).toEqual({ status: "used" });
    expect(await h.rpc(c, "preview_invitation", { p_token: token })).toEqual({ status: "used" });
  });
  it("lets ordinary members invite", async () => {
    const [a, b, c] = [await h.user(), await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    expect((await h.join(b, club, c)).status).toBe("joined");
  });
  it("admits exactly one of two simultaneous acceptances", async () => {
    const [a, b, c] = [await h.user(), await h.user(), await h.user()];
    const club = await h.club(a);
    const { token } = await h.rpc(a, "create_invitation", { p_club_id: club });
    const out = await Promise.all([b, c].map((u) => h.rpc(u, "accept_invitation", { p_token: token })));
    expect(out.map((o) => o.status).sort()).toEqual(["joined", "used"]);
  });
  it("is not spent by an existing member", async () => {
    const [a, b, c] = [await h.user(), await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    const { id, token } = await h.rpc(a, "create_invitation", { p_club_id: club });
    expect((await h.rpc(b, "preview_invitation", { p_token: token })).status).toBe("already_member");
    expect((await h.rpc(b, "accept_invitation", { p_token: token })).status).toBe("already_member");
    expect(await h.sql("select status from invitations where id = $1", [id])).toEqual([{ status: "pending" }]);
    expect((await h.rpc(c, "accept_invitation", { p_token: token })).status).toBe("joined");
  });
  it("expires", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const club = await h.club(a);
    const { id, token } = await h.rpc(a, "create_invitation", { p_club_id: club });
    await h.sql("update invitations set expires_at = now() - interval '1 second' where id = $1", [id]);
    expect(await h.rpc(null, "preview_invitation", { p_token: token })).toEqual({ status: "expired" });
    expect(await h.rpc(b, "accept_invitation", { p_token: token })).toEqual({ status: "expired" });
    expect(await h.sql("select status from invitations where id = $1", [id])).toEqual([{ status: "expired" }]);
  });
  it("can be revoked by its inviter or an administrator only", async () => {
    const [a, b, c, d] = [await h.user(), await h.user(), await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    await h.join(a, club, c);
    const mine = await h.rpc(b, "create_invitation", { p_club_id: club });
    const second = await h.rpc(b, "create_invitation", { p_club_id: club });
    await expect(h.rpc(c, "revoke_invitation", { p_invitation_id: mine.id })).rejects.toThrow(/could not be found/);
    expect(await h.as(c, "select id from invitations where id = $1", [mine.id])).toEqual([]);
    await h.rpc(b, "revoke_invitation", { p_invitation_id: mine.id });
    await h.rpc(a, "revoke_invitation", { p_invitation_id: second.id });
    expect(await h.rpc(d, "accept_invitation", { p_token: mine.token })).toEqual({ status: "revoked" });
    await expect(h.rpc(a, "revoke_invitation", { p_invitation_id: second.id })).rejects.toThrow(/Only a pending/);
  });
  it("is revoked when the inviter is removed", async () => {
    const [a, b, c] = [await h.user(), await h.user(), await h.user()];
    const club = await h.club(a);
    await h.join(a, club, b);
    const { token } = await h.rpc(b, "create_invitation", { p_club_id: club });
    await h.rpc(a, "remove_member", { p_club_id: club, p_user_id: b });
    expect(await h.rpc(c, "accept_invitation", { p_token: token })).toEqual({ status: "revoked" });
    expect(await h.rpc(b, "accept_invitation", { p_token: token })).toEqual({ status: "revoked" });
  });
  it("rejects invalid tokens and rate-limits guessing", async () => {
    const b = await h.user();
    for (const bad of ["", "nope", "0".repeat(64), "'; drop table clubs; --"]) {
      expect(await h.rpc(b, "accept_invitation", { p_token: bad })).toEqual({ status: "invalid" });
    }
    let last;
    for (let i = 0; i < 20; i++) last = await h.rpc(b, "accept_invitation", { p_token: "f".repeat(64) });
    expect(last).toEqual({ status: "rate_limited" });
  });
  it("rate-limits creation", async () => {
    const a = await h.user();
    const club = await h.club(a);
    for (let i = 0; i < 20; i++) await h.rpc(a, "create_invitation", { p_club_id: club });
    await expect(h.rpc(a, "create_invitation", { p_club_id: club })).rejects.toThrow(/a lot of invitations/);
  });
});
