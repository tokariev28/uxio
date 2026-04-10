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

1. User submits a URL in `AnalysisForm.tsx`; `POST /api/validate-url` does a pre-flight reachability check (HEAD with 5s timeout; if the server returns 405, retries with `GET Range: bytes=0-0` to avoid downloading the full body; hostname must contain `.`; any HTTP response — even 4xx/5xx — counts as reachable) before the main analysis starts
2. `POST /api/analyze` (route.ts) validates URL, enforces rate limits, opens an SSE stream, and runs `runPipeline()`
3. Each agent sends `progress` events as it completes
4. Final results arrive as a `complete` event
5. Frontend parses SSE events and updates `ProgressPanel` / `ResultsPanel`

### Agent Pipeline (`/lib/agents/`)

Sequential orchestration in `orchestrator.ts`:

| Agent | File | Purpose | External API |
|-------|------|---------|--------------|
| 0 | `agent0.ts` | Page Intelligence — extract product brief | Firecrawl + Gemini |
| 1 | `agent1-discovery.ts` | Multi-Signal Discovery — Tavily search + LLM knowledge discovery in parallel | Tavily Search + Gemini |
| 2 | `agent2-validator.ts` | Competitor Validator — score & rank top 3 | Gemini |
| 3 | `agent3-scraper.ts` | Scraper — two-pass scrape (JS SPA retry) of all URLs in parallel | Firecrawl |
| 4 | `agent4-classifier.ts` | Section Classifier — identify page sections, normalize section types, deduplicate by type, compute `scrollFraction` | Gemini |
| 5 | `agent5-analyzer.ts` | Vision Analyzer — analyze screenshots + markdown | Gemini Vision (multimodal) |
| 6 | `agent6-synthesis.ts` | Synthesis — produce 3 recommendations per section | Gemini |

Each agent receives `PipelineContext` (accumulates results), returns a typed result, and throws `AgentError` (from `lib/agents/errors.ts`) on failure.

All Gemini system prompts live in `lib/agents/prompts.ts` (key: `AGENT_PROMPTS`). Agent 1 uses `AGENT_PROMPTS.competitorDiscovery` for its LLM discovery leg; results are merged into the candidate map with `source: "llm-knowledge"` and `mentions: 2` base weight (entries confirmed by both Tavily and LLM get +2 boost).

**Agent 3 two-pass scraping**: `scrapePageWithRetry()` first scrapes without delay; if `isUsableMarkdown()` returns false (< 300 chars or JS-error signals), it retries with `waitFor: 8000ms` to allow client-side hydration. Returns whichever pass had more content.

**Agent 5 active prompt**: uses `AGENT_PROMPTS.sectionAnalyzerBatch` — batches all sections in a single LLM call. The `AGENT_PROMPTS.visionAnalyzer` key in `prompts.ts` is legacy and kept for reference only; it is not in the active code path.

### AI Gateway (`/lib/ai/gateway.ts`)

All LLM calls go through Vercel AI Gateway with automatic fallback chains. Model slugs are defined in the `MODELS` constant; `CHAINS` wires them with fallbacks:
- `CHAINS.flash` — Gemini 2.5 Flash → GPT-5.4-nano fallback
- `CHAINS.flashLite` — Gemini 2.5 Flash-Lite → GPT-5.4-nano fallback

To add or change a model, update `MODELS` in `gateway.ts` — no agent files need to change.

Two functions: `aiGenerate()` (text-only) and `aiGenerateMultimodal()` (text + image, used by Agent 5). Both wrap calls in `withRetry()` — up to 2 retries on transient errors (429, 503, timeout) with 1s/2s delays. The orchestrator also wraps each agent step in `withStepRetry()` (1 retry, 2s delay) for step-level resilience.

### SSE Streaming (`/lib/sse.ts`)

`createSSEStream()` returns `{ stream, writer }`. Use `writer.send(event)` and `writer.close()`. The API route sets `maxDuration = 300`.

### Types (`/lib/types/analysis.ts`)

All pipeline types are defined here. TypeScript strict mode — no `any`. Key types:

- **Pipeline data**: `ProductBrief`, `CompetitorCandidate` (has `source: string` — Tavily query label or `"llm-knowledge"`), `Competitor`, `PageData`, `ClassifiedSection` (has `scrollFraction: number` = startChar/totalLength for UI scroll ordering), `PageSections`, `SectionFinding` (has `scores: SectionScores` with 10 sub-scores across 3 groups — Communication: clarity/specificity/icpFit; Conversion: attentionRatio/ctaQuality/trustSignals; Visual: visualHierarchy/cognitiveEase/typographyReadability/densityBalance — plus `strengths/weaknesses: string[]`, `summary`, `evidence`, `confidence`), `SectionAnalysis`, `Recommendation` (has `priority: Priority`, `reasoning`, `suggestedAction`, `impact?`, `confidence?`), `Priority = "critical" | "high" | "medium"`, `OverallScores`, `AnalysisResult` (has `executiveSummary?`, `overallScores?`, `pageSections?`), `PipelineContext`
- **SSE events**: `SSEProgressEvent`, `SSECompleteEvent` (carries `quality: QualityReport`), `SSEErrorEvent` — union type `SSEEvent`
- **Stage tracking**: `AgentStage` (7 string literals), `StageStatus`, `StageState`

