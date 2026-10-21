<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cloud Agent development

The Next.js app lives in `Projects/ironcrew` (not the git repo root).

| Task | Command |
| --- | --- |
| Install | `bash .cursor/cloud-agent-install.sh` (from repo root) |
| Dev server | `cd Projects/ironcrew && npm run dev` (port 3000) |
| Lint | `cd Projects/ironcrew && npm run lint` |
| Build | `cd Projects/ironcrew && npm run build` |

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as environment secrets; install writes `Projects/ironcrew/.env.local` from them. DB migrations: see root `Readme.md` (`migrate` against `db/migrations`).
