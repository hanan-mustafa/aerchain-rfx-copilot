# Kill the Quote Spreadsheet — RFx Comparison Copilot

Built for the Aerchain product take-home. A buyer drafts an RFx (fabricated here for a
FY27 IT hardware refresh), five vendors reply in five different messy real-world formats,
the system extracts and normalizes every line into one comparable table, and a buyer can
interrogate the result in plain language.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000, click **Run extraction** (this makes real Claude API calls
against the five vendor files in `data/vendor-uploads/`, all five vendors in parallel —
expect about a minute), then use the chat panel.

### Deploying to Vercel

```bash
vercel link
vercel env add ANTHROPIC_API_KEY   # paste your key when prompted
vercel deploy --prod
```

No other configuration needed — the app has no external database; see **Known trade-offs**
below for what that means in production.

## The dataset

`data/vendor-uploads/` contains five fabricated vendor responses to the same RFx, each with
a specific, deliberate "ugly edge" baked in (see `data/Ground_Truth_Answer_Key_INTERNAL.xlsx`
for the full answer key used to build and sanity-check this pipeline):

| Vendor | Format | The edge case |
|---|---|---|
| Apex Business Systems | `.xlsx` | Clean control case — fills the template exactly |
| TechMart Solutions | `.docx` | Own layout, grouped by category not by RFx line number, commercial terms buried in prose |
| Global IT Distributors | `.pdf` | A 4% early-payment rebate that changes effective pricing is disclosed only in a footnote on page 2 |
| QuickServe Traders | plain-text email | Collapses 4 laptop tiers into one ambiguous "average" price; skips 6 line items outright |
| Sunrise Computech | photographed rate card (`.jpg`) | USD instead of INR; cable locks quoted per box of 10 instead of per unit; 3 items missing |

## Architecture

```
Vendor file (any format)
      │
[1] Format-specific extraction (real LLM/vision call, strict JSON schema)
      │
[2] Normalization (deterministic code: currency, units, conditional pricing)
      │
[3] Comparison store (single source of truth — JSON file for this demo)
      │
      ├──► [4] Comparison UI  (reads store only)
      └──► [5] Analyst agent  (tool-calling over store only, never re-reads raw docs)
```

**The one rule everything else follows: once a document is extracted, nothing downstream
ever opens it again.** The UI and the chat agent both read exclusively from the normalized
`ComparisonStore` (`lib/schema.ts`). This is what makes "would a buyer act on this screen"
answerable — every number is traceable to a `source_excerpt` + `source_location`, and
nothing gets silently re-interpreted twice.

### Extraction (`lib/extractors/*.ts`)

Each format gets its own deterministic pre-processing before the LLM ever sees it, because
throwing away structure you already have exactly (e.g. sending a spreadsheet as an image)
is strictly worse than using it:

- **xlsx** (Apex): every populated cell serialized as `Sheet!Ref=value`, so the model's
  cited `source_location` is a real, checkable cell reference.
- **docx** (TechMart): `mammoth` → HTML, preserving the vendor's own headings/tables intact
  (this vendor groups items by category, not by the buyer's line numbers — losing that
  structure would hide it from the model).
- **pdf** (Global IT): `pdf-parse` text layer with explicit page markers, so a footnote on
  page 2 can be connected back to a price shown in a table on page 1.