### Top-level Utilities (`/lib/utils.ts`)

- **`cn(...inputs)`** — Tailwind class merge via `clsx` + `tailwind-merge`. Use this everywhere instead of string concatenation for conditional classes.
- **`toSentenceCase(str)`** — Lowercases all words except the first and preserves ALL-CAPS acronyms (CTA, UI, API). Used when displaying LLM-generated labels in the UI.

### Shared Utilities (`/lib/utils/`)

- **`json-extract.ts`** — `extractJSON(text)` strips LLM preamble/postamble and returns the first JSON object or array by scanning brackets. All agents use this — never call `JSON.parse()` on raw LLM output directly.
- **`normalize-section-type.ts`** — `normalizeSectionType(raw)` converts any LLM-returned section string to the canonical camelCase `SectionType` value: strips trailing " section", camelCases multi-word inputs (`"social proof"` → `"socialProof"`, `"how it works"` → `"howItWorks"`), lowercases all-caps acronyms (`"FAQ"` → `"faq"`). Used by agents 4, 5, and 6 — always import from here, never re-implement locally.
- **`scrape-quality.ts`** — `isUsableMarkdown(md)` returns `false` if content is < 300 chars or contains JS-not-rendered signals. Used by Agent 0 (fail fast) and Agent 3 (trigger two-pass retry).
- **`ssrf.ts`** — `isUnsafeUrl(raw)` returns an error string or `null`. Allows HTTP and HTTPS, blocks private IPs (127.x, 10.x, 192.168.x, 172.16–31.x, 169.254.x), blocks non-standard ports (only 80/443 or no port). Shared by both API routes — do not duplicate this logic inline.
- **`quality-scorer.ts`** — `scoreAnalysisQuality(result)` returns a `QualityReport` with `overallQuality` (0–100) from 5 weighted signals: evidence grounding (30%), score variance (25%), specificity rate (20%), competitor presence (15%), field completeness (10%). Attached to the `complete` SSE event; only logged in non-production environments.
- **`markdown-clean.ts`** — two utilities: `stripMarkdownLinks(md)` converts `[text](url)` → `text` while **intentionally keeping bare URLs** (they count as LLM evidence); used by Agent 5 before prompt calls. `stripInlineCode(md)` removes backtick spans from AI-generated display text (UI rendering only, not pre-prompt).

### API Security (`/app/api/analyze/route.ts`)

- **Rate limiting**: In-memory IP-based, 2 requests per minute per IP
- **SSRF protection**: Both HTTP and HTTPS allowed; blocks private IPs and non-standard ports via `isUnsafeUrl()` from `lib/utils/ssrf.ts` — applied in both `/api/analyze` and `/api/validate-url`
- **CORS**: Origin header validated against host — cross-origin requests rejected

### UI

- `components/layout/header.tsx` — top nav header
- `components/analysis/` — the three main panels (form, progress, results) plus `InspirationGallery` (auto-scrolling 3D card gallery of example sites shown on the home/form view)
- `components/analysis/results/` — sub-components for the results view:
  - `SummaryCard` — arc gauge SVG (`ArcGauge`) showing overall score (0–100) with colour thresholds (≥85 green, ≥70 cyan, ≥50 orange, <50 red) + executive summary block below
  - `SectionCard` — per-section card with strengths/weaknesses tags and `InsightSlider`; shows max **1 strength and 1 weakness** per section (Agent 5 may return up to 3 of each — the top signal is intentionally selected)
  - `InsightSlider` — horizontal slider of insight cards per section; renders competitor names as inline `<a>` links with Google favicon images via `renderReasoningText()`; supports keyboard navigation (ArrowLeft/ArrowRight)
  - `SectionNavSidebar` — sticky desktop scrollspy sidebar with `MiniArc` arc score per item; mobile uses pill nav. Active section tracked via `IntersectionObserver`. Sections are ordered by `scrollFraction` (Agent 4 output) to match actual page scroll order
  - `ExportPDFButton` — lazy-loads `@react-pdf/renderer` (~750 KB) on demand, generates and downloads PDF
  - `AnalysisPDF` — `@react-pdf/renderer` document component; mirrors the results UI structure
  - `CompetitorTabSwitcher`, `RecommendationCard`, `ScoreBadge`, `SectionInsightCard`, `SkeletonSectionCard`
