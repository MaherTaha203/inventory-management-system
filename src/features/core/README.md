# Core Foundation

The core layer contains business-neutral contracts and deterministic utilities
shared by stocktakes, receipts, catalog, reports and local drafts.

## Modules

- `src/types/domain.ts`: persistence-independent domain contracts.
- `src/lib/validation`: quantity, date and conservative name validation.
- `src/lib/utils`: date formatting, pagination and typed operation results.
- `src/lib/local-drafts`: per-browser IndexedDB draft repository.
- `src/features/catalog`: catalog name matching, suggestions and session-only management UI.

## Local draft guarantees

- One draft per operation type on each browser/device.
- Stocktake and receipt drafts are stored independently.
- Creating a new operation never overwrites an existing draft.
- Resume is a read; updates are explicit saves after each input change.
- Draft deletion is explicit. Central-save cleanup must happen only after the
  central service confirms success.
- Local drafts are not central records and must not appear in archive or reports.
- Browser storage can be lost when the user clears site data or changes device.

## Rules

- Keep quantities as decimal text at the input boundary; do not round user input.
- Do not use floating-point arithmetic to calculate balances: this application
  does not maintain balances.
- Name normalization is only a comparison key. Preserve the approved display
  name and never merge records automatically.
- Date helpers use local calendar components to avoid UTC date shifts.
- Core modules must not import React, Next.js server APIs or Supabase clients.

## Verification

Run `npm run lint`, `npm run typecheck` and `npm test`.


## Catalog implementation boundary

- Item, supplier and unit lists currently live in React memory for the active browser session only.
- They are intentionally not persisted in IndexedDB and are not shared across devices.
- Literal substring search is used for suggestions; archived entries are hidden from suggestions but remain in the catalog state.
- Name resolution uses the conservative normalization rules and returns all matches when ambiguous. It never merges entries automatically.
- The Supabase repository, schema, migrations and synchronization are intentionally not implemented yet. Connect Supabase before treating catalog entries as durable or shared data.
