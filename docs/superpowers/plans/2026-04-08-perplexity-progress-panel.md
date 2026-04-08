# Perplexity-style Progress Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign ProgressPanel to match Perplexity's analysis style — spinner + "Working…" header, green dot for done, blue dot + monospace chips for active — with chips populated by real data (Tavily queries, scraped URLs, competitor domains) emitted live from each agent.

**Architecture:** Add `actions?: string[]` to `SSEProgressEvent`; each agent calls an `onActions` callback passed from the orchestrator; the orchestrator forwards it as a second `{ status: "running", actions }` SSE event; `AnalysisForm` merges `actions` into stage state; `ProgressPanel` renders chips. `SubStepCycler` and all shimmer/flicker/glow CSS are removed.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind CSS v4, Framer Motion, SSE streaming

---

## File Map

| File | Change |
|------|--------|
| `lib/types/analysis.ts` | Add `actions?: string[]` to `SSEProgressEvent` |
| `lib/agents/orchestrator.ts` | Thread `onActions` closures into each step |
| `lib/agents/agent0.ts` | Add `onActions?` param; emit input URL before scrape |
| `lib/agents/agent1-discovery.ts` | Add `onActions?` param; emit query strings before Tavily |
| `lib/agents/agent2-validator.ts` | Add `onActions?` param; emit candidate domains before Gemini |
| `lib/agents/agent3-scraper.ts` | Add `onActions?` param; emit all URLs before parallel scrape |
| `lib/agents/agent4-classifier.ts` | Add `onActions?` param; emit competitor domains before Gemini |
| `lib/agents/agent5-analyzer.ts` | Add `onActions?` param; emit competitor domains before analysis |
| `components/analysis/AnalysisForm.tsx` | Add `actions` to local `StageState`; read from SSE event |
| `components/analysis/ProgressPanel.tsx` | Full redesign; remove `SubStepCycler`; add spinner + dots + chips |
| `app/globals.css` | Remove `.shimmer-text`, `.flicker-text`, `.ambient-glow`, `@keyframes ambient-pulse` |

---

## Task 1: Add `actions` to SSEProgressEvent

**Files:**
- Modify: `lib/types/analysis.ts:143-148`

- [ ] **Step 1: Edit the type**

In `lib/types/analysis.ts`, change `SSEProgressEvent`:

```typescript
export interface SSEProgressEvent {
  type: "progress";
  stage: AgentStage;
  status: StageStatus;
  message: string;
  actions?: string[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds (no new errors — `actions` is optional so all existing senders still type-check).

- [ ] **Step 3: Commit**

```bash
git add lib/types/analysis.ts
git commit -m "feat: add optional actions[] to SSEProgressEvent"
```

---

## Task 2: Thread onActions through the orchestrator

**Files:**
- Modify: `lib/agents/orchestrator.ts`

The orchestrator's `AgentStep.run` closure already captures `writer`. Add an `onActions` helper per step that sends a second `running` event with the actions array.

- [ ] **Step 1: Update each step in `runPipeline`**

Replace the entire `steps` array in `lib/agents/orchestrator.ts` with:

```typescript
const steps: AgentStep[] = [
  {
    stage: "page-intelligence",
    label: "Understanding your product",
    run: async (ctx) => {
      const onActions = (actions: string[]) =>
        writer.send({ type: "progress", stage: "page-intelligence", status: "running", message: "Understanding your product…", actions });
      ctx.productBrief = await runAgent0(ctx.inputUrl, onActions);
    },
  },
  {
    stage: "discovery",
    label: "Finding competitors",
    run: async (ctx) => {
      const onActions = (actions: string[]) =>
        writer.send({ type: "progress", stage: "discovery", status: "running", message: "Finding competitors…", actions });
      ctx.candidates = await runDiscovery(ctx, onActions);
    },
  },
  {
    stage: "validation",
    label: "Validating and ranking competitors",
    run: async (ctx) => {
      const onActions = (actions: string[]) =>
        writer.send({ type: "progress", stage: "validation", status: "running", message: "Validating and ranking competitors…", actions });
      ctx.competitors = await runValidator(ctx, onActions);
    },
  },
  {
    stage: "scraping",
    label: "Scraping pages",
    run: async (ctx) => {
      const onActions = (actions: string[]) =>
        writer.send({ type: "progress", stage: "scraping", status: "running", message: "Scraping pages…", actions });
      ctx.pages = await runScraper(ctx, onActions);
    },
  },
  {
    stage: "classification",
    label: "Classifying page sections",
    run: async (ctx) => {
      const onActions = (actions: string[]) =>
        writer.send({ type: "progress", stage: "classification", status: "running", message: "Classifying page sections…", actions });
      ctx.pageSections = await runClassifier(ctx, onActions);
    },
  },
  {
    stage: "analysis",
    label: "Analyzing design patterns",
    run: async (ctx) => {
      const onActions = (actions: string[]) =>
        writer.send({ type: "progress", stage: "analysis", status: "running", message: "Analyzing design patterns…", actions });
      ctx.sectionAnalyses = await runAnalyzer(ctx, onActions);
    },
  },
  {
    stage: "synthesis",
    label: "Synthesizing recommendations",
    run: async (ctx) => {
      const synthesis = await runSynthesis(ctx, (delaySecs) => {
        writer.send({
          type: "progress",
          stage: "synthesis",
          status: "running",
          message: `Rate limit hit — retrying in ${delaySecs}s…`,
        });
      });
      ctx.recommendations = synthesis.recommendations;
      ctx.executiveSummary = synthesis.executiveSummary;
      ctx.overallScores = synthesis.overallScores;
    },
  },
];
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: TypeScript errors about `runAgent0`, `runDiscovery`, etc. not accepting a second argument — this is expected and will be fixed in Tasks 3–8.