- **email** (QuickServe): raw text with numbered paragraphs. This is the vendor most likely
  to collapse multiple SKUs into one ambiguous price — handled by a shared extraction rule
  (`lib/extractors/shared.ts`, rule #2), not a QuickServe-specific hack.
- **image** (Sunrise): the only extractor that goes through vision (`claude-sonnet-5-5` — on
  this photo `claude-sonnet-4-5` misread 5-7 of 26 lines per run, the newer model 0 of 26 in
  3/3 runs; reproduce with `npx tsx scripts/eval-sunrise-vision.ts`). Two independent vision
  passes read the card in opposite orders and are reconciled — a price disagreement beyond 2%,
  a different unit of measure, or a line only one pass found forces a `LOW_CONFIDENCE` flag. See the note in `lib/extractors/image.ts` on why this is a
  self-consistency check rather than true OCR cross-validation (Tesseract's native binary is
  a poor fit for Vercel serverless; the honest trade-off is documented right there in code,
  not hidden).

All five extractors output the *same* schema (`ExtractedLine` in `lib/schema.ts`) regardless
of source format — this uniform contract is what lets normalization be format-agnostic.

**The extraction prompt (`lib/extractors/shared.ts`) enforces, as hard rules, not
suggestions:** never guess a `line_ref` you're not confident of; never split a
vendor's collapsed multi-SKU price into an invented per-line breakdown
(`UNRESOLVED_AMBIGUOUS` + `resolvable: false` instead); never do currency or unit
conversion yourself (that's normalization's job); always cite a real, checkable
`source_excerpt`.

### Normalization (`lib/normalize.ts`)

Currency conversion, unit-of-measure conversion, and conditional-pricing math are
**arithmetic, not judgment calls**, so they run in plain deterministic TypeScript, never
inside an LLM call. The LLM's job in extraction is only to *identify* that something needs
converting (e.g. "this is USD," "this is per box of 10," "this 4% rebate is conditional on
7-day payment") — the actual division/multiplication happens once, here, auditable, with
every conversion step logged in `conversion_notes` next to the number it produced.

The original vendor figure is *never* overwritten — `original_unit_price`,
`original_currency`, and `original_unit_of_measure` sit alongside every normalized value.

Verify this logic directly (no API key needed — pure functions):
```bash
npx tsx scripts/test-normalize.ts
npx tsx scripts/test-questionnaire-gate.ts
```

Check a real extraction run against the answer key (after **Run extraction**):
```bash
npx tsx scripts/validate-ground-truth.ts
```

**RFx line 30 (warranty extension)** is defined in `lib/rfxData.ts` as *per device, qty 320*,
not the template's "lot, qty 1": the line's own spec is per device, and every vendor that
quoted it priced it per device across the 320 laptops on lines 1-4. As a "lot" it was not
comparable across vendors.

### Questionnaire gate (`lib/questionnaire.ts`)

The LLM classifies each raw answer's quality (genuinely a judgment call — vague vs. evasive
vs. backed by proof). The PASS/BORDERLINE/FAIL **gate itself is a plain, stated rule** over
those classifications (fail if any compliance-critical question is unanswered or evasive;
borderline if any is vague), not a second opaque model verdict. When a buyer asks "why was
this vendor disqualified," the answer is a rule they can read (`gate_reasons` in the output),
not "the model decided."

### Analyst agent (`lib/agent/`)

Tool-calling, not chat-over-raw-documents. The agent has six tools
(`get_line_comparison`, `compute_cheapest_per_line`, `get_vendor_total`,
`filter_vendors_by_questionnaire`, `get_questionnaire_verdict`, `list_lines_with_flag`) —
see `lib/agent/tools.ts`. **All arithmetic and filtering happens inside these tool
functions, in code — never in the model's head.** This is what makes the chat's answers
verifiable the same way the table is: ask "what if we split it, cheapest per line, but only
among vendors who cleared the questionnaire" (the exact question from the assignment brief)
and the agent calls `filter_vendors_by_questionnaire` then `compute_cheapest_per_line` with
that vendor list — it doesn't reason its way to a total by itself.

## What I deliberately left out (and why)

- **No real database.** `lib/store.ts` persists the comparison store as a JSON file. Every
  extractor, the normalizer, and the agent tools only ever import `getStore`/`saveStore` —
  swapping in Postgres/Vercel KV/Mongo touches exactly one file. On Vercel the file lives in
  per-instance `/tmp`, so a fresh extraction is not guaranteed to be visible to the next chat
  request; reads fall back to `data/seed/comparison-store.json`, a committed snapshot of a
  run that passes `validate-ground-truth.ts`. Fine for this demo, not fine to ship as-is.
- **No real inbox/SMTP.** Vendor files are read directly from `data/vendor-uploads/` — the
  assignment explicitly says to stub this ("fake the SMTP server if you like"), and
  building it would have taken time away from the extraction/reasoning loops that were
  supposed to be real.
- **OCR cross-check is two vision passes, not Tesseract.** See the design note in
  `lib/extractors/image.ts`. A smaller safety net than true independent-engine
  cross-validation, and that trade-off is stated in the code rather than dressed up as
  something it isn't.
- **No auth, no multi-RFx support, no vendor portal.** Single hardcoded RFx, single
  comparison run at a time. Scoped this way to keep the five real "ugly edge" cases
  central rather than diluting effort into product surface area the brief didn't ask for.
- **`xlsx` (SheetJS) has an open, unpatched prototype-pollution/ReDoS advisory** as of this
  build; no fix is available upstream yet. Given the file's contents here are trusted
  (fabricated by the same person building the pipeline), this is an acceptable risk for a
  demo — it would need addressing (e.g. sandboxed parsing, or a different library) before
  ever accepting arbitrary vendor-uploaded files in production.

## Project layout

```
app/
  page.tsx              dashboard: comparison table + questionnaire strip + chat
  api/extract/route.ts  runs the full pipeline across all 5 vendors
  api/vendors/route.ts  fetches the current comparison store
  api/chat/route.ts     analyst agent endpoint
components/             ComparisonTable, QuestionnaireStrip, ChatPanel, FlagTag
lib/
  schema.ts             the core data contracts (read this first)
  extractors/           one file per source format + shared prompt logic
  normalize.ts           deterministic currency/unit/conditional-pricing math
  questionnaire.ts       LLM classification + rule-based gate
  agent/                 tool definitions, tool execution, the chat loop
  pipeline.ts            orchestrates extraction → normalization → questionnaire per vendor
  store.ts               file-based persistence (swap point for a real DB), seed fallback
  rfxData.ts              the RFx line items, vendor metadata, questionnaire raw answers
data/
  vendor-uploads/         the five fabricated vendor response files
  RFx_Template_ITHardware_FY27.xlsx
  Ground_Truth_Answer_Key_INTERNAL.xlsx   (not part of the app — validation reference)
  seed/comparison-store.json              validated snapshot served when no live run is on disk
scripts/
  test-normalize.ts             normalization math checks (no API key needed)
  test-questionnaire-gate.ts    gate rule checks (no API key needed)
  validate-ground-truth.ts      checks the current store against the answer key
  eval-sunrise-vision.ts        vision-model accuracy on the rate-card photo (real API calls)
```
