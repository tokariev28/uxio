# PDF Export Redesign

**Date:** 2026-04-10  
**File:** `components/analysis/results/AnalysisPDF.tsx`

## Context

The results page recently received a significant visual update (commits `a493660`, `326d3d8`): new section card layout with strength/weakness tags, a stacked InsightSlider redesign, and a new header with centered logo. The PDF export (`AnalysisPDF.tsx`) still reflects the old design. This spec describes bringing the PDF up to date with the new UI.

---

## Approved Design

### 1. Page Header

Three-column layout (`1fr auto 1fr`):

| Left | Center | Right |
|---|---|---|
| Favicon (Google S2) + company name (bold) + URL below | Uxio logo SVG (`/logo.svg`), black, centered | "Analyzed" label + date value |

- Favicon: `https://www.google.com/s2/favicons?domain={host}&sz=32`, 22×22, borderRadius 3
- Company name: 13px bold, #111
- URL: 10px, #6b7280
- Logo: `Image` from `@react-pdf/renderer`, height ~28pt, filter to black (`#000` tint)
- Date label: 8px, uppercase, #9ca3af; date value: 11px, #6b7280

---

### 2. Score Block

No change — centered large number + "CONVERSION SCORE" label + grade pill. Keep as-is.

---

### 3. Section Block

Each section wrapped in a bordered card (`border: 1pt solid rgba(0,0,0,0.08)`, `borderRadius: 10`, `marginBottom: 12`).

**Section header** (inside card, bottom-bordered):
- Score number (color-coded) — kept from old design
- Section name (bold)
- Priority badges flush-right: `● N critical · ● N high · ● N medium` (only non-zero counts shown)

**Section body:**

#### 3a. Strengths / Weaknesses row

Two equal-height columns side by side:
- Left: "STRENGTHS" label (7px, #15803d) + tag (`rgba(22,163,74,0.07)` bg, green border/text, 10px, padding 8 10, borderRadius 7)
- Right: "WEAKNESSES" label (7px, #b91c1c) + tag (`rgba(220,38,38,0.07)` bg, red border/text)
- Show at most 1 strength + 1 weakness (from `inputFinding.strengths[0]` / `.weaknesses[0]`)
- Equal height: both tag `View`s use `flexGrow: 1`

#### 3b. Insight cards — stacked

All recommendations for the section (up to 5, sorted by priority) rendered one below the other, `gap: 8`.

Each insight card (`border: 1pt solid rgba(0,0,0,0.07)`, `borderRadius: 8`):

```
┌─────────────────────────────────┐
│  ● CRITICAL                     │  ← priority dot (5pt) + label, 8px uppercase
│  Insight title here             │  ← 12px bold, #111, letterSpacing -0.01em
│  Reasoning text in slate gray   │  ← 9px, #64748b, lineHeight 1.7
│                                 │
│  ┌───────────────────────────┐  │
│  │ RECOMMENDATION            │  │  ← gray box: bg #f7f7f8, borderRadius 7, padding 9 11
│  │ Suggested action text.    │  │  ← 10px, 600 weight, #111
│  │ ↳ Impact statement        │  │  ← 9px italic, #6b7280 (only if insight.impact exists)
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

Fields used per insight:
- `rec.priority` → dot color + label
- `rec.title` → card title
- `rec.reasoning` → body text
- `rec.suggestedAction` → recommendation box text
- `rec.impact` → `↳` line inside recommendation box (optional)

Fields **not** shown in PDF (too verbose / interactive-only):
- `rec.exampleFromCompetitor` — skip
- `rec.confidence` — skip

---

## Data Flow

No changes to data flow. `AnalysisPDF` already receives the full `AnalysisResult`. New fields used:

| Field | Source | Already available? |
|---|---|---|
| `result.productBrief.company` | existing | ✅ |
| `result.pages[0].url` | existing | ✅ |
| `inputFinding.strengths[0]` | `section.findings` | ✅ |
| `inputFinding.weaknesses[0]` | `section.findings` | ✅ |
| `rec.impact` | `Recommendation` type | ✅ |

---

## Files to Modify

- **`components/analysis/results/AnalysisPDF.tsx`** — primary file, full redesign
  - Update `StyleSheet` with new styles
  - Restructure header to 3-column grid
  - Add `Image` import from `@react-pdf/renderer` for logo
  - Add strength/weakness row renderer
  - Replace flat rec cards with new stacked insight card layout

No other files need changes.

---

## Verification

1. Run `npm run dev`, open a completed analysis result
2. Click "Export PDF" — confirm download triggers
3. Open PDF and check:
   - Header: logo centered, site info left, date right
   - Score block unchanged
   - Each section card: bordered, score + name + priority badges in header
   - S/W tags present and equal height
   - Insight cards stacked, with recommendation box and `↳ impact` where applicable
4. Test with a section that has no strength/weakness data — S/W row should be omitted
5. Test with a section that has only 1 insight — single card renders cleanly
