# Perplexity-style Progress Panel

**Date:** 2026-04-08
**Status:** Approved

## Context

The current `ProgressPanel` shows analysis stages as a vertical list with a shimmer-animated active title and cycling sub-step text. While functional, it lacks the visual clarity and real-time transparency of tools like Perplexity, which show exactly what's happening at the sub-action level (search queries, URLs being fetched). The goal is to redesign the panel to match Perplexity's style: a spinner header, green dot for done stages, blue dot for the active stage, and monospace outline chips showing real data from the pipeline (actual Tavily queries, scraped URLs, competitor names).

## Visual Design

### Chrome
- **Header:** CSS spinner (circle with partial border, rotating) + italic "Analyzing…" text in muted gray
- **Done stages:** small filled green dot + stage label in light gray (`text-muted-foreground/50`)
- **Active stage:** small filled blue dot + stage label in foreground color
- **Pending stages:** hidden (progressive reveal unchanged)
- **Chips:** monospace font, transparent background, single light border (`#e4e4e1`), muted text. No label above chips — they appear directly under the active stage description, indented with a left border line.

### Chip section layout
```
• Finding competitors
│ [ yourproduct alternatives 2025 ] [ tools like yourproduct ] [ yourproduct vs G2 ]
```
The `│` is a `border-left: 2px solid #ebebea` on a wrapper div, indented 17px from the blue dot.

### Removed elements
- Pulsing favicon icon (replaced by CSS spinner in header)
- `shimmer-text` CSS animation on active stage title
- `flicker-text` "Analyzing…" header
- `SubStepCycler` component and cycling sub-step text
- Ambient glow div

## SSE Protocol Change

Add one optional field to `SSEProgressEvent` in `lib/types/analysis.ts`:

```typescript
export interface SSEProgressEvent {
  type: "progress";
  stage: AgentStage;
  status: StageStatus;
  message: string;
  actions?: string[];   // chip content — real data from the agent
}
```

The frontend merges the latest `actions` array into per-stage state and renders chips when non-empty. A second `running` event with `actions` replaces the initial one (frontend always uses the last received value per stage).

## Agent Changes

Each agent that has meaningful sub-action data calls an `onActions` callback passed from the orchestrator. The orchestrator forwards it as a second `{ status: "running", actions }` SSE event for that stage.

| Stage | Agent | `actions` content | Timing |
|-------|-------|-------------------|--------|
| page-intelligence | agent0 | `[inputUrl]` | before Firecrawl call |
| discovery | agent1 | `[query1, query2, query3]` (actual Tavily strings) | after queries are built, before search |
| validation | agent2 | `candidateDomains[]` (all discovered candidates) | before Gemini scoring call |
| scraping | agent3 | `[inputUrl, competitor1, competitor2, competitor3]` (4 URLs) | before parallel scrape |
| classification | agent4 | `[competitor1, competitor2, competitor3]` (top 3 domains) | before Gemini call |
| analysis | agent5 | `[competitor1, competitor2, competitor3]` (top 3 domains) | before screenshot analysis |
| synthesis | agent6 | none — no chips for pure LLM step | — |

### `onActions` signature

```typescript
type OnActions = (actions: string[]) => void;
```

Passed as an optional second argument to each agent function. Agents that don't support it ignore it.

### Orchestrator pattern

```typescript
const emitActions = (stage: AgentStage, actions: string[]) =>
  writer.send({ type: "progress", stage, status: "running", message: STAGE_MESSAGES[stage], actions });

await runAgent1Discovery(context, (actions) => emitActions("discovery", actions));
```

## Frontend Changes — ProgressPanel

### State shape
Add `actions` to `StageState`:
```typescript
interface StageState {
  status: StageStatus | "pending";
  message: string;
  actions?: string[];
}
```

### Render structure (running stage)
```tsx
// Header (once, when any stage is running)
<div className="flex items-center gap-2 mb-4">
  <div className="spinner" />   {/* CSS only, no framer-motion */}
  <span className="text-sm text-muted-foreground italic">Analyzing…</span>
</div>

// Done stage
<div className="flex items-center gap-2.5 py-1">
  <span className="size-2 rounded-full bg-green-500 shrink-0" />
  <span className="text-xs text-muted-foreground/50">{STAGE_LABELS[stage]}</span>
</div>

// Active stage
<div className="py-2">
  <div className="flex items-start gap-2.5">
    <span className="size-2 rounded-full bg-blue-500 shrink-0 mt-1" />
    <span className="text-sm text-foreground">{STAGE_LABELS[stage]}</span>
  </div>
  {actions?.length > 0 && (
    <div className="ml-[17px] pl-[9px] border-l-2 border-border/40 mt-1.5 flex flex-wrap gap-1.5">
      {actions.map(a => (
        <span key={a} className="font-mono text-[10.5px] text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
          {a}
        </span>
      ))}
    </div>
  )}
</div>
```

### Removed components/hooks
- `SubStepCycler` component — deleted entirely
- `useReducedMotion` hook — keep for framer-motion layout animations, but remove from sub-step logic
- CSS classes: `shimmer-text`, `flicker-text`, `ambient-pulse`, `ambient-glow` — remove from globals.css and component

### Kept from current implementation
- `AnimatePresence` + `motion.div` with `layout` prop for stage entry animations
- Progressive reveal logic (`visibleCount`, `naturalTarget`)
- Notification banner (unchanged)
- Error state rendering

## Files to Modify

| File | Change |
|------|--------|
| `lib/types/analysis.ts` | Add `actions?: string[]` to `SSEProgressEvent` |
| `lib/agents/orchestrator.ts` | Pass `onActions` callback to each agent, emit second running event |
| `lib/agents/agent0.ts` | Call `onActions([inputUrl])` before Firecrawl |
| `lib/agents/agent1-discovery.ts` | Call `onActions([q1, q2, q3])` after building queries |
| `lib/agents/agent2-validator.ts` | Call `onActions(candidateDomains)` before scoring |
| `lib/agents/agent3-scraper.ts` | Call `onActions(urlsToScrape)` before parallel fetch |
| `lib/agents/agent4-classifier.ts` | Call `onActions(competitorDomains)` before Gemini |
| `lib/agents/agent5-analyzer.ts` | Call `onActions(competitorDomains)` before screenshots |
| `components/analysis/ProgressPanel.tsx` | Full visual redesign per spec above |
| `app/globals.css` | Remove `shimmer-text`, `flicker-text`, `ambient-pulse` keyframes |

## Verification

1. Run `npm run dev`, submit a URL
2. Confirm spinner + "Analyzing…" appears at top when analysis starts
3. Stage 0: chip with input URL appears
4. Stage 1: 3 monospace Tavily query chips appear as discovery runs
5. Stage 2: candidate domain chips appear before ranking
6. Stage 3: 4 URL chips appear when scraping begins
7. Stages 4–5: competitor domain chips appear
8. Stage 6: no chips, just "Synthesising insights" with blue dot
9. As each stage completes, green dot replaces blue dot, chips disappear
10. `npm run build` passes with no TypeScript errors
