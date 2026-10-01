# RFx Copilot

Built for the Aerchain product take-home. The full sourcing loop in one product:

1. **Draft** an RFx by describing what you need. The co-pilot writes the line items, supplier
   questionnaire and commercial terms; you edit anything directly.
2. **Send** it to vendors: each gets an email with the RFx summary, an Excel template and a
   personal reply link.
3. **Collect** replies in whatever format vendors already use (Excel, Word, PDF, a plain email,
   a phone photo). Nobody is forced into the template.
4. **Compare** every response side by side: same lines, same units, same currency, with
   commercial terms, questionnaire answers and the original documents alongside the numbers.
   Every price opens to the vendor's own wording and the exact conversion applied.
5. **Ask**: a natural-language analyst over the whole comparison that answers with text,
   tables, charts and Excel exports, every figure computed in code.
6. **Award**: compare award scenarios (single vendor, split by line, by eligibility, headline or
   net of rebates), record the rationale, approve, and download an award memo that cites the
   evidence for every awarded line.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. The workspace opens with a **sample RFx** (FY27 Workplace Hardware
Refresh) whose five vendor responses are already processed. Everything except the co-pilot, the
analyst chat and processing a *new* document works without an API key.

### Deploying to Vercel

Import the repo at vercel.com/new (or `vercel deploy --prod`) and set `ANTHROPIC_API_KEY` in the
project's environment variables. No database or other configuration is needed (see
**Known trade-offs**).

## Keeping API usage low

Only three things call Claude, and each is built to call it as little as possible:

| Feature | Model | Calls |
|---|---|---|
| Reading a vendor document | `claude-sonnet-4-5` (photos: `claude-sonnet-5-5`, two reads) | **One call per new document** returns prices, questionnaire answers and commercial terms together. Results are cached by file hash (`lib/extractionCache.ts`): the same file is never read twice. Questionnaire answers are then classified in one small call, skipped entirely if the response answers nothing. |
| RFx co-pilot | `claude-haiku-4-5` | One call per message. Templates start a draft with no call at all. |
| Analyst chat | `claude-sonnet-4-5` | One conversation turn per question; an identical question over identical data is answered from a local cache. |

Everything else is plain code with zero API cost: unit and currency conversion, the
qualification gate, building the comparison, award scenarios, charts, exports and the award memo.

The sample RFx's five documents ship with **committed cache entries**, so a fresh deploy demos
end to end without spending credits. Those entries were rebuilt from the validated run by
`scripts/seed-extraction-cache.ts`, which proves (with no API key set) that the cached path
reproduces that run exactly. "Re-read" on a sample response forces a live call.

## The sample dataset

`data/vendor-uploads/` holds five fabricated responses to the sample RFx, each with a deliberate
edge case (`data/Ground_Truth_Answer_Key_INTERNAL.xlsx` is the answer key):

| Vendor | Format | The edge case |
|---|---|---|
| Apex Business Systems | `.xlsx` | Clean control case: fills the template exactly |
| TechMart Solutions | `.docx` | Own layout grouped by category, not RFx line numbers; prices GST-inclusive |
| Global IT Distributors | `.pdf` | A 4% early-payment rebate disclosed only in note 7 on a later page |
| QuickServe Traders | plain-text email | Four laptop tiers collapsed into one "average" price; six lines skipped |
| Sunrise Computech | photo of a tilted rate card | USD instead of INR; cable locks per box of 10; four lines missing |

```bash
npx tsx scripts/validate-ground-truth.ts   # the sample comparison vs the answer key: ALL CHECKS PASS
```

## Architecture

```
Buyer drafts RFx (co-pilot: Haiku) ──► RFx definition (data, not constants)
        │
        ▼
Send: invitation email + Excel template + reply link per vendor
        │
Vendor reply, any format ──► [1] Extraction: one AI call per new document, cached by file hash
                                 (prices + questionnaire answers + commercial terms)
                                         │
                             [2] Comparison (pure code, runs in the browser):
                                 normalization, NOT_QUOTED backfill, qualification gate
                                         │
                     ┌───────────────────┼────────────────────┐
                     ▼                   ▼                    ▼
              Compare UI          Analyst (tool-calling;   Award scenarios + memo
          (source drawer)         all figures from code)       (pure code)
```

**The rule everything follows: once a document is read, nothing downstream opens it again.**
The comparison UI, the analyst and the award memo all read the same normalized data, and every
number traces to a `source_excerpt` + `source_location` from the vendor's document.

### Where state lives

The workspace (RFxs, vendors, invitations, responses, award decisions) is held in the browser:
`lib/workspace.tsx` (localStorage, synced across tabs) and `lib/fileStore.ts` (uploaded originals
in IndexedDB). The server is stateless: it reads documents and answers questions. This keeps the
app working on serverless hosting with no database, and swapping in a real backend touches
`lib/workspace.tsx` only.

### Extraction (`lib/extractors/*.ts`)

Each format gets its own pre-processing before the model sees it:

