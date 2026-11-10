# Core Foundation

The core layer contains business-neutral contracts and deterministic utilities
shared by stocktakes, receipts, catalog, reports and local drafts.

## Modules

- `src/types/domain.ts`: persistence-independent domain contracts.
- `src/lib/validation/quantity.ts`: quantity text validation.
- `src/lib/validation/name.ts`: conservative name normalization and matching.
- `src/lib/validation/date.ts`: operation date validation and display parsing.
- `src/lib/utils`: date formatting, pagination and typed operation results.

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
