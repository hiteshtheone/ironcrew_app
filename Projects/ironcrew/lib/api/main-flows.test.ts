import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { before, mock, test } from "node:test";

import { createFake, type Fake } from "@/lib/test/fake-supabase";

const USER = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const PROGRAM = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const WEEK = "55555555-5555-4555-8555-555555555555";
const ASSIGNMENT = "66666666-6666-4666-8666-666666666666";
const BLOCK = "77777777-7777-4777-8777-777777777777";
const WORKOUT = "88888888-8888-4888-8888-888888888888";

const storage = new AsyncLocalStorage<Fake>();

mock.module("@/lib/supabase/server", {
  namedExports: {
    createClient: async () => {
      const fake = storage.getStore();
      if (!fake) throw new Error("Supabase fake is not active");
      return fake.client;
    },
  },
});

type ClientsRoute = typeof import("@/app/api/clients/route");
type ClientRoute = typeof import("@/app/api/clients/[id]/route");
type PlanRoute = typeof import("@/app/api/clients/[id]/plan/route");
type StartRoute = typeof import("@/app/api/me/programs/[id]/start/route");
type DeactivateOwn = typeof import("@/app/api/me/programs/[id]/deactivate/route");
type DeactivateClient = typeof import("@/app/api/clients/[id]/programs/[programId]/deactivate/route");
type StartWorkout = typeof import("@/app/api/me/workouts/start/route");
type LogRoute = typeof import("@/app/api/workout-assignments/[id]/log/route");
type AssignmentRoute = typeof import("@/app/api/workout-assignments/[id]/route");
type ProgressRoute = typeof import("@/app/api/me/progress/route");
type MeRoute = typeof import("@/app/api/me/route");
type ExportRoute = typeof import("@/app/api/me/export/route");
type AccountRoute = typeof import("@/app/api/me/account/route");
type ExercisesRoute = typeof import("@/app/api/exercises/route");
type PublishRoute = typeof import("@/app/api/programs/weeks/[weekId]/publish/route");

let clientsRoute: ClientsRoute;
let clientRoute: ClientRoute;
let planRoute: PlanRoute;
let startRoute: StartRoute;
let deactivateOwn: DeactivateOwn;
let deactivateClient: DeactivateClient;
let startWorkout: StartWorkout;
let logRoute: LogRoute;
let assignmentRoute: AssignmentRoute;
let progressRoute: ProgressRoute;
let meRoute: MeRoute;
let exportRoute: ExportRoute;
let accountRoute: AccountRoute;
let exercisesRoute: ExercisesRoute;
let publishRoute: PublishRoute;
let authorizeLiveWorkoutEdit: typeof import("@/lib/api/live-workout-edit").authorizeLiveWorkoutEdit;

before(async () => {
  ({ authorizeLiveWorkoutEdit } = await import("@/lib/api/live-workout-edit"));
  clientsRoute = await import("@/app/api/clients/route");
  clientRoute = await import("@/app/api/clients/[id]/route");
  planRoute = await import("@/app/api/clients/[id]/plan/route");
  startRoute = await import("@/app/api/me/programs/[id]/start/route");
  deactivateOwn = await import("@/app/api/me/programs/[id]/deactivate/route");
  deactivateClient = await import("@/app/api/clients/[id]/programs/[programId]/deactivate/route");
  startWorkout = await import("@/app/api/me/workouts/start/route");
  logRoute = await import("@/app/api/workout-assignments/[id]/log/route");
  assignmentRoute = await import("@/app/api/workout-assignments/[id]/route");
  progressRoute = await import("@/app/api/me/progress/route");
  meRoute = await import("@/app/api/me/route");
  exportRoute = await import("@/app/api/me/export/route");
  accountRoute = await import("@/app/api/me/account/route");
  exercisesRoute = await import("@/app/api/exercises/route");
  publishRoute = await import("@/app/api/programs/weeks/[weekId]/publish/route");
});

const user = { id: USER, email: "ada@example.com" };
const clientAccount = [
  { data: { role: "client", timezone: "UTC" } },
  { data: { id: CLIENT } },
];

