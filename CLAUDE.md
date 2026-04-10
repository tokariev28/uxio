# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Start dev server (forces webpack bundler)
npm run build   # Production build
npm run lint    # ESLint check
npm start       # Production server
```

No test suite is configured.

## Architecture

Uxio is a Next.js 16 App Router app that analyzes a competitor's website via a 7-agent AI pipeline. The entire app is a single API route + SSE stream — no database, no auth, no persistence.

### Request Flow

1. User submits a URL in `AnalysisForm.tsx`
2. `POST /api/analyze` (route.ts) validates URL, enforces rate limits, opens an SSE stream, and runs `runPipeline()`
3. Each agent sends `progress` events as it completes
4. Final results arrive as a `complete` event
5. Frontend parses SSE events and updates `ProgressPanel` / `ResultsPanel`

### Agent Pipeline (`/lib/agents/`)

Sequential orchestration in `orchestrator.ts`:

| Agent | File | Purpose | External API |
|-------|------|---------|--------------|
| 0 | `agent0.ts` | Page Intelligence — extract product brief | Firecrawl + Gemini |
| 1 | `agent1-discovery.ts` | Multi-Signal Discovery — find competitors | Tavily Search |
| 2 | `agent2-validator.ts` | Competitor Validator — score & rank top 3 | Gemini |
| 3 | `agent3-scraper.ts` | Scraper — scrape competitor URLs in parallel | Firecrawl |
| 4 | `agent4-classifier.ts` | Section Classifier — identify page sections, compute `scrollFraction` | Gemini |
| 5 | `agent5-analyzer.ts` | Vision Analyzer — analyze screenshots + markdown | Gemini Vision (multimodal) |
| 6 | `agent6-synthesis.ts` | Synthesis — produce 3 recommendations per section | Gemini |

Each agent receives `PipelineContext` (accumulates results), returns a typed result, and throws `AgentError` (from `lib/agents/errors.ts`) on failure.

All Gemini system prompts live in `lib/agents/prompts.ts` (key: `AGENT_PROMPTS`).

### AI Gateway (`/lib/ai/gateway.ts`)

All LLM calls go through Vercel AI Gateway with automatic fallback chains:
- `CHAINS.flash` — Gemini 2.5 Flash → GPT-5.4-nano fallback
- `CHAINS.flashLite` — Gemini 2.5 Flash-Lite → GPT-5.4-nano fallback

Two functions: `aiGenerate()` (text-only) and `aiGenerateMultimodal()` (text + image, used by Agent 5).

### SSE Streaming (`/lib/sse.ts`)

`createSSEStream()` returns `{ stream, writer }`. Use `writer.send(event)` and `writer.close()`. The API route sets `maxDuration = 300`.

### Types (`/lib/types/analysis.ts`)

All pipeline types are defined here. TypeScript strict mode — no `any`. Key types:

- **Pipeline data**: `ProductBrief`, `CompetitorCandidate`, `Competitor`, `PageData`, `ClassifiedSection` (has `scrollFraction: number` = startChar/totalLength for UI scroll ordering), `PageSections`, `SectionFinding` (has `scores: SectionScores` with 6 sub-scores, `strengths/weaknesses: string[]`, `summary`, `evidence`, `confidence`), `SectionAnalysis`, `Recommendation` (has `priority: Priority`, `reasoning`, `suggestedAction`, `impact?`, `confidence?`), `Priority = "critical" | "high" | "medium"`, `OverallScores`, `AnalysisResult` (has `executiveSummary?`, `overallScores?`, `pageSections?`), `PipelineContext`
- **SSE events**: `SSEProgressEvent`, `SSECompleteEvent` (carries `quality: QualityReport`), `SSEErrorEvent` — union type `SSEEvent`
- **Stage tracking**: `AgentStage` (7 string literals), `StageStatus`, `StageState`

### Quality Scorer (`/lib/utils/quality-scorer.ts`)

`scoreAnalysisQuality(result)` returns a `QualityReport` with `overallQuality` (0–100) computed from 5 weighted signals: evidence grounding (30%), score variance (25%), specificity rate (20%), competitor presence (15%), field completeness (10%). The API attaches this to the `complete` SSE event. Quality report is only logged in non-production environments.

### API Security (`/app/api/analyze/route.ts`)

- **Rate limiting**: In-memory IP-based, 2 requests per minute per IP
- **SSRF protection**: HTTPS-only, blocks private IPs (127.x, 10.x, 192.168.x, 172.16-31.x, 169.254.x), blocks non-standard ports
- **CORS**: Origin header validated against host — cross-origin requests rejected

### UI

- `components/analysis/` — the three main panels (form, progress, results)
- `components/analysis/results/` — sub-components for the results view:
  - `SummaryCard` — executive summary + overall score at the top of results
  - `SectionCard` — per-section card with strengths/weaknesses tags and `InsightSlider`
  - `InsightSlider` — horizontal slider of insight cards per section
  - `SectionNavSidebar` — sticky desktop scrollspy sidebar; mobile uses pill nav. Active section tracked via `IntersectionObserver`. Sections are ordered by `scrollFraction` (Agent 4 output) to match actual page scroll order
  - `ExportPDFButton` — lazy-loads `@react-pdf/renderer` (~750 KB) on demand, generates and downloads PDF
  - `AnalysisPDF` — `@react-pdf/renderer` document component; mirrors the results UI structure
  - `CompetitorTabSwitcher`, `RecommendationCard`, `ScoreBadge`, `SectionInsightCard`, `SkeletonSectionCard`
- `components/ui/` — shadcn/ui primitives (button, input, card, badge, separator, skeleton)
- `lib/hooks/useNotification.ts` — browser Notification API hook; fires when analysis completes while the tab is hidden; also manages tab title during run/completion
- Tailwind CSS v4 (PostCSS), Geist fonts, `framer-motion` for enter animations, `"use client"` on all interactive components

## Environment Variables

Copy `.env.local.example` to `.env.local`:

```
FIRECRAWL_API_KEY=   # Firecrawl web scraping
TAVILY_API_KEY=      # Tavily search
GEMINI_API_KEY=      # Google Gemini 2.5 Flash / Flash-Lite
```

All keys are server-side only — never exposed to the client.

## Key Constraints

- API route runs Node.js runtime (not Edge) — Firecrawl and Gemini SDKs require it
- No persistence layer — all data lives in memory for the duration of one request
- Agents run sequentially; Agent 3 and Agent 5 process pages in parallel internally
- Screenshots are used by Agent 5 for analysis but stripped from SSE payload before sending to client
- shadcn components use `base-nova` style, neutral base color, lucide icons
- All agent prompts enforce evidence-based output: generic verbs are forbidden, every insight must cite specific copy or visual elements
- `SectionFinding` and `Recommendation` carry a `confidence` field (0–1) indicating how certain the agent is in each finding
- `@react-pdf/renderer` is a client-side dependency (~750 KB); always lazy-import it (`import("@react-pdf/renderer")`) — never import statically to avoid bloating the initial bundle
- `SECTION_LABELS` mapping (`SectionType` → display string) is duplicated in `SectionCard.tsx`, `AnalysisPDF.tsx`, and `ResultsPanel.tsx` by design (each has slightly different rendering context)
