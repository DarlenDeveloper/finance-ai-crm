# Ledger AI — Completion Progress

Tracking the remaining work to finish the invoice upload/review flow, then light mode.

Reference design: `AI_REVIEW_IMPLEMENTATION_PLAN.md`.

## Architecture note

The plan describes Next.js route handlers for extraction/approve/reject. The
implementation moved this logic to **Cloud Functions**:

- `processInvoice` — Firestore `onDocumentUpdated` trigger; runs Gemini extraction
  when an invoice reaches `uploaded`.
- `reviewInvoice` — callable; transactional approve/reject with audit events.

`app/api/.../extract/` was leftover scaffolding from the original plan.

## Verified working before this pass

- Email/password auth + auto workspace bootstrap (`ws_{uid}`).
- Resumable Storage upload → Firestore invoice (`uploading` → `uploaded`).
- Gemini extraction via `processInvoice` with schema-constrained JSON + Zod.
- Live review queue, editable fields, approve/reject via `reviewInvoice`.
- Firestore + Storage security rules.

## The 8 remaining items

| # | Item | Status |
|---|------|--------|
| 1 | Fix functions deploy script to include `reviewInvoice` | ✅ Done |
| 2 | Retry action for failed extractions | ✅ Done (CF `retry` action + UI retry buttons) |
| 3 | Remove dead `extract/` route dir + reconcile plan doc | ✅ Done |
| 4 | Improve document viewer (page nav, zoom, rotate, evidence/confidence, line items, deep-link) | ✅ Done (`DocumentViewer` + `/review/[invoiceId]` + line items) |
| 5 | `expectedUpdatedAt` stale-check + stronger validation in `reviewInvoice` | ✅ Done |
| 6 | SHA-256 duplicate detection + candidate UI | ✅ Done (`duplicates.ts` + upload hash + banner) |
| 7 | Benchmark / observability metrics | ✅ Done (structured logs + `benchmark/` harness doc) |
| 8 | Test setup + unit tests | ✅ Done (`node:test`, 24 passing) |

Unit tests cover: normalization, ISO date/currency, anomaly validation,
changed-field diff, schema parsing, duplicate scoring. Emulator/integration
tests (rules, end-to-end) remain a follow-up requiring the Firebase emulator.

## After the 8

| # | Item | Status |
|---|------|--------|
| 9 | Light mode (theme toggle + light palette) | ✅ Done |

Light mode: `next-themes` class strategy (default dark) wired in `layout.tsx`;
toggle in the header; semantic surface/text/line/accent CSS variables in
`globals.css` with a light-theme safety-net that remaps the app's hardcoded dark
hex utilities so every page stays legible.

**Constraint found during build:** the app uses `output: 'export'` (static export
for Firebase Hosting). Dynamic route segments need `generateStaticParams()`, so the
invoice deep-link was implemented as a query route `/review/invoice?id={id}` instead
of `/review/[invoiceId]`.

## Verification

- `functions`: `npm run lint` clean; `npm test` = 24/24 pass; deploy build (`lib/`) has no test files.
- Next.js: `npx tsc --noEmit` clean; `npm run build` (static export) succeeds — 12 pages generated including `/review/invoice`.
- Light-mode CSS confirmed present in exported bundle (`--app-bg`, `--accent:#16a34a`, `.light .text-white` remap).

## Definition of done for the upload/review flow

When items 1–8 are complete, the main invoice upload → extract → review → ledger
flow is functionally complete, concurrency-safe, duplicate-aware, observable, and
covered by tests.