function use<T>(fake: Fake, run: () => Promise<T>) {
  return storage.run(fake, run);
}

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("adding a client rejects bad input and a signed-out caller", async () => {
  const invalid = await clientsRoute.POST(new Request("http://localhost/api/clients", { method: "POST", body: "{" }));
  assert.equal(invalid.status, 400);

  const signedOut = await use(createFake({ user: null }), () =>
    clientsRoute.POST(post("http://localhost/api/clients", { first_name: "Ada" })),
  );
  assert.equal(signedOut.status, 401);
});

test("adding a client links the trainer and rolls back when that link fails", async () => {
  const created = { id: CLIENT, first_name: "Ada" };
  const ok = createFake({ user, results: [{ data: created }, { error: null }] });
  const response = await use(ok, () => clientsRoute.POST(post("http://localhost/api/clients", { first_name: "Ada" })));
  assert.equal(response.status, 201);
  assert.equal(ok.calls[1]?.op, "insert");
  assert.equal(ok.calls[1]?.name, "trainer_clients");
  assert.deepEqual(ok.calls[1]?.payload, {
    trainer_id: USER,
    client_id: CLIENT,
    is_primary: true,
    status: "active",
  });

  const duplicate = createFake({ user, results: [{ error: { code: "23505", message: "duplicate" } }] });
  const duplicateStatus = await use(duplicate, () =>
    clientsRoute.POST(post("http://localhost/api/clients", { first_name: "Ada", email: "ada@example.com" })),
  );
  assert.equal(duplicateStatus.status, 409);
  assert.equal(duplicate.calls.some((call) => call.op === "delete"), false);

  const denied = createFake({ user, results: [{ error: { code: "42501", message: "row-level security" } }] });
  assert.equal((await use(denied, () => clientsRoute.POST(post("http://localhost/api/clients", { first_name: "Ada" })))).status, 403);

  const rollback = createFake({
    user,
    results: [{ data: created }, { error: { message: "link failed" } }, { error: null }],
  });
  assert.equal((await use(rollback, () => clientsRoute.POST(post("http://localhost/api/clients", { first_name: "Ada" })))).status, 500);
  assert.equal(rollback.calls.at(-1)?.op, "delete");
  assert.equal(rollback.calls.at(-1)?.name, "clients");
});

test("deleting a client reports leftover records as a conflict", async () => {
  const response = await use(createFake({ user, results: [{ error: { code: "23503", message: "foreign key" } }] }), () =>
    clientRoute.DELETE(new Request("http://localhost/api/clients/" + CLIENT), params(CLIENT)),
  );
  assert.equal(response.status, 409);
});

test("starting a client plan returns the conflict payload when a program is already active", async () => {
  const body = { title: "Get strong", goal_type: "strength", program_id: PROGRAM, starts_on: "2026-11-16" };
  const ok = createFake({ user, results: [{ data: { program_assignment_id: ASSIGNMENT } }] });
  const created = await use(ok, () =>
    planRoute.POST(post("http://localhost/api/clients/" + CLIENT + "/plan", body), params(CLIENT)),
  );
  assert.equal(created.status, 201);
  assert.equal(ok.calls[0]?.name, "start_client_plan");

  const conflictFake = createFake({
    user,
    results: [
      { error: { message: "ACTIVE_PROGRAM_EXISTS" } },
      { data: [{ program_id: PROGRAM, assigned_by_client_id: null, programs: { name: "Build" } }] },
    ],
  });
  const conflict = await use(conflictFake, () =>
    planRoute.POST(post("http://localhost/api/clients/" + CLIENT + "/plan", body), params(CLIENT)),
  );
  assert.equal(conflict.status, 409);
  const payload = await conflict.json();
  assert.equal(payload.code, "active_program_exists");
  assert.equal(payload.activePrograms[0].name, "Build");
});

