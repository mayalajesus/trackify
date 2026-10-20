# Contributing

## Local setup

Use Node 22.12 or newer within the Node 22-24 range declared in `package.json`
and npm 11.6.2. Then install the locked dependencies:

```bash
npm ci
```

Copy `.env.example` to `.env`, keep secrets out of every `VITE_*` variable and
start the local server with:

```bash
npm run dev
```

Local development may use Neon by setting `VITE_AUTH_PROVIDER=neon`,
`DATABASE_PROVIDER=neon`, `VITE_NEON_AUTH_URL` and `DATABASE_URL`.

## Change boundaries

- Put shared product entities in `src/lib/domain.ts` and persisted account
  contracts in `src/lib/account-types.ts`.
- Keep routes focused on page composition; reusable UI belongs in
  `src/components` and pure product logic belongs in `src/lib`.
- Browser persistence must go through `src/lib/account-data-source.ts` and
  `src/lib/api-data-source.ts`. Do not call provider databases directly from a
  route.
- Provider authentication belongs in `server/authentication.mjs`; data
  operations remain behind `server/data-api.mjs`.
- Do not import seed records from `src/lib/mock-data.ts` into product domain
  modules.

## Required checks

Run the complete local gate before opening or merging a pull request:

```bash
npm run check
```

When the change affects an authenticated flow, also run:

```bash
npm run test:smoke
npm run test:a11y
npm run test:integration
```

The browser suites need the QA Neon credentials listed in
`docs/deployment.md`. The GitHub Actions workflow runs the same gates on pull
requests and pushes to `main`.

The integration suite requires `DATABASE_ENV=qa` and creates isolated fixtures.
Most tests roll back all changes. The concurrency test needs committed, synthetic
fixtures visible to two PostgreSQL connections; it removes only its generated
workspace/profile IDs in `finally` and verifies cleanup. New SQL fixtures also
require the Neon provider and a Neon connection URL, refusing production settings.
Coverage includes stale snapshots, overlapping SERIALIZABLE transactions,
conflicting edits/deletions, SQL authorization, shared tasks, extension timers
and workspace deletion. Server unit checks also run as part of `npm run test:domain`.
Timer recovery and edited UI flows use real provider effects with an isolated
API fixture; they never send invitation emails or persist product data.

## Database changes

Add immutable, ordered SQL files under `db/migrations`. Provider-specific
Supabase policies and Auth integration belong under `db/providers/supabase`.
Never edit an applied migration. Preview the plan before applying it:

```bash
npm run db:migrate -- --provider supabase --dry-run
```

QA seeds belong only in `db/seeds/qa` and require `DATABASE_ENV=qa`.

## Git hygiene

Use a short branch name that describes the product change, and write commits in
the imperative mood, for example `fix/profile-avatar-flow`. Keep generated
build output, local environment files, screenshots and credentials out of the
repository.
