# Uxio MVP Spec — Overview

## Goal

Implement a working MVP of Uxio:

- A single-page web app that:
  - Accepts a SaaS landing page URL.
  - Runs the defined multi-agent pipeline end-to-end.
  - Displays a competitor overview and key recommendations.
- Deployed to Vercel, usable by reviewers without any local setup.

The MVP should demonstrate:

- Correct orchestration of the pipeline across Firecrawl, Tavily, and Gemini.
- A clear, opinionated UX for "one URL in → insights out".
- Clean, maintainable code that can be extended later (e.g., collaboration, history).

---

## User Flow (MVP)

1. User opens the Uxio web app.
2. Enters a URL (e.g., `https://apollo.io`) into a single input field.
3. Clicks the **"Analyze"** button.
4. A pre-flight reachability check runs (`POST /api/validate-url`): HEAD request with 5s timeout, fallback to partial GET `Range: bytes=0-0`. If unreachable, the user sees "We couldn't reach this address" and analysis does not start.
5. Sees a **ProgressPanel** with 7 sequential stages:
   - "Reading the page" (`page-intelligence`)
   - "Finding competitors" (`discovery`)
   - "Validating competitors" (`validation`)
   - "Scraping pages" (`scraping`)
   - "Classifying sections" (`classification`)
   - "Analysing design" (`analysis`)
   - "Synthesising insights" (`synthesis`)

   Each stage shows a running spinner while active, a green checkmark when done, and can display inline action tags (e.g., competitor names being validated). Analysis typically takes 2–4 minutes. The user can opt in to a browser notification for when the tab is in the background.
6.Sees the **InspirationGallery** — an auto-scrolling 3D carousel of 20 SaaS websites ("Websites we love") shown on the home/form view before any analysis starts.
7. When the analysis finishes, the user sees a **Results** section with:
   - **SummaryCard**: arc gauge (0–100, color-coded green/amber/orange/red), a 2-sentence AI executive summary, and overall score derived from `overallScores.input`.
   - **SectionNavSidebar** (desktop): sticky scrollspy sidebar listing sections in page-scroll order (by `scrollFraction`). Mobile: horizontal scrollable pill tabs.
   - **Competitor tabs** (`CompetitorTabSwitcher`): tabs for each of the 3 analyzed competitors, each with a color-coded score dot.
   - **SectionCards**: one per detected section type. Each card shows:
     - Strengths tags (green) and weaknesses tags (red).
     - **InsightSlider**: horizontal carousel of up to 5 recommendation cards with arrow/keyboard navigation.
   - **RecommendationCards** (inside InsightSlider): each contains priority badge, title, reasoning with inline competitor links (favicon + name), a recommendation box, and optional impact note.
   - **Export PDF** button: lazy-loads `@react-pdf/renderer` on click and downloads a full analysis PDF.

   Additional UX details:
   - Results for the same URL are cached in `localStorage` for 2 hours (`uxio:cache:` prefix) — instant reload on re-analysis.
   - Browser tab title changes to "Analyzing… • Uxio" during analysis and "✓ Analysis ready • Uxio" on completion.
   - A browser notification fires on completion if the tab is hidden and permission was granted.

No logins, comments, or history screens in the MVP.

---

## API Surface (Internal Backend)

### `POST /api/validate-url`

Pre-flight reachability check, called before `/api/analyze`.

**Request body:**

```json
{ "url": "https://apollo.io" }
```

**Response:**

```json
{ "valid": true }
// or
{ "valid": false, "reason": "invalid" | "unreachable" }
```

Logic: HEAD request → fallback GET with `Range: bytes=0-0` header → 5s timeout. Returns `valid: true` on any HTTP response (including 4xx/5xx). Returns `valid: false, reason: "unreachable"` only on network/timeout error.

---

### `POST /api/analyze`

**Request body:**

```json
{
  "url": "https://apollo.io"
}
```

**Response:** Server-Sent Events (SSE) stream (`Content-Type: text/event-stream`). The route sets `maxDuration = 300`. Three event types are emitted:

```typescript
// Progress update per agent stage
{ type: "progress"; stage: AgentStage; status: "running" | "done" | "error"; message: string; actions?: string[] }

// Final result
{ type: "complete"; data: AnalysisResult; quality?: QualityReport }

// Fatal error
{ type: "error"; message: string }

type AgentStage = "page-intelligence" | "discovery" | "validation" | "scraping" | "classification" | "analysis" | "synthesis"
```

**`AnalysisResult` shape:**

```typescript
interface AnalysisResult {
  productBrief: ProductBrief;
  competitors: Competitor[];
  pages: PageData[];                  // raw scrape data per URL
  sections: SectionAnalysis[];        // array, one entry per detected section type
  recommendations: Recommendation[];
  executiveSummary?: string;          // 2-sentence AI summary
  overallScores?: OverallScores;      // { input: number, [competitorName]: number }
  pageSections?: PageSections[];      // classified sections per page (includes scrollFraction)
}
```

**`ProductBrief` shape:**

```typescript
interface ProductBrief {
  company: string;
  industry: string;
  icp: string;
  icpKeyword: string;               // short keyword used in search queries
  coreValueProp: string;
  cvpKeyword: string;               // short keyword used in search queries
  keyFeatures: string[];            // max 6 items
  pricingModel?: string;
  primaryCTAText?: string;
  pricingVisible?: boolean;
  hasFreeTrialOrFreemium?: boolean;
}
```

**`Competitor` shape:**

```typescript
interface Competitor {
  url: string;
  name: string;
  matchScore: number;   // 0–1
  matchReason: string;
}
```

**`SectionAnalysis` shape** (`sections` is an array, not a keyed object):

```typescript
type SectionType =
  | "hero" | "navigation" | "features" | "benefits"
  | "socialProof" | "testimonials" | "integrations" | "howItWorks"
  | "pricing" | "faq" | "cta" | "footer"
  | "videoDemo" | "comparison" | "metrics"

interface SectionAnalysis {
  sectionType: SectionType;
  findings: SectionFinding[];
}

interface SectionFinding {
  site: string;           // "input" or competitor name/URL
  score: number;          // 0–1 overall score
  scores?: SectionScores; // 10 sub-scores (clarity, specificity, icpFit, attentionRatio, ctaQuality, trustSignals, visualHierarchy, cognitiveEase, typographyReadability, densityBalance)
  confidence?: number;    // 0–1
  strengths: string[];
  weaknesses: string[];
  summary: string;
  evidence: {
    headlineText?: string;
    ctaText?: string;
    quote?: string;
    visualNote?: string;
  };
}
```

**`Recommendation` shape:**

```typescript
interface Recommendation {
  priority: "critical" | "high" | "medium";
  section: SectionType;            // which section this recommendation targets
  title: string;
  reasoning: string;
  exampleFromCompetitor: string;   // must name a specific competitor
  suggestedAction: string;
  impact?: string;
  confidence?: number;             // 0–1
}
```

**`QualityReport` shape** (attached to `complete` event, only logged in non-production):

```typescript
interface QualityReport {
  overallQuality: number;  // 0–100 weighted score
  signals: {
    evidenceGrounding: number;    // 30% weight
    scoreVariance: number;        // 25% weight
    specificityRate: number;      // 20% weight
    competitorPresence: number;   // 15% weight
    fieldCompleteness: number;    // 10% weight
  };
  warnings: string[];
}
```

The exact schema can evolve during implementation, but it must:

- Provide enough structure for a clean UI.
- Preserve evidence links (quotes, visual notes) for possible future UI improvements.

---

## External Dependencies (MVP)

### Firecrawl

Purpose:

- Given a URL, return:
  - Full-page screenshot (signed GCS URL, immediately resolved to base64 by Agent 3).
  - Markdown representation of the page content.

Usage:

- Agent 0 (Page Intelligence) for the input URL — markdown only.
- Agent 3 (Scraper) for the input URL + 3 competitors — markdown + screenshot.

### Tavily Search

Purpose:

- Given search queries, return competitor candidates.

Usage:

