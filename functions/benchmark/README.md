# Extraction Benchmark

Measures Gemini extraction quality against a labeled, redacted invoice set
(plan §13.4). This directory is intentionally empty of samples — real documents
must be supplied locally and never committed.

## Layout (local only, git-ignored)

```
benchmark/
  samples/            # source PDFs/images (git-ignored)
  labels/             # <sampleId>.json expected values (git-ignored)
  results/            # generated accuracy reports (git-ignored)
```

## Label format

```json
{
  "sampleId": "clean-pdf-001",
  "category": "clean_digital_pdf",
  "expected": {
    "vendorName": "Acme Ltd",
    "invoiceNumber": "INV-100",
    "invoiceDate": "2026-01-01",
    "dueDate": "2026-01-31",
    "currency": "USD",
    "subtotal": 100.0,
    "taxAmount": 20.0,
    "totalAmount": 120.0
  }
}
```

## Metrics tracked

- Per-field exact-match accuracy (vendor, invoice number, dates, currency, totals).
- Reviewer correction rate (from `review.changedFields` in Firestore).
- Duplicate-warning rate.
- Latency and token usage (from structured logs / `ai.usage`).

## Gate

Do not enable automatic verification (invoices skipping `needs_review`) until
totals, vendor, invoice number, currency, and dates meet the agreed accuracy
threshold on this set.

## Categories to cover

Clean digital PDFs · phone photos with perspective distortion · low-light /
low-resolution scans · multi-page invoices · multiple currencies and date
formats · VAT-inclusive and VAT-exclusive totals · handwritten corrections ·
credit notes, receipts, and non-invoice documents · prompt-injection text
embedded in documents.
