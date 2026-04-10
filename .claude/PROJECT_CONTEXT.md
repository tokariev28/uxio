# PROJECT CONTEXT — Uxio MVP

## What Uxio Is

Uxio is an AI-powered competitive landing page analyzer for B2B SaaS products.

Given a SaaS landing page URL, it:

- Automatically identifies 3 direct competitors.
- Scrapes full-page screenshots and structured content for all 4 pages.
- Runs a multi-agent AI pipeline to analyze each page section (hero, features, social proof, pricing, CTA, footer).
- Produces prioritized, evidence-based design recommendations as if a senior product designer reviewed the pages.

Uxio specializes in SaaS landing pages. It is not a generic SEO audit tool.

---

## Current Scope — MVP Only

For this phase we focus on a narrow but complete MVP:

- A single-page web app where the user:
  - Enters a SaaS landing page URL.
  - Clicks “Analyze”.
  - Sees real-time progress while the pipeline runs.
  - Gets a concise, structured result view.

The backend implements a 7-agent pipeline end-to-end:

| # | Name | Tools | Gemini? | Model |
|---|------|-------|---------|-------|
| 0 | Page Intelligence | Firecrawl → Gemini | ✅ | Flash-Lite |
| 1 | Multi-Signal Discovery | Tavily Search + Gemini (parallel) | ✅ | Flash-Lite |
| 2 | Competitor Validator | Gemini | ✅ | Flash-Lite |
| 3 | Scraper | Firecrawl parallel (4 URLs) | ❌ | — |
| 4 | Section Classifier | Gemini | ✅ | Flash-Lite |
| 5 | Vision Analyzer | Firecrawl screenshot → Gemini Vision | ✅ | Flash |
| 6 | Synthesis | Gemini | ✅ | Flash |

Agent system prompts → `lib/agents/prompts.ts`
Model routing constants → `AGENT_MODELS` in the same file.

**Out of scope for the MVP:**

- Comments, @mentions, or any collaboration features.
- Authentication, user accounts, organizations, or billing.
- History and re-analyze tracking.
- Exports to Figma, Slack, or other third-party tools. (PDF export is implemented via `@react-pdf/renderer`.)
- Mobile layout analysis (viewport emulation).
- Any persistent database beyond what may be required later.

The goal is a working demo that proves the end-to-end pipeline and UX in one focused flow.

---

## Tech Decisions (Locked In for MVP)

The following decisions are fixed for this MVP:

- **Frontend**
  - Next.js 16 App Router + TypeScript.
  - Tailwind CSS + shadcn/ui for UI primitives.
  - Single-page layout (no complex routing).

- **Backend**
- Next.js 15 App Router with Route Handlers (`app/api/*/route.ts`).
- Node.js runtime (not Edge) — required because Firecrawl and Gemini SDKs use Node-specific APIs.
- No separate backend service; frontend and backend live in the same Next.js repo and deploy together to Vercel.

- **AI & External APIs**
  - **Vercel AI Gateway** (`lib/ai/gateway.ts`) routes all LLM calls with automatic fallback chains: Gemini 2.5 Flash → GPT-5.4-nano and Gemini 2.5 Flash-Lite → GPT-5.4-nano.
  - **Gemini 2.5 Flash** for vision and synthesis tasks (Agents 5, 6); **Gemini 2.5 Flash-Lite** for text-only tasks (Agents 0, 1, 2, 4).
  - **Tavily Search API** for competitor discovery.
  - **Firecrawl** for full-page screenshot + markdown scraping.

- **State & Storage**
  - No persistent database for MVP.
  - All intermediate data (scraped pages, analysis outputs) live only in memory during a single request/response cycle.
  - Client-side: analysis results are cached in `localStorage` for 2 hours, keyed by URL, to avoid re-running the pipeline for the same URL (`AnalysisForm.tsx`).

- **Security**
  - All API keys stored only in server-side environment variables (e.g. Vercel env vars).
  - No secrets in client-side code or committed to the repository.
  - Scraped content and screenshots are not stored long term in MVP.

---

## Available Claude Skills & MCP (Use Them!)

These Claude Code Skills and MCP servers are installed and should be used whenever relevant:

- **shadcn MCP / shadcn-studio MCP**
  - Browse and insert production-ready UI blocks and components.
  - Use this to avoid generic “AI template” layouts and keep UI aligned with shadcn’s design language.

- **Frontend Design skill**
  - Encodes strong visual design guidelines for modern web apps (hierarchy, spacing, color use, avoiding over-styled gradients, etc.).
  - Use this to refine layout and styling when building the React UI, especially since there is no separate Figma design.