- [ ] **Step 3: Commit (even if build fails)**

```bash
git add lib/agents/orchestrator.ts
git commit -m "feat: wire onActions callbacks through orchestrator steps"
```

---

## Task 3: agent0 — emit input URL chip

**Files:**
- Modify: `lib/agents/agent0.ts`

- [ ] **Step 1: Add `onActions` parameter and emit before scrape**

Change the function signature and add the emit call at the top of `runAgent0`:

```typescript
export async function runAgent0(
  url: string,
  onActions?: (actions: string[]) => void
): Promise<ProductBrief> {
  // Emit the URL being scraped as a chip
  try {
    onActions?.([new URL(url).hostname.replace(/^www\./, "")]);
  } catch {
    onActions?.([url]);
  }

  // ── Step 1: Firecrawl scrape ─────────────────────────────────
  const firecrawl = new FirecrawlApp({
  // ... rest of function unchanged
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: one fewer TypeScript error (agent0 now accepts second arg).

- [ ] **Step 3: Commit**

```bash
git add lib/agents/agent0.ts
git commit -m "feat(agent0): emit input URL chip via onActions"
```

---

## Task 4: agent1 — emit Tavily query chips

**Files:**
- Modify: `lib/agents/agent1-discovery.ts`

- [ ] **Step 1: Add `onActions` parameter and emit after building queries**

Change the `runDiscovery` signature and add the emit call after the `queries` array is built (currently around line 60–72):

```typescript
export async function runDiscovery(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<CompetitorCandidate[]> {
  const brief = ctx.productBrief;
  if (!brief) {
    throw new AgentError("agent1", "productBrief is missing from pipeline context");
  }

  const apiKey = process.env.TAVILY_API_KEY ?? "";

  const cvpKeyword = brief.cvpKeyword;
  const icpKeyword = brief.icpKeyword;

  const queries: Array<{ label: string; query: string }> = [
    {
      label: "alternatives",
      query: `${brief.company} alternatives SaaS ${brief.industry}`,
    },
    {
      label: "feature",
      query: `best ${cvpKeyword} software for ${icpKeyword}`,
    },
    {
      label: "g2",
      query: `site:g2.com ${brief.company} competitors`,
    },
  ];

  // Emit the actual search queries as chips
  onActions?.(queries.map((q) => q.query));

  const inputDomain = rootDomain(ctx.inputUrl);
  // ... rest of function unchanged from `const allResults = await Promise.all(` onwards
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/agents/agent1-discovery.ts
git commit -m "feat(agent1): emit Tavily query strings as chips via onActions"
```

---

## Task 5: agent2 — emit candidate domain chips

**Files:**
- Modify: `lib/agents/agent2-validator.ts`

- [ ] **Step 1: Add `onActions` parameter and emit before Gemini call**

Change the `runValidator` signature and add the emit after validating `candidates` (after the guard at line ~15):

```typescript
export async function runValidator(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<Competitor[]> {
  const { productBrief, candidates } = ctx;

  if (!productBrief) {
    throw new AgentError("agent2", "productBrief is missing from pipeline context");
  }
  if (!candidates?.length) {
    throw new AgentError("agent2", "candidates is empty or missing from pipeline context");
  }

  // Emit candidate domains as chips (cap at 8 to avoid chip overflow)
  const candidateDomains = candidates.slice(0, 8).map((c) => {
    try {
      return new URL(c.url).hostname.replace(/^www\./, "");
    } catch {
      return c.name;
    }
  });
  onActions?.(candidateDomains);

  // ── Step 1: Build user message ─────────────────────────────────
  // ... rest of function unchanged
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/agents/agent2-validator.ts
git commit -m "feat(agent2): emit candidate domains as chips via onActions"
```

---

## Task 6: agent3 — emit scrape URL chips

**Files:**
- Modify: `lib/agents/agent3-scraper.ts`

- [ ] **Step 1: Add `onActions` parameter and emit before parallel scrape**

Change `runScraper` signature and add emit after building the `urls` array (currently line ~35):

```typescript
export async function runScraper(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<PageData[]> {
  const { inputUrl, competitors } = ctx;

  if (!competitors?.length) {
    throw new AgentError("agent3", "competitors is missing from pipeline context");
  }

  const firecrawl = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY ?? "",
  });

  const urls = [inputUrl, ...competitors.map((c) => c.url)];

  // Emit hostnames of all URLs being scraped in parallel
  const hostnames = urls.map((u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  });
  onActions?.(hostnames);

  return Promise.all(
    // ... rest unchanged
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/agents/agent3-scraper.ts
git commit -m "feat(agent3): emit scrape URL chips via onActions"
```

---

## Task 7: agent4 — emit competitor domain chips

**Files:**
- Modify: `lib/agents/agent4-classifier.ts`

- [ ] **Step 1: Find the function signature and add `onActions`**

Open `lib/agents/agent4-classifier.ts`. The exported function is `runClassifier(ctx: PipelineContext)`. Change its signature and add emit before the Gemini call.

Add at the top of `runClassifier`, after any guard checks on `ctx`:

```typescript
export async function runClassifier(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<PageSections[]> {
  // existing guards...

  // Emit competitor domains being classified
  if (ctx.competitors?.length) {
    const domains = ctx.competitors.map((c) => {
      try {
        return new URL(c.url).hostname.replace(/^www\./, "");
      } catch {
        return c.name;
      }
    });
    onActions?.(domains);
  }

  // ... rest of function unchanged
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/agents/agent4-classifier.ts
git commit -m "feat(agent4): emit competitor domain chips via onActions"
```

---

## Task 8: agent5 — emit competitor domain chips

**Files:**
- Modify: `lib/agents/agent5-analyzer.ts`

- [ ] **Step 1: Find the function signature and add `onActions`**

Open `lib/agents/agent5-analyzer.ts`. The exported function is `runAnalyzer(ctx: PipelineContext)`. Same pattern as Task 7:

```typescript
export async function runAnalyzer(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<SectionAnalysis[]> {
  // existing guards...

  // Emit competitor domains being analyzed
  if (ctx.competitors?.length) {
    const domains = ctx.competitors.map((c) => {
      try {
        return new URL(c.url).hostname.replace(/^www\./, "");
      } catch {
        return c.name;
      }
    });
    onActions?.(domains);
  }

  // ... rest of function unchanged
```

- [ ] **Step 2: Verify build — should be clean now**

```bash
npm run build 2>&1 | tail -20
```

Expected: build passes with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add lib/agents/agent5-analyzer.ts
git commit -m "feat(agent5): emit competitor domain chips via onActions"
```

---

## Task 9: Update AnalysisForm to pass actions through stage state

**Files:**
- Modify: `components/analysis/AnalysisForm.tsx:41-44` (StageState), `components/analysis/AnalysisForm.tsx:117-121` (SSE consumer)

- [ ] **Step 1: Add `actions` to local StageState**

Change lines 41–44 in `AnalysisForm.tsx`:

```typescript
interface StageState {
  status: StageStatus | "pending";
  message: string;
  actions?: string[];
}
```

- [ ] **Step 2: Read `actions` from the SSE progress event**

Change the `if (event.type === "progress")` handler (around line 117–121):

```typescript
if (event.type === "progress") {
  setStages((prev) => ({
    ...prev,
    [event.stage]: {
      status: event.status,
      message: event.message,
      // Replace actions only when the event includes them;
      // preserve existing actions for the plain "done" event
      actions: event.actions ?? prev[event.stage]?.actions,
    },
  }));
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: TypeScript may complain that `ProgressPanel` `stages` prop `StageState` doesn't have `actions`. That's fixed in the next task.

- [ ] **Step 4: Commit**

```bash
git add components/analysis/AnalysisForm.tsx
git commit -m "feat: thread actions from SSE event into stage state"
```

---

## Task 10: Redesign ProgressPanel

**Files:**
- Modify: `components/analysis/ProgressPanel.tsx`

This is the largest change. Replace the file content entirely with the new design. Keep: progressive reveal logic, `AnimatePresence` entry animations, notification banner, error state, `InspirationGallery`.

Remove: `SubStepCycler`, `useReducedMotion` from substep logic, `SUB_STEPS`, `INTERVALS`, `LAST_STEP_EXTRA_PAUSE`, favicon pulse, shimmer/flicker class usage, ambient glow div.

- [ ] **Step 1: Replace the full file**

```typescript
"use client";

import { useState, useEffect } from "react";
import { XCircle, Circle } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { AgentStage, StageStatus } from "@/lib/types/analysis";
import { InspirationGallery } from "./InspirationGallery";

/* ── Static data ────────────────────────────────────────────────────── */

const STAGE_LABELS: Record<AgentStage, string> = {
  "page-intelligence": "Reading the page",
  discovery: "Finding competitors",
  validation: "Validating competitors",
  scraping: "Scraping pages",
  classification: "Classifying sections",
  analysis: "Analysing design",
  synthesis: "Synthesising insights",
};

const STAGE_ORDER: AgentStage[] = [
  "page-intelligence",
  "discovery",
  "validation",
  "scraping",
  "classification",
  "analysis",
  "synthesis",
];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ── Types ──────────────────────────────────────────────────────────── */

interface StageState {
  status: StageStatus | "pending";
  message: string;
  actions?: string[];
}

interface NotificationProps {
  showBanner: boolean;
  showConfirmation: boolean;
  onEnable: () => Promise<void>;
  onDismiss: () => void;
}

interface ProgressPanelProps {
  stages: Partial<Record<AgentStage, StageState>>;
  notification?: NotificationProps;
}

/* ── ProgressPanel ──────────────────────────────────────────────────── */

export function ProgressPanel({ stages, notification }: ProgressPanelProps) {
  const reducedMotion = useReducedMotion();

  // Progressive reveal: show stages reached + 1 upcoming
  const lastActiveIdx = STAGE_ORDER.reduce((acc, stage, idx) => {
    const s = stages[stage]?.status;
    return s === "running" || s === "done" || s === "error" ? idx : acc;
  }, -1);
  const naturalTarget = Math.min(
    Math.max(lastActiveIdx + 2, 1),
    STAGE_ORDER.length
  );
  const [visibleCount, setVisibleCount] = useState(1);
  useEffect(() => {
    setVisibleCount((prev) => Math.max(prev, naturalTarget));
  }, [naturalTarget]);

  const anyRunning = STAGE_ORDER.some((s) => stages[s]?.status === "running");

  return (
    <>
      <div className="progress-container relative w-full max-w-md mx-auto py-6">
        {/* Spinner header — visible while any stage is running */}
        {anyRunning && (
          <div className="flex items-center gap-2 mb-4">
            <div className="size-3.5 rounded-full border-[1.5px] border-border border-t-foreground/40 animate-spin flex-shrink-0" />
            <span className="text-sm text-muted-foreground italic">Working…</span>
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          {STAGE_ORDER.slice(0, visibleCount).map((stage, idx) => {
            const state = stages[stage];
            const status = state?.status ?? "pending";
            const actions = state?.actions;

            return (
              <motion.div
                key={stage}
                layout
                initial={!reducedMotion && idx > 0 ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  layout: { duration: 0.3, ease: EASE },
                  duration: 0.4,
                  ease: EASE,
                }}
              >
                {status === "done" && (
                  <div className="flex items-center gap-2.5 py-1">
                    <span className="size-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-xs text-muted-foreground/50">
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                )}

                {status === "running" && (
                  <>
                    <div className="flex items-start gap-2.5 py-2">
                      <span className="size-2 rounded-full bg-blue-500 flex-shrink-0 mt-[3px]" />
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <span className="text-sm text-foreground">
                          {STAGE_LABELS[stage]}
                        </span>
                        {actions && actions.length > 0 && (
                          <div className="border-l-2 border-border/40 pl-2.5 flex flex-wrap gap-1.5">
                            {actions.map((action) => (
                              <span
                                key={action}
                                className="font-mono text-[10.5px] text-muted-foreground/70 border border-muted-foreground/20 rounded px-1.5 py-0.5 bg-transparent"
                              >
                                {action}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {notification?.showBanner && (
                        <motion.div
                          key="notif-banner"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.3, ease: EASE }}
                          className="mb-1 rounded-md border border-border/50 bg-card/60 px-3 py-2.5"
                        >
                          <p className="text-xs text-muted-foreground mb-2">
                            Get notified when analysis is ready — even if you switch tabs
                          </p>
                          <div className="flex gap-3">
                            <button
                              onClick={notification.onEnable}
                              className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              Enable notifications
                            </button>
                            <button
                              onClick={notification.onDismiss}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Not now
                            </button>
                          </div>
                        </motion.div>
                      )}
                      {notification?.showConfirmation && (
                        <motion.p
                          key="notif-confirm"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25, ease: EASE }}
                          className="mb-1 text-xs text-green-500/80"
                        >
                          ✓ You&apos;ll be notified
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {status === "error" && (
                  <div className="flex items-center gap-2.5 py-1.5">
                    <XCircle className="size-3.5 text-destructive shrink-0" />
                    <span className="text-sm text-destructive">
                      {state?.message ?? STAGE_LABELS[stage]}
                    </span>
                  </div>
                )}

                {status === "pending" && (
                  <div className="flex items-center gap-2.5 py-1">
                    <Circle className="size-3.5 text-muted-foreground/25 shrink-0" />
                    <span className="text-sm text-muted-foreground/30">
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
      <InspirationGallery />
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -30
```

Expected: build passes. If `useReducedMotion` import from framer-motion causes issues, check framer-motion version: `cat node_modules/framer-motion/package.json | grep '"version"'`. If not exported from framer-motion, replace with the inline hook that was in the old file.

- [ ] **Step 3: Commit**

```bash
git add components/analysis/ProgressPanel.tsx
git commit -m "feat: redesign ProgressPanel with Perplexity-style spinner, dots, and chips"
```

---

## Task 11: Remove dead CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Find and remove the dead classes**

Search for and delete these blocks from `app/globals.css`:

```bash
grep -n "shimmer-text\|flicker-text\|ambient-glow\|ambient-pulse\|ai-thinking" app/globals.css
```

Remove:
- The `.shimmer-text` ruleset (uses `background-clip: text` gradient animation)
- The `.flicker-text` or `.ai-thinking` ruleset (opacity flicker for "Analyzing…")
- The `.ambient-glow` ruleset (absolute positioned pulsing background)
- The `@keyframes ambient-pulse` block

Do **not** remove `@keyframes shimmer` — it is used by the skeleton loading `.shimmer` class elsewhere.

- [ ] **Step 2: Verify build and lint**

```bash
npm run build 2>&1 | tail -10
npm run lint 2>&1 | tail -20
```

Expected: no errors, no warnings about removed classes.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "chore: remove shimmer-text, flicker-text, ambient-glow CSS — replaced by Perplexity redesign"
```

---

## Task 12: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Run a live analysis**

Submit any real URL (e.g. `https://linear.app`).

Check each stage in order:
1. Spinner + "Working…" appears immediately
2. Stage 0 (page-intelligence): chip showing `linear.app` appears
3. Stage 0 turns green dot, Stage 1 activates with blue dot
4. Stage 1 (discovery): 3 monospace Tavily query chips appear
5. Stage 2 (validation): candidate domain chips appear (up to 8)
6. Stage 3 (scraping): 4 URL hostnames appear as chips
7. Stages 4–5: 3 competitor domain chips appear each
8. Stage 6 (synthesis): blue dot + "Synthesising insights", no chips
9. All stages flip to green dots when done, spinner disappears

- [ ] **Step 3: Check no console errors**

Open browser DevTools → Console. No React key warnings, no TypeScript runtime errors.

- [ ] **Step 4: Final build check**

```bash
npm run build
```

Expected: exits 0.
