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
- `src/lib/store/use-timer-persistence.ts`: timer hydration, save ordering and
  remote polling. A failed read does not advance the local revision baseline;
  retrying preserves a timer started locally. Polling only adopts remote state
  after the local timer has been acknowledged. Conflicting local/server timers
  remain intact and expose recovery rather than replacing either timer.
- `src/lib/store/timer-persistence.ts`: pure timer recovery and acknowledgement rules.
- `src/components/tracker-entries/use-entry-editor.ts`: inline drafts, validation,
  keyboard handling and overlap confirmation; the row component renders cells.
- `src/components/team/use-team-invitations.ts` and `invitation-dialog.tsx`:
  invitation state/actions and dialog presentation, separate from the team table.
- `src/lib/store/account-persistence.ts`: serialized saves, baseline ownership
  and reconciliation of edits made while a request is pending.
- `src/lib/store/use-account-persistence.ts`: save recovery, draft download and
  browser close protection. Save failures keep the application and draft open;
  they do not trigger account rehydration.
- `shared/account-merge.mjs`: pure three-way merge used by server synchronization
  and browser reconciliation. Collections are matched by stable record IDs.
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

## Concurrent account saves

`syncAccount` now requires both `account` (the edited snapshot) and `baseAccount`
(the last acknowledged server snapshot), and returns the canonical saved
account. The persisted account format remains version 13; no database migration
is required by this protocol change.

Loaded accounts advertise `syncProtocol: 1`. The browser checks this capability
before sending a write, so a new client cannot fall back to unsafe full-snapshot
saves against an older server. Unchanged records and images are omitted from
both request snapshots to keep small edits independent of history size.

The server locks workspace rows in stable ID order inside a SERIALIZABLE
transaction, loads current data and applies only changes relative to the
baseline. Independent changes merge; a change or deletion that conflicts with
a concurrent change returns HTTP 409 with `sync_conflict`. Serialization
failures also abort the transaction and return that code. No conflicting
snapshot is written. Signed image URL token refreshes and collection ordering
do not count as edits.

The write path skips unchanged workspaces and records. A client or preference
edit therefore does not rewrite the user's full time-entry history or rebuild
unchanged project assignments.

Clients without a baseline receive HTTP 428 with `sync_baseline_required`;
they must update before saving. Deploy frontend and server together. During
recovery, download unsaved changes before reloading an older client or resolving
a conflict. The downloaded JSON is a recovery copy, not an automatic import.

Successful responses are merged with edits made after the request started.
Only the server response advances the baseline. Failed requests retain the
draft and baseline so retrying does not replace local changes with a reload.

Database queries have a 15-second response deadline. Connections that exceed
that deadline are discarded instead of returned to the pool; failed saves keep
their pending draft and baseline for recovery.

Initialized account reads do not update profiles or member preferences. Default
avatars are computed without writing them, and account schema capabilities are
read together without caching across migrations. Synchronization reuses profile
initialization and skips unchanged identity/preferences as well as entry history.
A timed-out transaction closes its connection instead of queuing a rollback on
an unresponsive socket. Public authentication key fetches may retry once within
their existing deadlines; invalid tokens are never retried or accepted.

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