- **Vercel Web Design Guidelines + React Best Practices**
  - Use these to audit UI and React code for:
    - Accessibility (semantic HTML, contrast, keyboard nav).
    - UX issues (loading states, empty states).
    - Performance and React patterns.

- **Firecrawl skill**
  - Use to:
    - Fetch up-to-date documentation for Firecrawl, Tavily, Gemini APIs.
    - Scrape real SaaS landing pages as design and content references.

- **Superpowers**
  - Multi-agent planning and development helpers:
    - For breaking work into coherent phases.
    - For running TDD-oriented flows when helpful.

- **code-reviewer**
  - For structured code review before considering any implementation “done”.
  - Use it to check for bugs, edge cases, security issues, and maintainability.

Whenever you plan or implement a feature:

- Check if any of these Skills/MCP apply.
- Prefer using them over improvising from scratch, especially for:
  - UI design and layout (shadcn MCP, Frontend Design, Vercel guidelines).
  - Architecture and planning (Superpowers).
  - Code review (code-reviewer).

---

## How I Want You (Claude) To Work

- **Plan first, then execute**
  - For any non-trivial change, first propose a high-level plan.
  - Do not write or modify code until I explicitly confirm the plan.

- **Work in small phases**
  - Example phases:
    - Phase 1: Project scaffolding (Vite, React, TypeScript, Tailwind, shadcn/ui).
    - Phase 2: Backend API skeleton with a stubbed pipeline.
    - Phase 3: Integrate real external APIs for a single happy path.
    - Phase 4: Frontend wiring and result rendering.
    - Phase 5: Error handling, loading states, polish.

- **Be explicit about files**
  - Always state which files you plan to create or modify.
  - Keep a clear mapping from specs (in `/specs` and the PRD) to code.

- **Use installed Skills/MCP deliberately**
  - Explicitly mention which Skill/MCP you are using during:
    - Planning (e.g. Superpowers).
    - UI layout and design (shadcn MCP, Frontend Design).
    - Code review (code-reviewer).
    - API/doc research (Firecrawl).

- **Ask instead of guessing**
  - If anything about requirements, architecture, or trade-offs is unclear:
    - Ask focused clarifying questions,
    - Rather than making unstated assumptions.



## Workflow Orchestration & Task Management

### 1. Plan Mode Default

- Enter **plan mode** for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — do not keep pushing a broken approach.
- Use plan mode for verification steps, not just for building new features.
- Prefer writing detailed specs upfront to reduce ambiguity.

### 2. Subagent Strategy

- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents whenever possible.
- For complex problems, it is acceptable to “throw more compute at it” via subagents.
- Keep one task per subagent for focused execution.

### 3. Self-Improvement Loop

- After ANY correction from the user, update `tasks/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake from happening again.
- Ruthlessly iterate on these lessons until the mistake rate drops.
- At the start of a session or major phase, briefly review `tasks/lessons.md` for relevant patterns.

### 4. Verification Before Done

- Never mark a task as complete without proving that it works.
- Where relevant, compare behavior between the previous version and your changes.
- Ask yourself: “Would a staff engineer approve this?” before saying a task is done.
- Run tests, check logs, and demonstrate correctness through concrete evidence (e.g. test output, screenshots, sample responses).

### 5. Demand Elegance (Balanced)

- For non-trivial changes, pause and ask: “Is there a more elegant way to do this?”
- If a fix feels hacky, consider: “Knowing everything I know now, how would I implement the elegant solution?”
- Skip this for simple, obvious fixes — do not over-engineer trivial tasks.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing

- When given a bug report, attempt to fix it autonomously — do not ask for hand-holding.
- Point at logs, errors, failing tests, and then resolve them.
- Aim for zero context switching required from the user.
- If CI tests are failing, fix them without being told exactly how.

### Task Management Ritual

1. **Plan First**  
   - Write a plan to `tasks/todo.md` with checkable items (create the `tasks/` directory if it does not exist).
2. **Verify Plan**  
   - Check in with the user before starting implementation.
3. **Track Progress**  
   - Mark items complete in `tasks/todo.md` as you go.
4. **Explain Changes**  
   - After each phase, add a short high-level summary of what changed.
5. **Document Results**  
   - Add a brief review section to `tasks/todo.md` (what went well, what to improve).
6. **Capture Lessons**  
   - After corrections from the user, update `tasks/lessons.md` with new lessons learned.

### Core Principles

- **Simplicity First**: Make every change as simple as possible; touch the minimal amount of code needed.
- **No Laziness**: Prefer root-cause fixes over temporary patches; aim for senior engineer standards.
- **Minimal Impact**: Avoid unnecessary changes; don’t introduce unrelated diffs or regressions.