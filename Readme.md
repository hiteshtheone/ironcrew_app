# Ironwill Fitness database

Do not commit database passwords or connection strings.

The pooler password that used to be in this file is compromised. Rotate it in the Supabase dashboard under Project Settings, Database, before the next migration or catalog seed. The Next.js app uses the publishable key, not this password. `DATABASE_URL` stays in your shell and off the public Vercel project.

## Apply migrations

From `Projects/ironcrew`:

```sh
export DATABASE_URL='postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres'
migrate -verbose -path db/migrations -database "$DATABASE_URL" up
```

Production needs every file in `Projects/ironcrew/db/migrations`, through `000026_account_export_delete.up.sql`. There is no `000026` predecessor named `000016`; that number was never used. golang-migrate records the applied version in `schema_migrations`.

If `claim_invited_client` is missing, invited clients skip the claim and go through normal onboarding.

# Seed shared exercises, workouts, and plans
# Migrations do not insert the system exercise library or starter programs. After migrating, from `Projects/ironcrew`:
# From Projects/ironcrew, after the migrations above. DATABASE_URL must already be set.
# The script seeds exercises, validates every catalog, then applies workouts before plans.
./scripts/seed-catalog.sh

More details about seeding in projects' readme.

Then sign in as a new account and confirm the starter program is offered during onboarding.

## Tests

From `Projects/ironcrew`. `npm test` and pytest need no environment variables. The browser tests need a real Supabase project and skip any case whose variables are missing. Do not commit those values.

### App tests

```sh
npm install
npm test
```

Domain helpers, React components, the exercise catalog, API routes, and the database functions. The database cases apply `db/migrations` in memory. No `DATABASE_URL` and no Supabase keys.

### Browser tests

Install Chromium once. Playwright launches the app at `http://127.0.0.1:3000` and sets `NEXT_PUBLIC_SITE_URL` itself.

```sh
npx playwright install chromium
npm run test:e2e
```

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL, such as `https://<project-ref>.supabase.co`. The app uses it for Auth. Both values must be set or every browser case skips. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key from Project Settings, API. The browser sends it with Auth requests. This is not the service role key. |
| `E2E_TRAINER_EMAIL` | Email of an existing trainer who has already finished onboarding. The test signs in and expects Clients and Programs. |
| `E2E_TRAINER_PASSWORD` | Password for that trainer. |
| `E2E_CLIENT_EMAIL` | Email of an existing client who has already finished onboarding. The test signs in and expects this week's workouts. |
| `E2E_CLIENT_PASSWORD` | Password for that client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret service role key from Project Settings, API. The onboarding case creates a confirmed user, walks through trainer setup, then deletes that user. Keep it out of the browser and out of git. |

Login and a rejected password run when the two `NEXT_PUBLIC_SUPABASE_*` variables are set. The trainer case also needs `E2E_TRAINER_EMAIL` and `E2E_TRAINER_PASSWORD`. The client case also needs `E2E_CLIENT_EMAIL` and `E2E_CLIENT_PASSWORD`. Onboarding also needs `SUPABASE_SERVICE_ROLE_KEY`.

### Shell tests

```sh
cd devshell
python -m pip install -e '.[dev]'
python -m pytest
```

Dev shell, seed, and catalog helpers. They use a temporary SQLite file. Leave `DATABASE_URL` unset. The tests that open a database supply their own SQLite URL.

CI runs `npm test`, `npm run lint`, `next build`, and pytest on every push and pull request. Playwright runs in CI only when the repository secret `E2E_TRAINER_EMAIL` is set. The other secret names are the variables in the table above.

## App hosting

Set these on Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` — the customer domain, with no trailing slash
- `SENTRY_DSN` — optional; errors are sent only when this is set

In Supabase Auth, set the site URL and the email confirmation and password-reset redirects to that same customer domain.

Page metadata uses `NEXT_PUBLIC_SITE_URL` when it is set. On Vercel production it otherwise uses `VERCEL_PROJECT_PRODUCTION_URL`, then the deployment `VERCEL_URL`.
