import { randomUUID } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";
import { createDatabase } from "./postgres.mjs";

declare module "vitest" {
  interface ProvidedContext {
    pgUrl: string;
  }
}

pg.types.setTypeParser(20, Number); // count(*) as a number

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class Harness {
  private constructor(
    private pool: pg.Pool,
  ) {}

  static async create(name: string, options: { before?: string } = {}) {
    const url = await createDatabase(inject("pgUrl"), `t_${name}_${randomUUID().slice(0, 8)}`, options);
    const pool = new pg.Pool({ connectionString: url, max: 12 });
    pool.on("error", () => {});
    return new Harness(pool);
  }
  end = () => this.pool.end();

  /** Superuser: for arranging time and checking what is really stored. */
  async sql(text: string, params: unknown[] = []): Promise<Row[]> {
    return (await this.pool.query(text, params)).rows;
  }

  /** Runs SQL exactly as PostgREST would for this person. */
  async as(who: string | null | "service", text: string, params: unknown[] = []): Promise<Row[]> {
    const client = await this.pool.connect();
    const role = who === "service" ? "service_role" : who ? "authenticated" : "anon";
    const claims = who && who !== "service" ? { sub: who, role } : { role };
    try {
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      const { rows } = await client.query(text, params);
      await client.query("commit");
      return rows;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  /** An open transaction as this person, for testing interleavings. */
  async begin(who: string) {
    const client = await this.pool.connect();
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    return {
      query: (text: string, params: unknown[] = []) => client.query(text, params),
      commit: async () => { await client.query("commit"); client.release(); },
      rollback: async () => { await client.query("rollback"); client.release(); },
    };
  }

  async rpc(who: string | null | "service", fn: string, args: Record<string, unknown> = {}) {
    const keys = Object.keys(args);
    const list = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
    const values = keys.map((k) => {
      const v = args[k];
      return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? JSON.stringify(v) : v;
    });
    const rows = await this.as(who, `select * from public.${fn}(${list})`, values);
    const first = rows[0];
    return first && Object.keys(first).length === 1 && fn in first ? first[fn] : first;
  }

  async user(name = "Reader"): Promise<string> {
    const [row] = await this.sql(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [`${randomUUID()}@example.test`, JSON.stringify({ display_name: name })],
    );
    return row!.id;
  }

  async club(admin: string, name = "The Club"): Promise<string> {
    return this.rpc(admin, "create_club", { p_name: name });
  }

  async join(inviter: string, club: string, joiner: string) {
    const { token } = await this.rpc(inviter, "create_invitation", { p_club_id: club });
    return this.rpc(joiner, "accept_invitation", { p_token: token });
  }

  async manualBook(who: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
    return this.rpc(who, "create_manual_book", { p_book: { title, authors: ["An Author"], ...extra } });
  }

  async importBook(title: string, extra: Record<string, unknown> = {}): Promise<string> {
    return this.rpc("service", "import_book", {
      p_book: { title, authors: ["An Author"], metadata_source: "open_library", open_library_edition_id: `OL${randomUUID()}M`, ...extra },
    });
  }

  async shelve(who: string, book: string, status = "read") {
    await this.as(who, "insert into user_books (user_id, book_id, status) values ($1, $2, $3)", [who, book, status]);
  }

  async cycle(admin: string, club: string, offsetsInDays = [-0.01, 7, 7, 12, 12, 42]): Promise<string> {
    const at = offsetsInDays.map((d) => new Date(Date.now() + d * 86_400_000).toISOString());
    return this.rpc(admin, "create_cycle", {
      p_club_id: club, p_nomination_opens_at: at[0], p_nomination_closes_at: at[1],
      p_voting_opens_at: at[2], p_voting_closes_at: at[3], p_reading_starts_at: at[4], p_reading_ends_at: at[5],
    });
  }

  /** A club of n members (first is admin) with one nomination each and voting open. */
  async votingClub(n: number, books = n) {
    const people: string[] = [];
    for (let i = 0; i < n; i++) people.push(await this.user(`Member ${i}`));
    const club = await this.club(people[0]!);
    for (const p of people.slice(1)) await this.join(people[0]!, club, p);
    const cycle = await this.cycle(people[0]!, club);
    const nominations: string[] = [];
    for (let i = 0; i < books; i++) {
      const book = await this.importBook(`Book ${i}`);
      nominations.push(await this.rpc(people[i]!, "nominate", { p_cycle_id: cycle, p_book_id: book }));
    }
    await this.rpc(people[0]!, "open_voting_now", { p_cycle_id: cycle });
    return { people, club, cycle, nominations };
  }

  cycleRow = async (id: string) => (await this.sql("select * from reading_cycles where id = $1", [id]))[0]!;
}