test("a client can start their own program and ask for the first week to be published", async () => {
  const withoutWeek = createFake({ user, results: [...clientAccount, { data: { program_assignment_id: ASSIGNMENT } }] });
  const plain = await use(withoutWeek, () =>
    startRoute.POST(post("http://localhost/api/me/programs/" + PROGRAM + "/start", { starts_on: "2026-11-16" }), params(PROGRAM)),
  );
  assert.equal(plain.status, 201);
  assert.equal("p_publish_first_week" in (withoutWeek.calls.at(-1)?.payload as object), false);

  const withWeek = createFake({ user, results: [...clientAccount, { data: { program_assignment_id: ASSIGNMENT } }] });
  await use(withWeek, () =>
    startRoute.POST(
      post("http://localhost/api/me/programs/" + PROGRAM + "/start", {
        starts_on: "2026-11-16",
        publish_first_week: true,
      }),
      params(PROGRAM),
    ),
  );
  assert.equal((withWeek.calls.at(-1)?.payload as { p_publish_first_week?: boolean }).p_publish_first_week, true);
});

test("deactivating a program calls the shared database function", async () => {
  const own = createFake({ user, results: [...clientAccount, { data: { cancelled_workouts: 1 } }] });
  assert.equal((await use(own, () => deactivateOwn.POST(new Request("http://localhost"), params(PROGRAM)))).status, 200);
  assert.deepEqual(own.calls.at(-1)?.payload, { p_program_id: PROGRAM, p_client_id: CLIENT });

  const trainer = createFake({ user, results: [{ data: { cancelled_workouts: 2 } }] });
  const response = await use(trainer, () =>
    deactivateClient.POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: CLIENT, programId: PROGRAM }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(trainer.calls[0]?.payload, { p_program_id: PROGRAM, p_client_id: CLIENT });
});

test("starting a live workout creates the assignment and removes the workout if that fails", async () => {
  const invalid = await startWorkout.POST(post("http://localhost/api/me/workouts/start", { name: " " }));
  assert.equal(invalid.status, 400);

  const ok = createFake({
    user,
    results: [...clientAccount, { data: { id: WORKOUT, name: "Push" } }, { data: { id: ASSIGNMENT, status: "in_progress" } }],
  });
  const created = await use(ok, () =>
    startWorkout.POST(post("http://localhost/api/me/workouts/start", { name: "Push", scheduled_for: "2026-11-19" })),
  );
  assert.equal(created.status, 201);
  assert.equal(ok.calls[3]?.name, "workout_assignments");
  assert.equal((ok.calls[3]?.payload as { status: string }).status, "in_progress");

  const failed = createFake({
    user,
    results: [...clientAccount, { data: { id: WORKOUT, name: "Push" } }, { error: { message: "no" } }, { error: null }],
  });
  assert.equal(
    (
      await use(failed, () =>
        startWorkout.POST(post("http://localhost/api/me/workouts/start", { name: "Push", scheduled_for: "2026-11-19" })),
      )
    ).status,
    500,
  );
  assert.equal(failed.calls.at(-1)?.op, "delete");
  assert.equal(failed.calls.at(-1)?.name, "workouts");
});

test("a live workout on a program or owned by someone else cannot be edited", async () => {
  const missing = createFake({ results: [{ data: null }] });
  const notFound = await authorizeLiveWorkoutEdit(missing.client as never, CLIENT, ASSIGNMENT);
  assert.equal("error" in notFound && notFound.error.status, 404);

  const ownedByOther = createFake({
    results: [
      {
        data: {
          client_id: CLIENT,
          assigned_by_client_id: CLIENT,
          workout_id: WORKOUT,
          workouts: { owner_client_id: OTHER },
        },
      },
      { count: 0 },
    ],
  });
  const denied = await authorizeLiveWorkoutEdit(ownedByOther.client as never, CLIENT, ASSIGNMENT);
  assert.equal("error" in denied && denied.error.status, 403);

  const onProgram = createFake({
    results: [
      {
        data: {
          client_id: CLIENT,
          assigned_by_client_id: CLIENT,
          workout_id: WORKOUT,
          workouts: { owner_client_id: CLIENT },
        },
      },
      { count: 1 },
    ],
  });
  const blocked = await authorizeLiveWorkoutEdit(onProgram.client as never, CLIENT, ASSIGNMENT);
  assert.equal("error" in blocked && blocked.error.status, 409);
});

