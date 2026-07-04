# Gam3eya Manager

Phase 1 of Gam3eya Manager is a Supabase-backed React/Vite app for managing savings circles. It keeps GitHub Pages static deployment, but application data now lives in Supabase instead of browser-only `localStorage`.

The previous localStorage app is archived under `legacy/localstorage-app/` for reference and migration support.

## Stack

- React + Vite + TypeScript
- Supabase Auth for Owner/Admin users
- Supabase Postgres with Row-Level Security
- Static GitHub Pages deployment from `dist`

No service-role key is used or expected in frontend code.

## Environment

Copy the example file and fill in your Supabase project values:

```bash
cp .env.example .env.local
```

Required variables:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Run Locally

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run typecheck
npm run build
npm run preview
```

## Supabase Setup

1. Create a Supabase project.
2. Apply migrations from `supabase/migrations/`.
3. Enable Email/Password auth in Supabase Auth.
4. Add the app URL to Supabase Auth redirect URLs:
   - local: `http://localhost:5173`
   - GitHub Pages: `https://mohamedhafez87.github.io/gam3eya-app/`
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` locally and in GitHub Actions repository variables/secrets.

The migration creates:

- `profiles`
- `organizations`
- `organization_members`
- `people`
- `gam3eyas`
- `gam3eya_slots`
- `payments`
- `audit_log`

It also enables RLS on every table and adds core RPCs:

- `create_initial_organization(org_name text)`
- `activate_gam3eya(gam3eya_id uuid)`
- `record_payment(payment_id uuid, method text, paid_at timestamptz, notes text)`
- `mark_payment_unpaid(payment_id uuid)`

## Security Model

Organizations are tenants. A signed-in Supabase user can belong to one or more organizations through `organization_members`.

RLS policies restrict reads and writes by organization membership:

- users read/update only their own profile
- organization data is visible only to organization members
- Owner/Admin can manage people and draft gam3eyas
- slots can be changed only while the gam3eya is draft
- payments are read through table policies and written through RPC functions
- audit log is readable by org members and not directly writable by the client

Phase 1 UI focuses on the Owner role. The schema already includes `owner`, `admin`, and `collector` roles for future phases.

## Product Rules in Phase 1

- People are participant records only; there is no member self-login.
- Monthly amount is per slot/share.
- A person can own multiple slots in the same Gam3eya.
- One receiver exists per month through the slot payout order.
- Activating a draft locks the turn order and generates payment rows.
- No partial payments.
- No receipt uploads.
- Late status is computed in the UI from unpaid payments past the due date.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` installs dependencies, builds the Vite app, and deploys `dist` with official GitHub Pages actions.

The Vite config uses `base: "./"` so generated assets work at:

```text
https://mohamedhafez87.github.io/gam3eya-app/
```

## Legacy Import

Use the Import page to load JSON exported from the old localStorage app. The tool previews:

- association name
- people count
- slot count
- paid payment count

On confirmation it maps:

- legacy association -> `gam3eyas`
- legacy members -> `people`
- legacy `turnOrder` -> `gam3eya_slots`
- legacy paid payments -> Supabase payments after activation

## Backup Export

The Import page includes an organization JSON export. Supabase free tier does not provide automated backups, so export data periodically until a production backup process exists.

## Current Gaps

This is Phase 1 foundation, not the full product roadmap. Not implemented yet:

- invite flow
- team and role management UI
- member self-login
- reminders
- PDF/Excel reports
- receipt uploads
- billing/subscriptions
- automated restore from backup JSON

## Security Note

The old GitHub Pages/localStorage version could not protect private data from a determined user. The new version uses Supabase Auth, Postgres, and RLS, but production deployments still require correct Supabase configuration, redirect URLs, backup procedures, and operational review.
