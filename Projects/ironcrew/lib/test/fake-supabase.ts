export type QueryError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

export type QueryResult = {
  data?: unknown;
  error?: QueryError | null;
  count?: number | null;
};

export type FakeUser = { id: string; email?: string };

export type FakeCall = {
  op: "select" | "insert" | "update" | "delete" | "rpc" | "signOut";
  name?: string;
  payload?: unknown;
  filters: { method: string; args: unknown[] }[];
};

type Step = QueryResult;

/** Chainable stand-in for the Supabase client. Each terminal query consumes the next queued result. */
export function createFake(options: { user?: FakeUser | null; results?: Step[] } = {}) {
  const results = [...(options.results ?? [])];
  const calls: FakeCall[] = [];
  let signedOut = false;

  function take(call: FakeCall): QueryResult {
    calls.push(call);
    const next = results.shift();
    if (!next) {
      throw new Error(`No queued Supabase result for ${call.op} ${call.name ?? ""}`);
    }
    return { data: next.data ?? null, error: next.error ?? null, count: next.count ?? null };
  }

  class Query implements PromiseLike<QueryResult> {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: unknown;
    private filters: { method: string; args: unknown[] }[] = [];
    private finished = false;

    constructor(private table: string) {}

    select() {
      return this;
    }

    insert(payload: unknown) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: unknown) {
      this.op = "update";
      this.payload = payload;
      return this;
    }

    delete() {
      this.op = "delete";
      return this;
    }

    eq(...args: unknown[]) {
      return this.filter("eq", args);
    }

    in(...args: unknown[]) {
      return this.filter("in", args);
    }

    gte(...args: unknown[]) {
      return this.filter("gte", args);
    }

    lte(...args: unknown[]) {
      return this.filter("lte", args);
    }

    order(...args: unknown[]) {
      return this.filter("order", args);
    }

    range(...args: unknown[]) {
      return this.filter("range", args);
    }

    maybeSingle() {
      return Promise.resolve(this.finish());
    }

    single() {
      return Promise.resolve(this.finish());
    }

    then<T1, T2>(
      onfulfilled?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ) {
      return Promise.resolve(this.finish()).then(onfulfilled, onrejected);
    }

    private filter(method: string, args: unknown[]) {
      this.filters.push({ method, args });
      return this;
    }

    private finish() {
      if (this.finished) {
        throw new Error(`Supabase query on ${this.table} was consumed twice`);
      }
      this.finished = true;
      return take({ op: this.op, name: this.table, payload: this.payload, filters: this.filters });
    }
  }

  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.user ?? null }, error: null }),
      signOut: async () => {
        signedOut = true;
        calls.push({ op: "signOut", filters: [] });
        return { error: null };
      },
    },
    from(table: string) {
      return new Query(table);
    },
    rpc(name: string, args: unknown) {
      return Promise.resolve(take({ op: "rpc", name, payload: args, filters: [] }));
    },
  };

  return {
    client,
    calls,
    get signedOut() {
      return signedOut;
    },
  };
}

export type Fake = ReturnType<typeof createFake>;