- Agent 1 (Multi-Signal Discovery) runs 5 parallel queries based on `ProductBrief`:
  1. `"${company} alternatives ${year}"`
  2. `"best ${cvpKeyword} software for ${icpKeyword} ${year}"`
  3. `"${industry} software top rated leaders ${year}"`
  4. `"${company} vs"`
  5. `"best tools for ${icpKeyword} ${year}"`

Results are merged and de-duplicated (by root domain) with LLM discovery results into the candidate set.

### Gemini 2.5 Flash & Flash-Lite (via Vercel AI Gateway)

All LLM calls go through **Vercel AI Gateway** (`lib/ai/gateway.ts`) with automatic fallback chains:

- `CHAINS.flash` — Gemini 2.5 Flash → GPT-5.4-nano fallback
- `CHAINS.flashLite` — Gemini 2.5 Flash-Lite → GPT-5.4-nano fallback

Automatic retry: up to 2 retries on transient errors (429, 503, timeout) with 1s / 2s delays.

| Chain | Used by | Purpose |
|-------|---------|---------|
| Flash-Lite | Agents 0, 1, 2, 4 | Extraction, discovery, scoring, classification — faster, cheaper |
| Flash | Agents 5, 6 | Vision analysis and synthesis — heavier reasoning |

**Agent 1** calls **both** Tavily (5 search queries) and Gemini Flash-Lite (LLM knowledge discovery) in parallel. The LLM leg enforces TIER-1 criteria — only companies with 3+ years on market, thousands of verified G2/Capterra reviews, and recognizable-without-explanation status qualify. The prompt uses a chain-of-thought step to anchor category selection before returning 8 candidates. LLM candidates receive `mentions = 2` base weight; candidates confirmed by both sources receive an additional `+2` boost. Agent 3 (Firecrawl scraping) does not call Gemini.

**Agent 2** applies three rules beyond 4-axis alignment scoring: DIVERSITY (at most 2 selected competitors from the same primary sub-category), INFRASTRUCTURE exclusion (blocks generic cloud providers — AWS, Azure, GCP, Vertex AI, Bedrock, Azure OpenAI — from appearing as product competitors), and TIER RULE (when matchScores are within 0.10, prefer the candidate with higher market presence). Returns top 5 ranked candidates; positions 1–3 are primary, 4–5 are backups used if a primary page cannot be scraped.

**Agent 4** deduplicates classified sections by type per page — only the first occurrence of each section type is retained. Prevents sticky nav or repeated CTA blocks from appearing twice in the analysis.

**Agent 5** uses `AGENT_PROMPTS.sectionAnalyzerBatch` (the `visionAnalyzer` key in `prompts.ts` is legacy/reference only and not in the active code path). Each `SectionFinding` receives a `confidence` score based on source quality: `1.0` (full screenshot available), `0.7` (text-only, no screenshot), `0.4` (section detected but very thin content). Evidence grounding is enforced — strengths and weaknesses must cite specific copy or a named visual element.

**Agent 6** strips numerical scores from Agent 5 output before the synthesis call — the LLM reasons from evidence text, not from numbers it didn't generate. `overallScores` are computed programmatically from Agent 5 section data after synthesis completes, not generated by the AI. Screenshots are removed from `PageData` before the `complete` SSE event is sent (~4–12 MB payload reduction).

All system prompts are defined in `lib/agents/prompts.ts` (key: `AGENT_PROMPTS`). Agents 1 (Tavily leg) and 3 (Firecrawl) are pure API calls with no prompts in that file.

All API keys are provided via environment variables and only used server-side.

---

## Non-Goals for MVP

To keep the scope realistic, the following are explicitly **out of scope** for the MVP:

- **Collaboration features**
  - Comments, @mentions, shared workspaces.
- **User account system**
  - Sign-up, login, team management, billing.
- **Exports and integrations**
  - Figma plugin, Slack notifications, API access for external systems. (PDF export is included.)
- **Data persistence**
  - No database for storing past analyses or histories. (In-memory 2-hour localStorage cache is included.)
- **Mobile viewport analysis**
  - Only desktop layout is analyzed initially.

These are part of the full Uxio vision and appear in the main PRD, but will be implemented in later phases, not in this MVP.