test("a workout log rejects more than 20 sets", async () => {
  const sets = Array.from({ length: 21 }, (_, index) => ({ set_number: index + 1, repetitions: 5 }));
  const response = await use(
    createFake({
      user,
      results: [
        {
          data: {
            id: ASSIGNMENT,
            client_id: CLIENT,
            workout_id: WORKOUT,
            status: "scheduled",
            workouts: {
              workout_blocks: [
                { id: BLOCK, exercise_id: null, block_type: "exercise", exercises: { tracking_type: "reps" } },
              ],
            },
          },
        },
      ],
    }),
    () =>
      logRoute.PUT(
        new Request("http://localhost/api/workout-assignments/" + ASSIGNMENT + "/log", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: "Hard", blocks: [{ block_id: BLOCK, sets }] }),
        }),
        params(ASSIGNMENT),
      ),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /20 sets/);
});

test("a client cannot cancel a workout from the status route", async () => {
  const response = await assignmentRoute.PATCH(
    new Request("http://localhost/api/workout-assignments/" + ASSIGNMENT, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    }),
    params(ASSIGNMENT),
  );
  assert.equal(response.status, 400);
});

test("progress requires the requested week to be a Monday", async () => {
  const response = await use(createFake({ user, results: clientAccount }), () =>
    progressRoute.GET(new Request("http://localhost/api/me/progress?week=2026-11-17")),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Monday/);
});

test("profile reads and updates the signed-in trainer", async () => {
  const loaded = await use(
    createFake({
      user,
      results: [
        { data: { role: "trainer", full_name: "Ada Lovelace", timezone: "UTC" } },
        { data: { first_name: "Ada", last_name: "Lovelace", business_name: "Iron", bio: null } },
      ],
    }),
    () => meRoute.GET(),
  );
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).business_name, "Iron");

  const saved = createFake({
    user,
    results: [
      {
        data: {
          role: "trainer",
          full_name: "Ada Lovelace",
          timezone: "UTC",
          terms_accepted_at: "2026-11-01T00:00:00Z",
          onboarding_completed_at: "2026-11-01T00:00:00Z",
        },
      },
      { data: { first_name: "Ada", last_name: "Lovelace", business_name: "Iron Coaching", bio: null } },
      { error: null },
    ],
  });
  const response = await use(saved, () =>
    meRoute.PATCH(
    post("http://localhost/api/me", {
      first_name: "Ada",
      last_name: "Lovelace",
      timezone: "Asia/Kolkata",
      business_name: "Iron Coaching",
      bio: null,
    }),
  ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).timezone, "Asia/Kolkata");
  assert.equal(saved.calls.some((call) => call.op === "update" && call.name === "profiles"), true);
});

test("account export is a download and delete signs the caller out", async () => {
  const exported = await use(createFake({ user, results: [{ data: { profile: { role: "trainer" } } }] }), () =>
    exportRoute.GET(),
  );
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-disposition") ?? "", /ironwill-fitness-data.json/);

  const removed = createFake({ user, results: [{ data: null }] });
  const deleted = await use(removed, () => accountRoute.DELETE());
  assert.equal(deleted.status, 204);
  assert.equal(removed.signedOut, true);

  const blocked = createFake({
    user,
    results: [{ error: { message: "ACCOUNT_HAS_CLIENTS Remove your clients" } }],
  });
  assert.equal((await use(blocked, () => accountRoute.DELETE())).status, 409);
  assert.equal(blocked.signedOut, false);
});

test("exercise creation rejects a repeated muscle and publishing a week calls the database", async () => {
  const rejected = await exercisesRoute.POST(
    post("http://localhost/api/exercises", {
      name: "Row",
      tracking_type: "weight_reps",
      primary_muscle_group: "lats",
      secondary_muscle_groups: ["lats"],
    }),
  );
  assert.equal(rejected.status, 400);

  const published = createFake({ user, results: [{ data: { inserted: 3 } }] });
  const response = await use(published, () =>
    publishRoute.POST(
    post("http://localhost/api/programs/weeks/" + WEEK + "/publish", { week_start: "2026-11-16" }),
    { params: Promise.resolve({ weekId: WEEK }) },
  ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(published.calls[0]?.payload, {
    p_program_week_id: WEEK,
    p_week_start: "2026-11-16",
    p_client_ids: null,
  });
});