- `components/ui/` — shadcn/ui primitives (button, input, card, badge, separator, skeleton)
- `lib/hooks/useNotification.ts` — browser Notification API hook; fires when analysis completes while the tab is hidden; also manages tab title (`"Analyzing… • Uxio"` while running, `"✓ Analysis ready • Uxio"` on complete, then restores after 3s)
- `AnalysisForm.tsx` caches completed results in `localStorage` (key: `uxio:cache:<url>`, TTL: 2 hours). On submit, a cache hit skips the pipeline entirely and shows results instantly.
- Tailwind CSS v4 (PostCSS), Geist fonts + Instrument Serif italic (`--font-instrument-serif`), `framer-motion` for enter animations, `"use client"` on all interactive components
- `@vercel/analytics` and `@vercel/speed-insights` are wired in `app/layout.tsx`; JSON-LD `SoftwareApplication` structured data is also injected in `<head>` at layout level

### SEO

- `app/robots.ts` — Next.js `MetadataRoute.Robots` handler (allows all, points to sitemap)
- `app/sitemap.ts` — Next.js `MetadataRoute.Sitemap` handler (single root URL, weekly change frequency)
- `app/api/indexnow/route.ts` — GET endpoint that submits the site URL to the IndexNow API (`api.indexnow.org`). Key: `d4f3e2c1b0a9f8e7d6c5b4a3f2e1d0c9`, verification file at `public/d4f3e2c1b0a9f8e7d6c5b4a3f2e1d0c9.txt`
- `metadataBase` in `app/layout.tsx` resolves using `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → hardcoded fallback
- `public/llms.txt` and `public/llms-full.txt` — LLM crawler discovery files

## Environment Variables

Copy `.env.local.example` to `.env.local`:

```
FIRECRAWL_API_KEY=        # Firecrawl web scraping
TAVILY_API_KEY=           # Tavily search
GEMINI_API_KEY=           # Google Gemini 2.5 Flash / Flash-Lite
AI_GATEWAY_URL=           # Vercel AI Gateway base URL (set in Vercel dashboard for prod)
```

All keys are server-side only — never exposed to the client.

## Developer Tooling

- `.mcp.json` — registers the shadcn MCP server (`npx shadcn@latest mcp`) for component CLI integration via Claude Code

## Key Constraints

- API route runs Node.js runtime (not Edge) — Firecrawl and Gemini SDKs require it
- No server-side persistence — all pipeline data lives in memory for the duration of one request
- Agents run sequentially; Agent 3 and Agent 5 process pages in parallel internally
- Agent 3 mutates `ctx.competitors` to only include successfully scraped competitors (backups may substitute primaries)
- Screenshots are used by Agent 5 for analysis but stripped from SSE payload before sending to client
- shadcn components use `base-nova` style, neutral base color, lucide icons
- All agent prompts enforce evidence-based output: generic verbs are forbidden, every insight must cite specific copy or visual elements
- `SectionFinding` and `Recommendation` carry a `confidence` field (0–1) indicating how certain the agent is in each finding
- `@react-pdf/renderer` is a client-side dependency (~750 KB); `AnalysisPDF.tsx` has a `"use client"` directive and must only ever be accessed via `import("./AnalysisPDF")` — never import it statically from any file
- `SECTION_LABELS` mapping (`SectionType` → display string) is duplicated in `SectionCard.tsx`, `AnalysisPDF.tsx`, and `ResultsPanel.tsx` by design (each has slightly different rendering context). `AnalysisPDF.tsx` carries the most complete list (15 types: hero, navigation, features, benefits, socialProof, testimonials, integrations, howItWorks, pricing, faq, cta, footer, videoDemo, comparison, metrics) — treat it as the source of truth for valid `SectionType` values
- Client-only APIs (`sessionStorage`, `Notification`, `window`) are guarded with a module-level `isSupported = typeof window !== "undefined" && ...` constant. State that reads from these APIs must initialize to a safe default (e.g. `false`) and sync in `useEffect` — never read them inside a `useState` lazy initializer, as that causes SSR/hydration mismatch. `eslint-config-next` enforces `react-hooks/set-state-in-effect`; if you must call `setState` synchronously in an effect to sync external state, add `// eslint-disable-next-line react-hooks/set-state-in-effect` with a comment explaining why.
- `package.json` has an `"overrides": { "axios": "^1.15.0" }` entry to keep the transitive axios dependency (used by `@mendable/firecrawl-js`) patched against the NO_PROXY SSRF vulnerability — do not remove it.
- `next.config.ts` has `images.remotePatterns` allowing only `www.google.com/s2/favicons`. Any new external `<Image>` source (e.g. competitor logos) must be added here or Next.js will throw at build time.