- **xlsx**: every populated cell serialized as `Sheet!Ref=value`, so cited locations are real cell references.
- **docx**: `mammoth` → HTML, preserving the vendor's own headings and tables.
- **pdf**: text layer per page with cell separators, so a note on a later page can be connected to a price on page 1.
- **email / text**: numbered paragraphs.
- **image**: vision on `claude-sonnet-5-5` (on the Sunrise photo `claude-sonnet-4-5` misread 5–7 of 26 lines per run;
  the newer model 0 of 26 in 3/3 runs: `npx tsx scripts/eval-sunrise-vision.ts`). Two independent reads in
  opposite orders are reconciled; any price, unit or coverage disagreement forces `LOW_CONFIDENCE`.

The shared prompt (`lib/extractors/shared.ts`) enforces: never guess a line mapping; never split a
collapsed multi-item price into an invented breakdown; never convert units or currency; always
quote the vendor; report questionnaire answers and terms only where the vendor states them.

### Normalization (`lib/normalize.ts`)

Currency, unit-of-measure and conditional-pricing math are arithmetic, so they run in code, never
in a model call, with every step logged next to the number it produced. Original vendor figures
are never overwritten.

```bash
npx tsx scripts/test-normalize.ts
npx tsx scripts/test-questionnaire-gate.ts
```

**Sample RFx line 30 (warranty extension)** is *per device, qty 320*, not the template's
"lot, qty 1": its own spec is per device and every vendor priced it that way.

### Qualification gate (`lib/gate.ts`)

The model classifies each answer's quality (with proof / vague / evasive / unanswered); the gate is
a stated rule over those labels, using the questions the buyer marked **Required to qualify**:
any required question unanswered or evasive → not qualified; any answered vaguely → borderline.

### Analyst (`lib/agent/`)

Tool-calling over the comparison, never over raw documents. Eleven tools, including
`compute_award_scenario`, `compare_award_scenarios`, `get_commercial_terms`, `make_chart` and
`make_export`. **All arithmetic and filtering happens in the tools** (`lib/award.ts` is shared with
the Award page and memo, so the same scenario shows the same numbers everywhere). Charts and
exports are computed in code and rendered in the chat; only a summary goes back to the model.

## Known trade-offs

- **No real database or auth.** The workspace lives in the browser. Fine for a demo; a real
  deployment needs a backend (one-module swap, see above).
- **Simulated channel.** Invitations are generated and shown in an outbox rather than sent over
  SMTP, and the vendor reply link saves to the workspace in the same browser. The brief allows
  stubbing the channel; the response-reading path behind it is real.
- **Sample questionnaire answers come from the dataset**, not from a live read of each document
  (the committed cache was rebuilt from the validated run; a live "Re-read" replaces it). For
  Sunrise, the answers reflect the vendor's covering call; the photo itself contains none.
- **Photo cross-check is two vision reads, not OCR.** It can't catch an error both reads share;
  model choice is the first line of defence (see above).
- **Cache invalidation is partly manual.** The cache key hashes the file, model, RFx and shared
  prompt, but not each extractor's own instructions: bump `EXTRACTION_CACHE_VERSION` when changing them.
- **GST treatment is flagged, not normalized.** TechMart quotes GST-inclusive while others quote
  ex-GST; the comparison flags it rather than silently adjusting prices.
- **`xlsx` (SheetJS) has an open prototype-pollution/ReDoS advisory.** Acceptable for trusted demo
  files; sandbox parsing or switch libraries before accepting untrusted uploads in production.

## Project layout

```
app/
  (app)/page.tsx                    RFx list
  (app)/rfx/new/page.tsx            co-pilot + draft editor + review & send
  (app)/rfx/[id]/                   overview · vendors & responses · compare & analyze · award
  respond/[rfxId]/[vendorId]/       vendor reply page (any file format)
  api/sample                        the sample RFx with processed responses (cached, no API calls)
  api/responses/{process,sample}    read a vendor document
  api/chat · api/copilot            analyst and RFx co-pilot
  api/export · api/rfx-pack         Excel downloads
  api/files/[vendorId]              sample originals and previews
components/                         table, source drawer, terms table, chat, chart, sidebar
lib/
  schema.ts                         data contracts (read this first)
  extractors/ · pipeline.ts         document reading (AI) + format detection
  extractionCache.ts                content-addressed cache of AI results
  normalize.ts · gate.ts · comparison.ts   pure comparison logic (runs in the browser)
  award.ts · awardMemo.ts           award scenarios and the memo
  agent/ · copilot.ts               analyst tools/loop and RFx co-pilot
  workspace.tsx · fileStore.ts      browser workspace state
  rfxData.ts · rfxTemplates.ts      sample RFx and starting templates
data/
  vendor-uploads/                   the five sample vendor responses
  extraction-cache/                 committed cache entries for the sample documents
  seed/comparison-store.json        the validated sample comparison
scripts/                            normalization/gate tests, answer-key validator, cache seeding, vision eval
```
