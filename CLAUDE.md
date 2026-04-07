# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Start dev server
npm run build   # Production build
npm run lint    # ESLint check
npm start       # Production server
```

No test suite is configured.

## Architecture

Uxio is a Next.js 16 App Router app that analyzes a competitor's website via a 7-agent AI pipeline. The entire app is a single API route + SSE stream — no database, no auth, no persistence.

### Request Flow

1. User submits a URL in `AnalysisForm.tsx`
2. `POST /api/analyze` (route.ts) opens an SSE stream and runs `runPipeline()`
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
| 3 | `agent3-scraper.ts` | Scraper — scrape 4 competitor URLs in parallel | Firecrawl |
| 4 | `agent4-classifier.ts` | Section Classifier — identify page sections | Gemini |
| 5 | `agent5-analyzer.ts` | Vision Analyzer — analyze screenshots | Firecrawl screenshots + Gemini Vision |
| 6 | `agent6-synthesis.ts` | Synthesis — produce top 5 recommendations | Gemini |

Each agent receives `PipelineContext` (accumulates results), returns a typed result, and throws `AgentError` on failure.

All Gemini system prompts live in `lib/agents/prompts.ts` (key: `AGENT_PROMPTS`). Model selection per agent is in `AGENT_MODELS` (Flash vs Flash-Lite).

### SSE Streaming (`/lib/sse.ts`)

`createSSEStream()` returns `{ stream, writer }`. Use `writer.send(event)` and `writer.close()`. The API route sets `maxDuration = 60` to keep the connection alive.

### Types (`/lib/types/analysis.ts`)

All pipeline types are defined here: `ProductBrief`, `Competitor`, `PageData`, `ClassifiedSection`, `SectionFinding`, `Recommendation`, `PipelineContext`, `SSEEvent`. TypeScript strict mode — no `any`.

### UI

- `components/analysis/` — the three main panels (form, progress, results)
- `components/ui/` — shadcn/ui primitives (button, input, card, badge, separator, skeleton)
- Tailwind CSS v4 (PostCSS), Geist fonts, `"use client"` on all interactive components

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
- Agents run sequentially; Agent 3 scrapes 4 URLs in parallel internally
- shadcn components use `base-nova` style, neutral base color, lucide icons
