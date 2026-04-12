# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Start dev server (Turbopack, Next.js 16 default)
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
| 6 | `agent6-synthesis.ts` | Synthesis — produce 2–3 recommendations per section (dynamic) | Gemini |

Each agent receives `PipelineContext` (accumulates results), returns a typed result, and throws `AgentError` (from `lib/agents/errors.ts`) on failure.

All Gemini system prompts live in `lib/agents/prompts.ts` (key: `AGENT_PROMPTS`). Agent 1 uses `AGENT_PROMPTS.competitorDiscovery` for its LLM discovery leg; results are merged into the candidate map with `source: "llm-knowledge"` and `mentions: 2.5` base weight (entries confirmed by both Tavily and LLM get +2.5 boost). Agent 1 applies dual-layer domain filtering: exclusions are pre-computed before any API calls and passed to Tavily via `exclude_domains` (freeing all 10 result slots for real competitors), then the same filters run again post-fetch as a safety net on LLM-discovered candidates.

**Category detection** uses `productCategory` from Agent 0's structured output (enum: `vcs`, `modelHub`, `consumerAI`, `orchestration`, `docsWiki`, `other`). This replaced the previous fragile regex patterns that tested `industry + coreValueProp` against hardcoded substrings. The LLM determines the category from the full page markdown, which is far more robust. Five domain sets are filtered with category-based exceptions: `VCS_PLATFORM_DOMAINS` (github.com, gitlab.com, bitbucket.org, sourcehut.org), `MODEL_HUB_DOMAINS` (huggingface.co, kaggle.com, paperswithcode.com), `CONSUMER_AI_DOMAINS` (character.ai, perplexity.ai, poe.com, you.com), `ORCHESTRATION_DOMAINS` (langchain.com, llamaindex.ai — always excluded), and `DOCS_WIKI_DOMAINS` (notion.so, slab.com, slite.com, nuclino.com, tettra.com — filtered when category is not `docsWiki`).

Domain filtering is **subdomain-aware**: `about.gitlab.com` matches the `gitlab.com` filter, `docs.github.com` matches `github.com`, etc. The `matchesFilterSet()` helper checks both exact match and `.endsWith('.'+domain)`.

**Weighted mention scoring**: Tavily queries carry different signal strengths — `"vs"` queries (1.8x) are stronger than generic `"category"` queries (1.0x). LLM knowledge entries get 2.5x weight. This gives Agent 2's validator better differentiation when ranking candidates by market recognition.

Both `competitorDiscovery` and `competitorValidator` contain extensive **negative examples** (invalid competitor patterns — GitHub for Linear, LinkedIn for Apollo, Hugging Face for Anthropic, Intercom/Zendesk for HubSpot, etc.). Do not remove or shorten these sections — they exist because the LLM reliably hallucinates these false positives without them.

**Agent 0 keyword fallback**: If the LLM returns an empty `icpKeyword`, the code derives one by taking the first 3 substantive words from the `icp` field (filtering a common stopword set). If `cvpKeyword` is empty, it falls back to `brief.industry.toLowerCase()`. The Zod schema's `.describe()` annotations instruct the LLM inline to always infer these fields — the code fallback is a last resort.

**Agent 3 two-pass scraping**: `scrapePageWithRetry()` first scrapes without delay; if `isUsableMarkdown()` returns false (< 300 chars or JS-error signals), it retries with `waitFor: 8000ms` to allow client-side hydration. Returns whichever pass had more content.

**Agent 5 active prompt**: uses `AGENT_PROMPTS.sectionAnalyzerBatch` — batches all sections in a single LLM call. The `AGENT_PROMPTS.visionAnalyzer` key in `prompts.ts` is legacy and kept for reference only; it is not in the active code path.

**Agent 6 synthesis prompt** (`AGENT_PROMPTS.synthesis`) enforces a two-part recommendation structure: `reasoning` must be a direct comparison (minimum 2 sentences — what the competitor does vs what the input page does, then the concrete consequence for visitors), and `competitorExample` is the evidence anchor — the exact quote, metric, or visual detail that proves the point. The Zod schema uses `competitorExample` internally; Agent 6 maps it to `exampleFromCompetitor` in the TypeScript `Recommendation` type. Forbidden openers in `suggestedAction` are validated at runtime (logged warning, not hard fail).

