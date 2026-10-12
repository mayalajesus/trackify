# Architecture

## Runtime overview

The application is a React 19 and Vite single-page app with TanStack Router,
TanStack Query and HeroUI. Vercel serves the static application and the
serverless `/api/data` endpoint. Both local/QA Neon and production Supabase use
the same provider-neutral PostgreSQL schema.

```text
Route or component
  -> store / focused domain module
  -> AccountDataSource
  -> POST /api/data
  -> authenticated operation
  -> PostgreSQL
```

The browser never receives a database connection string or an administrative
Supabase key. It sends the current Auth bearer token to `/api/data`, where
`server/authentication.mjs` validates the identity before any operation obtains
workspace access.

## Frontend boundaries

- `src/routes`: file-based pages and route search state.
- `src/components`: reusable presentation and interaction components.
- `src/lib/domain.ts`: provider-independent product entities.
- `src/lib/account-types.ts`: persisted account, membership and preference
  contracts.
- `src/lib/store.tsx`: client-side orchestration, optimistic state and timer
  coordination.
- `src/lib/store`: snapshot validation/migrations, reference sharing and domain
  action factories. Factories receive explicit state, setters and refs; the
  provider retains state ownership, effect ordering and synchronization.
- `src/components/tracker-entries`: grouping, stable row keys, time editors,
  group summaries and entry rows. The existing table entry point owns selection,
  expansion and deletion confirmation.
- `src/lib/reports`: URL/filter conversion, the reports controller, overview
  presentation models and export preparation. Pure analytics remain in the
  existing reporting modules.
- `src/components/reports`: overview charts and report navigation controls.
- `src/lib/account-data-source.ts`: persistence interface.
- `src/lib/api-data-source.ts`: authenticated HTTP implementation.
- `src/lib/report-groups.ts`, `report-analytics.ts` and `report-query.ts`: pure
  reporting logic.
- `src/lib/mock-data.ts`: local seed material only, never a persistence source.

Routes are code-split by TanStack Router. HeroUI components are imported from
their package subpaths so shared dependencies remain independently chunkable.
The root route is the sole owner of the global stylesheet.
`src/styles.css` imports reviewed CSS sections in their original cascade order.
Keep authentication, shared controls, navigation, theme and page rules in that
order; moving a rule between sections can change its precedence. The UI audit
uses an explicit allowlist of these stylesheets.

## Server boundaries

- `api/data.mjs`: Vercel entry point.
- `server/data-api.mjs`: HTTP validation, authentication, operation dispatch,
  transaction orchestration and the backwards-compatible public exports.
- `server/data`: connection caches, shared validators/access guards and data
  operations grouped by account, workspace, entries, invitations and preferences.
  `sync-account.mjs` keeps the existing account-wide synchronization unit intact.
- `server/authentication.mjs`: Neon/Supabase token verification.
- `server/data-api-error.mjs`: expected HTTP errors.
- `server/auth-profile.mjs`: normalized OAuth identity and trusted avatar data.

`DATABASE_PROVIDER` selects the adapter behavior. Neon Auth sessions are
verified against Neon Auth and Supabase tokens against Supabase Auth. All SQL
uses the same tables created from `db/migrations`; Supabase-specific RLS, Auth
synchronization and Storage policies are added by `db/providers/supabase`.

Internal modules must not import the `store.tsx` or `data-api.mjs` facade at
runtime. Keep shared dependencies below the facades to prevent circular imports.
Public data-source interfaces, account versioning, API response shapes and SQL
transaction boundaries are unchanged by the modularization.

## Data ownership

A user can belong to multiple workspaces. Membership owns role, status,
currency and hourly rate, so the same person may have a different rate in each
workspace. Time entries, clients, projects, settings and integrations are
workspace-scoped. Billability belongs to a project/entry and is not a workspace
setting.

The persisted account contract is version 13. Compatibility changes must add a
migration and update the snapshot migration tests. Trello remains a deferred
integration boundary and must not be coupled to core tracking or reports.

## Security model

Authentication proves identity; each data operation separately verifies active
workspace membership and role. The API validates request sizes, identifiers,
dates, money values and media formats. Supabase service-role credentials are
server-only. Vercel security headers deny framing, restrict resource origins and
prevent MIME sniffing; database RLS is an additional Supabase boundary.
