# Deployment and operations

## Environment model

Use separate credentials and databases for local, Preview/QA and Production.
Do not copy production data into QA.

| Variable                        | Preview/QA         | Production                          | Visibility     |
| ------------------------------- | ------------------ | ----------------------------------- | -------------- |
| `VITE_APP_ENV`                  | `qa`               | `production`                        | Browser        |
| `VITE_APP_URL`                  | Preview URL        | Canonical app URL                   | Browser        |
| `APP_URL`                       | Preview URL        | Canonical app URL                   | Server         |
| `VITE_AUTH_PROVIDER`            | `neon`             | `supabase`                          | Browser        |
| `DATABASE_PROVIDER`             | `neon`             | `supabase`                          | Server         |
| `VITE_NEON_AUTH_URL`            | Required           | Empty                               | Browser/server |
| `VITE_SUPABASE_URL`             | Empty              | Required                            | Browser        |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Empty              | Required                            | Browser        |
| `DATABASE_URL`                  | QA Neon connection | Production PostgreSQL connection    | Server secret  |
| `SUPABASE_URL`                  | Empty              | Required                            | Server secret  |
| `SUPABASE_ANON_KEY`             | Empty              | Required                            | Server secret  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Empty              | Required for managed avatar Storage | Server secret  |

`SUPABASE_DATABASE_URL` may replace `DATABASE_URL` for production, but keeping a
single `DATABASE_URL` convention reduces configuration drift. Never prefix a
database URL, service-role key or access token with `VITE_`.

## Production release

Apply `20261013120000_default_portuguese.sql` with the Portuguese-default release.
It changes only the default for newly inserted preferences, including profiles
created by Supabase Auth triggers. Existing language choices are preserved.

Client currency selection requires `20260929140000_client_currency.sql` before
deploying the API. Legacy clients retain member currency defaults until a currency
is selected. New time entries snapshot the selected client currency; existing
entries retain their stored currency unless reassigned to a different project.

Client billing flags require `20260929130000_client_billable.sql` before deploying
the API. Existing clients default to non-billable; older snapshots without the
field preserve the stored value when synchronized.

The explicit workspace creation release includes
`20260918120000_remove_personal_workspace_bootstrap.sql` and
`20260929120000_workspace_logo_data.sql`. The latter stores validated workspace
logos in PostgreSQL for Neon; Supabase continues using Storage. Both migrations
must accompany the API and frontend release. Coordinate the cutover: the old API
calls `ensure_personal_workspace`, which the first migration removes, and the
new Neon logo writes require the second migration. Do not serve the old API
against the schema after removing that function. Workspace creation now returns
the committed account snapshot consumed by the new frontend.

1. Install and verify the exact locked dependencies with `npm ci`.
2. Run `npm run check`.
3. Preview the production migration plan:

   ```bash
   npm run db:migrate -- --provider supabase --dry-run
   ```

4. Apply migrations to the intended Supabase database:

   ```bash
   DATABASE_PROVIDER=supabase DATABASE_URL="postgresql://..." npm run db:migrate
   ```

5. Deploy the Supabase invitation functions described in `supabase/README.md`.
6. Configure Supabase Auth site/redirect URLs, Google OAuth and the `avatars`
   Storage policies created by the provider migrations.
7. Configure the Production variables in Vercel and deploy `main`.
8. Verify login, account creation, avatar add/remove, workspace creation,
   tracking, reports and invitation acceptance against production.

Database migrations are forward-only. If an application deployment must be
rolled back, restore the previous Vercel deployment and add a new corrective
migration when schema repair is required; never rewrite an applied migration.

## Google OAuth URLs

Supabase must allow the exact production `/auth/callback` URL and every trusted
Preview callback used for QA. The Google Cloud OAuth client must use the
callback URL supplied by Supabase. Keep localhost callbacks limited to the
development client/configuration.

## CI secrets

The browser job in `.github/workflows/quality.yml` requires:

- `QA_NEON_AUTH_URL`
- `QA_DATABASE_URL`
- `QA_OWNER_EMAIL` and `QA_OWNER_PASSWORD`
- `QA_ADMIN_EMAIL` and `QA_ADMIN_PASSWORD`
- `QA_MEMBER_EMAIL` and `QA_MEMBER_PASSWORD`

Use synthetic `example.test` accounts from the guarded QA seed. Pull requests
from forks do not receive these secrets and therefore do not run the browser
job.

## Operational safeguards

- Keep Vercel deployment protection enabled for non-public Preview URLs.
- Configure Vercel Firewall/rate limiting for `/api/data`; application
  authorization remains mandatory even when edge protection is enabled.
- Rotate a secret immediately if it appears in a build log, client bundle or
  committed file.
- Monitor Vercel function errors, Supabase Auth failures and database connection
  saturation after each release.
- Review Content Security Policy changes in `vercel.json` whenever a new
  external service is added.
