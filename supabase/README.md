# Database migrations

These migrations define the new **Inventory & Receiving** data model. All 11 migrations are committed on `develop` and have been applied successfully to the connected Supabase project.

## Target project

- Supabase project ref: `mihugpzeawjbvbildyhz`
- Existing legacy objects are intentionally retained.
- The old `public.items`, `public.movements`, and `public.stock_balances` objects are not used by this application.

## Apply order

Apply the SQL files in timestamp order:

1. `20261111000100_core_catalogs.sql`
2. `20261111000200_stocktakes.sql`
3. `20261111000300_receipts.sql`
4. `20261111000400_history_and_trash.sql`
5. `20261111000500_security_and_sessions.sql`
6. `20261111000600_operations_and_validation.sql`
7. `20261111000700_security_routines.sql`
8. `20261111000800_empty_trash.sql`
9. `20261111000900_receipt_number_search.sql`
10. `20261111001000_backend_rls_and_indexes.sql`
11. `20261111001100_preserve_historical_references.sql`
12. `20261111001200_ordered_lines_and_archive_search.sql`
13. `20261111001300_shared_report_preferences.sql`
14. `20261111001400_item_history.sql`

Do not skip a migration or apply them out of order. Review the complete SQL before applying it to the hosted project.

## Security model

- The application server uses the Supabase server-side secret key. It must never be placed in a browser bundle, committed to Git, or exposed in client-visible environment variables.
- The browser uses only the publishable key and does not receive direct table privileges.
- New tables have RLS enabled and no public/anonymous/authenticated policies. Explicit table grants are limited to `service_role`.
- Privileged RPC functions are `SECURITY DEFINER`, use a fixed `pg_catalog` search path and fully qualified application objects, and are executable only by `service_role`.
- PIN hashing and device/session token hashing are performed by the trusted application server. Raw PINs and raw session tokens must not be stored in the database.

## Important application contracts

- Call `public.save_stocktake(operation_id, operation_date, lines)` for both creating and editing a stocktake. Pass `null` for `operation_id` when creating. The line array contains `item_id`, `quantity`, and optional `unit_id`.
- Call `public.save_receipt(operation_id, receipt_date, supplier_id, lines)` for both creating and editing a receipt. Pass `null` for `operation_id` when creating and `null` for an optional supplier.
- Both routines save the operation and all its lines in one database transaction. A failed line rejects the whole save.
- Stocktake numbering is derived from the operation date as `YY/NNN`. A saved operation cannot move to another year. Its number is never recycled after permanent deletion.
- Receipt numbering is a single permanent sequence and is never recycled after permanent deletion.
- Use `public.soft_delete_trash_entry(type, id)` for ordinary deletion, `public.restore_trash_entry(type, id)` for restoration, `public.purge_trash_entry(type, id)` for immediate permanent deletion, and `public.empty_trash()` to empty the trash immediately.
- `public.purge_expired_trash()` removes entries whose 30-day retention has elapsed.

## Required server environment

Configure these values in the trusted server environment (local `.env.local` and the deployment platform):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — server-only; never expose it to browser code.
- `INITIAL_SETUP_SECRET` — random secret of at least 32 characters used only for first-run PIN initialization.
- `CRON_SECRET` — random secret of at least 32 characters used to authorize the daily Vercel cleanup task.

Do not send or commit the secret key or setup secret.

## Scheduled purge

Vercel runs `/api/cron/purge-trash` daily at 02:00 UTC using `CRON_SECRET`. Set the same secret in the Vercel project environment. The endpoint invokes `purge_expired_trash()` and never accepts browser-session authentication as a substitute.


Migration 6 installs a daily `pg_cron` job only if the extension is already enabled and its scheduler function is available. The connected target project was checked and `pg_cron` is currently **not enabled**. Therefore, before production, configure a trusted server-side scheduled task (for example, a Vercel Cron route) to call `public.purge_expired_trash()` daily, or explicitly approve enabling and configuring `pg_cron`. Do not expose this routine to the browser.

## Verification status

Confirmed on the connected Supabase project:

- All 11 new migration records are present.
- All new tables have RLS enabled.
- `anon` and `authenticated` have no table access to the new catalog data; the server role has the required access.
- Privileged save routines are executable by `service_role`, not by `anon` or `authenticated`.
- Transactional SQL checks passed for Arabic name normalization, preservation of `ة/ه` and `ى/ي`, stocktake numbering, receipt numbering, duplicate lines, zero stocktake quantity, decimal rejection, immutable stocktake year, item rename propagation, and trash restore.
- Temporary test rows and counter increments were rolled back; the new catalog and operation tables remain empty.
- The security advisor now reports only the two retained legacy tables (`public.items` and `public.movements`) as RLS-enabled without policies. The new tables have backend-only policies.
- Performance advisor reports unused indexes while the new tables are empty; these indexes are retained intentionally.

Authentication throttling and session lifecycle still need application-level integration tests before production.

## Verification still required

Before production use, verify:

- Arabic normalization, including the agreed preservation of `ة/ه` and `ى/ي`.
- Concurrent stocktake and receipt numbering.
- Rejection of invalid dates and quantities with more than two decimals.
- Rejection of an attempt to change a saved stocktake year.
- Atomic rollback when any operation line is invalid.
- Rename propagation and name-history recording.
- Restore, permanent deletion, foreign-key behavior, and the 30-day purge.
- Direct Data API access is denied to `anon` and `authenticated`.
- Only the server-side service role can call privileged routines.

A successful Git commit is not evidence that the SQL has been applied or that these database tests have passed.
