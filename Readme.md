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

## App hosting

Set these on Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` — the customer domain, with no trailing slash
- `SENTRY_DSN` — optional; errors are sent only when this is set

In Supabase Auth, set the site URL and the email confirmation and password-reset redirects to that same customer domain.

Page metadata uses `NEXT_PUBLIC_SITE_URL` when it is set. On Vercel production it otherwise uses `VERCEL_PROJECT_PRODUCTION_URL`, then the deployment `VERCEL_URL`.