**Agent 6 section cap (MVP)**: Before synthesis, Agent 6 filters out sections without input-page findings (MVP: only analyze what the user's site has), then caps to `MAX_SYNTHESIS_SECTIONS = 8` by ranking sections on competitive gap magnitude (sum of score deltas where competitors outperform the input). Tiebreak: lower `scrollFraction` wins (above-the-fold priority). After selecting top 8, sections are re-sorted by `scrollFraction` so the UI preserves natural page order. `ctx.sectionAnalyses` is updated to the capped set — the SSE result and UI only show sections with full analysis and recommendations. `overallScores` (arc gauge) is computed from ALL sections with input findings (not just the capped 8) so the score reflects the whole page.

**Agent 6 recommendation count**: `recsPerSection` is fixed at 2 for all sites. The value is passed to the LLM via `RECOMMENDATIONS_PER_SECTION` in the user message; the system prompt references this variable instead of a hardcoded number.

**Agent 6 input trimming**: Before sending findings to the LLM, Agent 6 strips `scores`, `score`, and `confidence` from each finding, truncates `strengths`/`weaknesses` arrays to the first element, and truncates `summary` (200 chars), `evidence.headlineText` (100 chars), `evidence.ctaText` (100 chars), `evidence.quote` (150 chars), and `evidence.visualNote` (150 chars). The separately computed `scoreGaps` provide quantitative priority signals.

**Agent 6 impact truncation**: The `impact` field is truncated to the first 2 sentences in code (split by period + whitespace) as a safeguard against LLM over-generation. The prompt constrains impact to "STRICTLY one sentence, MAX 30 words."

### AI Gateway (`/lib/ai/gateway.ts`)

All LLM calls go through Vercel AI Gateway with automatic fallback chains. Model slugs are defined in the `MODELS` constant; `CHAINS` wires them with fallbacks:
- `CHAINS.flash` — Gemini 2.5 Flash → GPT-5.4-nano fallback
- `CHAINS.flashLite` — Gemini 2.5 Flash-Lite → GPT-5.4-nano fallback

To add or change a model, update `MODELS` in `gateway.ts` — no agent files need to change.

Three functions:
- `aiGenerate()` — text-only (no longer used by active agents; kept for potential future use)
- `aiGenerateMultimodal()` — text + image (used by Agent 5)
- `aiGenerateStructured()` — Zod schema-validated structured output via AI SDK `Output.object()` (used by Agents 0, 1, 2, 4, 6). Returns typed data directly — no `extractJSON`/`jsonrepair` needed.

All three wrap calls in `withRetry()` — up to 2 retries on transient errors (429, 502, 503, 504, timeout, rate limit, overloaded, econnrefused, connection reset) with 1s/2s delays. The orchestrator also wraps each agent step in `withStepRetry()` (1 retry, immediate retry — no delay) for step-level resilience. Fatal pipeline errors are logged via `console.error("[pipeline] Fatal error:", err)` before sending the SSE error event — check server logs for the full stack trace when debugging failures.

### SSE Streaming (`/lib/sse.ts`)

`createSSEStream()` returns `{ stream, writer }`. Use `writer.send(event)` and `writer.close()`. The API route sets `maxDuration = 300`.

### Types (`/lib/types/analysis.ts`)

All pipeline types are defined here. TypeScript strict mode — no `any`. Key types:

- **Pipeline data**: `ProductCategory` (enum: `"vcs" | "modelHub" | "consumerAI" | "orchestration" | "docsWiki" | "other"`), `ProductBrief` (includes `productCategory`), `CompetitorCandidate` (has `source: string` — Tavily query label or `"llm-knowledge"`), `Competitor`, `PageData`, `ClassifiedSection` (has `scrollFraction: number` = `i / (dedupedSections.length - 1)` — section array index normalized to 0–1; derived from LLM response order, not character positions, which are unreliable), `PageSections`, `SectionFinding` (has `scores: SectionScores` with 10 sub-scores across 3 groups — Communication: clarity/specificity/icpFit; Conversion: attentionRatio/ctaQuality/trustSignals; Visual: visualHierarchy/cognitiveEase/typographyReadability/densityBalance; weighted final score computed deterministically in code: Communication ×1.5, Conversion ×1.2, Visual ×1.0 — plus `strengths/weaknesses: string[]`, `summary`, `evidence`, `confidence`), `SectionAnalysis`, `Recommendation` (has `priority: Priority`, `reasoning`, `suggestedAction`, `impact?`, `confidence?`), `Priority = "critical" | "high" | "medium"`, `OverallScores`, `AnalysisResult` (has `executiveSummary?`, `overallScores?`, `pageSections?`), `PipelineContext`
- **SSE events**: `SSEProgressEvent`, `SSECompleteEvent` (carries `quality: QualityReport`), `SSEErrorEvent` — union type `SSEEvent`
- **Stage tracking**: `AgentStage` (7 string literals), `StageStatus`, `StageState`

### Top-level Utilities (`/lib/utils.ts`)

- **`cn(...inputs)`** — Tailwind class merge via `clsx` + `tailwind-merge`. Use this everywhere instead of string concatenation for conditional classes.
- **`toSentenceCase(str)`** — Lowercases all words except the first and preserves ALL-CAPS acronyms (CTA, UI, API). Used when displaying LLM-generated labels in the UI.

### Shared Utilities (`/lib/utils/`)

- **`json-extract.ts`** — `extractJSON(text)` strips LLM preamble/postamble and returns the first JSON object or array by scanning brackets. Agent 5 (multimodal) still uses `aiGenerateMultimodal()` and pairs this with `jsonrepair` (from the `jsonrepair` package) as a recovery tier — the pattern is `JSON.parse(jsonrepair(extractJSON(text)))`, then Zod validation via `z.array(BatchSectionResultSchema).parse()`. Never call `JSON.parse()` on raw LLM output directly; never skip the `jsonrepair` tier. Agents 0, 1, 2, 4, 6 use `aiGenerateStructured()` instead, which handles validation automatically via Zod schemas.
- **`url.ts`** — `getHostname(url)` extracts hostname without `www.` prefix (returns raw input on parse failure); `getHostnameOrEmpty(url)` same but returns `""` on failure (for filtering). Replaces 19+ inline `new URL(url).hostname.replace(/^www\./, "")` patterns across agents and UI components.
- **`score.ts`** — `getScoreColor(score)` returns hex color by threshold (≥85 green, ≥70 cyan, ≥50 orange, <50 red); `getGradeLabel(score)` returns "Excellent"/"Good"/"Needs work"/"Critical". Used by all gauge and PDF components.
- **`normalize-section-type.ts`** — `normalizeSectionType(raw)` converts any LLM-returned section string to the canonical camelCase `SectionType` value: strips trailing " section", camelCases multi-word inputs (`"social proof"` → `"socialProof"`, `"how it works"` → `"howItWorks"`), lowercases all-caps acronyms (`"FAQ"` → `"faq"`). Used by agents 4, 5, and 6 — always import from here, never re-implement locally.
- **`scrape-quality.ts`** — `isUsableMarkdown(md)` returns `false` if content is < 300 chars or contains unusable-page signals (JS not rendered, 404/403 error pages, CAPTCHA/bot detection, cookie walls, Cloudflare challenges). Used by Agent 0 (fail fast) and Agent 3 (trigger two-pass retry).
- **`ssrf.ts`** — `isUnsafeUrl(raw)` returns an error string or `null`. Allows HTTP and HTTPS, blocks private IPs (127.x, 10.x, 192.168.x, 172.16–31.x, 169.254.x), blocks non-standard ports (only 80/443 or no port). Shared by both API routes — do not duplicate this logic inline.
- **`quality-scorer.ts`** — `scoreAnalysisQuality(result)` returns a `QualityReport` with `overallQuality` (0–100) from 5 weighted signals: evidence grounding (30%), score variance (25%), specificity rate (20%), competitor presence (15%), field completeness (10%). Attached to the `complete` SSE event; only logged in non-production environments.
- **`markdown-clean.ts`** — three utilities: `stripMarkdownLinks(md)` converts `[text](url)` → `text` while **intentionally keeping bare URLs** (they count as LLM evidence); used by Agent 5 before prompt calls. `stripBoilerplate(md)` removes common boilerplate lines (nav menus, cookie banners, breadcrumbs, decorative separators) from scraped markdown before sending to LLM — prevents the model from citing non-content elements as evidence; used by Agents 4 and 5. `stripInlineCode(md)` removes backtick spans from AI-generated display text (UI rendering only, not pre-prompt).

### API Security (`/app/api/analyze/route.ts`)

- **Rate limiting**: In-memory IP-based, 2 requests per minute per IP
- **SSRF protection**: Both HTTP and HTTPS allowed; blocks private IPs and non-standard ports via `isUnsafeUrl()` from `lib/utils/ssrf.ts` — applied in `/api/analyze`, `/api/validate-url`, and internally in Agent 3 (`resolveScreenshot`) and Agent 5 (`urlToBase64`) for Firecrawl-returned URLs. The validate-url route uses `redirect: "manual"` on both its HEAD and GET probes — do not change to `redirect: "follow"`, which would allow bypass via attacker-controlled 301 redirects to private IPs.
- **CORS**: Origin header validated against host — cross-origin requests rejected
- **Security headers**: `proxy.ts` sets CSP, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy, and HSTS on all responses. CSP conditionally includes `'unsafe-eval'` in `script-src` when `NODE_ENV !== "production"` — React 19 needs the Function constructor in dev mode. Production CSP omits it. CSP `img-src` allows `https://www.google.com` and `https://*.gstatic.com` — Google's favicon API (`/s2/favicons`) redirects to `t3.gstatic.com/faviconV2/...`; without the gstatic allowance, favicon images in insight cards are blocked.
- **Env validation**: `lib/env.ts` lazily validates `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`, `GEMINI_API_KEY` via Zod on first use — throws a clear error if any key is missing

### UI

- `components/layout/header.tsx` — top nav header
- `components/analysis/` — the three main panels (form, progress, results) plus `InspirationGallery` (auto-scrolling 3D card gallery of example sites shown during analysis). The gallery wrapper uses `mt-auto` inside a flex-column container to stay at the bottom of the viewport without `position: fixed` — this avoids the DevTools jump issue.
- `components/analysis/results/` — sub-components for the results view:
  - `SummaryCard` — arc gauge SVG (`ArcGauge`) showing overall score (0–100) with colour thresholds (≥85 green, ≥70 cyan, ≥50 orange, <50 red) + executive summary block below
  - `SectionCard` — per-section card with strengths/weaknesses tags and `InsightSlider`; shows max **1 strength and 1 weakness** per section (Agent 5 may return up to 3 of each — the top signal is intentionally selected)
  - `InsightSlider` — horizontal slider of insight cards per section; renders competitor names as inline `<a>` links with Google favicon images via `renderReasoningText()`; supports keyboard navigation (ArrowLeft/ArrowRight)
  - `SectionNavSidebar` — sticky desktop scrollspy sidebar with `MiniArc` arc score per item; mobile uses pill nav. Active section tracked via `IntersectionObserver`. Sections are ordered by `scrollFraction` (Agent 4 output) to match actual page scroll order
  - `ExportPDFButton` — lazy-loads `@react-pdf/renderer` (~750 KB) on demand, generates and downloads PDF
  - `AnalysisPDF` — `@react-pdf/renderer` document component; mirrors the results UI structure
  - `CompetitorTabSwitcher`, `RecommendationCard`, `ScoreBadge`, `SectionInsightCard`, `SkeletonSectionCard`
- `components/ui/` — shadcn/ui primitives (button, input, card, badge, separator, skeleton)
- `components/NotFoundContent.tsx` — `"use client"` component for the 404 page; uses `.hero-wrapper` gradient + framer-motion staggered entrance. The split exists because `app/not-found.tsx` must remain a Server Component to export `metadata`, while animations require `"use client"`. Apply the same pattern to any page that needs both `metadata` export and framer-motion.
- `lib/hooks/useNotification.ts` — browser Notification API hook; fires when analysis completes while the tab is hidden; also manages tab title (`"Analyzing… • Uxio"` while running, `"✓ Analysis ready • Uxio"` on complete, then restores after 3s). Returns `isGranted`, `isDenied`, `showBanner`, `showConfirmation`, `requestPermission`, `dismissBanner`. When permission is denied (e.g. incognito mode), `showConfirmation` is still set to `true` for 4s so the UI can show a "Notifications blocked" message instead of the button silently disappearing.
- `AnalysisForm.tsx` caches completed results in `localStorage` (key: `uxio:v{CACHE_VERSION}:cache:<url>`, TTL: 2 hours). On submit, a cache hit skips the pipeline entirely and shows results instantly. Bump `CACHE_VERSION` in `AnalysisForm.tsx` when `AnalysisResult` schema changes to auto-invalidate stale entries.
- Tailwind CSS v4 (PostCSS). Fonts: **Helvetica Now Display** loaded locally via `@font-face` in `globals.css` (weights 100–900, normal + italic; CSS var `--font-primary`); **Instrument Serif** italic loaded via `next/font/google` (`--font-instrument-serif`). Geist Mono is only a CSS fallback in `--font-mono` — it is not loaded via `next/font`. `framer-motion` for enter animations — standard easing is `[0.16, 1, 0.3, 1]` with `initial={{ opacity: 0, y: 32 }}`. `"use client"` on all interactive components.
- The `.hero-wrapper`, `.hero-content`, `.hero-heading`, `.hero-heading em`, `.hero-subtitle`, and `.hero-submit` CSS classes in `globals.css` are reusable across any full-bleed gradient page (currently used by the home page and the 404 page). `.hero-heading em` applies Instrument Serif italic automatically. `.hero-wrapper` uses `min-height: 100dvh` as the CSS baseline; both `AnalysisForm.tsx` and `NotFoundContent.tsx` lock the wrapper's `minHeight` to `window.innerHeight` on mount via a ref + `useEffect` — this prevents the gradient background from jumping when browser DevTools opens (all viewport units recalculate when the viewport shrinks, so a JS-captured pixel value is the only stable approach).
- `@vercel/analytics` and `@vercel/speed-insights` are wired in `app/layout.tsx`; JSON-LD `SoftwareApplication` structured data is also injected in `<head>` at layout level. Custom analytics events via `track()`: `analysis_started`, `analysis_completed` (with score, sections, duration_s), `analysis_failed`, `pdf_exported`
- `app/error.tsx` — client-side error boundary with retry button (`.hero-wrapper` style). `app/global-error.tsx` — root layout crash fallback (minimal inline styles, no dependencies)

### SEO

- `lib/site-url.ts` — canonical `SITE_URL` resolved from `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → hardcoded fallback. Used by `robots.ts`, `sitemap.ts`, and `indexnow/route.ts` — do not hardcode the URL in those files
- `app/robots.ts` — Next.js `MetadataRoute.Robots` handler (allows all, points to sitemap)
- `app/sitemap.ts` — Next.js `MetadataRoute.Sitemap` handler (single root URL, weekly change frequency)
- `app/opengraph-image.tsx` — Next.js OG image route (`next/og` `ImageResponse`, Edge runtime). Renders a static 1200×630 dark card with an Instrument Serif italic headline and three static score pills. Font fetched at request time from `fonts.gstatic.com`. To change the OG image update this file — do not add a static PNG.
- `app/api/indexnow/route.ts` — GET endpoint that submits the site URL to the IndexNow API (`api.indexnow.org`). Key: `d4f3e2c1b0a9f8e7d6c5b4a3f2e1d0c9`, verification file at `public/d4f3e2c1b0a9f8e7d6c5b4a3f2e1d0c9.txt`
- `metadataBase` in `app/layout.tsx` resolves using `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → hardcoded fallback
- `public/llms.txt` and `public/llms-full.txt` — LLM crawler discovery files

## Environment Variables

Copy `.env.local.example` to `.env.local`:

```
FIRECRAWL_API_KEY=        # Firecrawl web scraping
TAVILY_API_KEY=           # Tavily search
GEMINI_API_KEY=           # Google Gemini 2.5 Flash / Flash-Lite
```

`AI_GATEWAY_URL` (Vercel AI Gateway base URL) is **not** in `.env.local.example` — it is set in the Vercel dashboard for prod and pulled locally via `vercel env pull .env.local`. Required for production; local dev works without it if the AI SDK `gateway()` function can resolve the provider directly.

All keys are server-side only — never exposed to the client.

## Developer Tooling

- `.mcp.json` — registers the shadcn MCP server (`npx shadcn@latest mcp`) for component CLI integration via Claude Code

## Key Constraints

- API route runs Node.js runtime (not Edge) — Firecrawl and Gemini SDKs require it
- No server-side persistence — all pipeline data lives in memory for the duration of one request
- Agents run sequentially; Agent 3 and Agent 5 process pages in parallel internally
- **Agent 5 parallelism is intentionally asymmetric**: the input page is awaited first (sequentially), then competitor pages are started in parallel with a 600 ms stagger between each. Do not refactor this into a single `Promise.allSettled` — the sequential-first pattern prevents the input page from being rate-limited by simultaneous competitor LLM calls, and the stagger prevents burst contention on the gateway.
- Agent 3 mutates `ctx.competitors` to only include successfully scraped competitors (backups may substitute primaries)
- Screenshots are used by Agent 5 for analysis but stripped from SSE payload before sending to client
- shadcn components use `base-nova` style, neutral base color, lucide icons; `@base-ui/react` is the primitive layer (replaces `@radix-ui/react-*`) — import primitives from `@base-ui/react/<component>` when customizing or adding new `components/ui/` files
- All agent prompts enforce evidence-based output: generic verbs are forbidden, every insight must cite specific copy or visual elements
- `SectionFinding` and `Recommendation` carry a `confidence` field (0–1) indicating how certain the agent is in each finding
- `@react-pdf/renderer` is a client-side dependency (~750 KB); `AnalysisPDF.tsx` has a `"use client"` directive and must only ever be accessed via `import("./AnalysisPDF")` — never import it statically from any file
- Shared constants live in `lib/constants.ts`: `SECTION_LABELS` (SectionType → display string, 15 types), `VALID_SECTION_TYPES` (Set), `PRIORITY_ORDER`, `PRIORITY_COLORS`, `PRIORITY_STYLES`. All UI components and agents import from here — do not duplicate locally
- Client-only APIs (`sessionStorage`, `Notification`, `window`) are guarded with a module-level `isSupported = typeof window !== "undefined" && ...` constant. State that reads from these APIs must initialize to a safe default (e.g. `false`) and sync in `useEffect` — never read them inside a `useState` lazy initializer, as that causes SSR/hydration mismatch. `eslint-config-next` enforces `react-hooks/set-state-in-effect`; if you must call `setState` synchronously in an effect to sync external state, add `// eslint-disable-next-line react-hooks/set-state-in-effect` with a comment explaining why.
- `package.json` has an `"overrides": { "axios": "^1.15.0" }` entry to keep the transitive axios dependency (used by `@mendable/firecrawl-js`) patched against the NO_PROXY SSRF vulnerability — do not remove it.
- `next.config.ts` has `images.remotePatterns` allowing only `www.google.com/s2/favicons`. Any new external `<Image>` source (e.g. competitor logos) must be added here or Next.js will throw at build time. It also sets a permissive dev-only CSP via `async headers()` — React 19 needs `'unsafe-eval'` in development for the Function constructor (Turbopack call-stack reconstruction). This header is gated behind `isDev` and never sent in production.
