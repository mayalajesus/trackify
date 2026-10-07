# Project identity

Use **Trackify** in product copy, page metadata, emails, reports and documentation.
Use `trackify` for the package, repository, export filenames and new storage keys.

## Production

- Repository: `mayalajesus/trackify`.
- Production branch: `main`; ongoing changes: `ajustes-gerais`.
- Public URL: `https://watchtag.vercel.app`.
- Vercel project: `watchtag`. Keep its current name and domains until a domain change is requested.
- Mailjet sender display name: `Trackify` (`MAILJET_FROM_NAME`).
- Supabase SMTP sender display name: `Trackify`. Confirmation and recovery templates are versioned in `emails/` and must also be applied to Supabase Auth.

## Compatibility and cleanup

`src/lib/brand-storage-migration.ts` moves browser preferences and cooldowns from the previous prefix to the new one without touching provider sessions. The old prefix is retained only to read existing data.

Applied database migrations are immutable because the migration runner verifies their checksums. Historical identifiers inside those files must stay intact.

Generated builds (`dist/`), test results (`test-results/`) and router temporary files (`.tanstack/tmp/`) are disposable and ignored by Git. Keep application source, migrations, QA fixtures, dependency lockfiles and operational scripts under version control.
