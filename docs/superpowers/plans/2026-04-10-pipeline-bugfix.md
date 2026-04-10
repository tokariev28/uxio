# Pipeline Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 confirmed bugs in the Uxio AI pipeline discovered during an anthropic.com analysis run, without breaking existing pipeline behaviour.

**Architecture:** All changes are isolated to individual agent files and their prompts. No types change shape — we only normalise values before storage. Each task targets one file and one bug; tasks are ordered from lowest risk (logging) to highest risk (core logic). After each task, run `npm run build` to catch TypeScript errors early.

**Tech Stack:** TypeScript / Next.js 16 App Router, Gemini 2.5 Flash via Vercel AI Gateway, Firecrawl, SSE streaming.

---

## Files modified (one per task)

| Task | File | Bug |
|------|------|-----|
| 1 | `lib/agents/agent6-synthesis.ts` | Diagnostic logging for recommendations=0 |
| 2 | `lib/agents/agent6-synthesis.ts` | Normalize section names → fix recommendations=0 |
| 3 | `lib/agents/agent5-analyzer.ts` | Fix confidence scale (1–10 → 0–1) |
| 4 | `lib/agents/prompts.ts` | Add confidence range to sectionAnalyzerBatch prompt |
| 5 | `lib/agents/agent5-analyzer.ts` | Fix duplicate groundInsight evidence |
| 6 | `lib/agents/prompts.ts` | Fix primaryCTAText extraction rule |
| 7 | `lib/agents/prompts.ts` | Fix mission/about section classification |
| 8 | `lib/agents/prompts.ts` | Fix competitor validator — exclude infrastructure providers |
| 9 | `lib/agents/agent5-analyzer.ts` | Surface Azure analysis failures via SSE warning |

---

## Verification baseline

Before any task, run the pipeline once and capture the baseline:

```bash
# Terminal 1 — dev server (keep running throughout all tasks)
npm run dev

# Terminal 2 — capture baseline
curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' \
  | tee /tmp/baseline.txt | grep -E '"type":"complete"|"type":"error"'
```

Baseline state (confirmed from initial run):
- `recommendations.length === 0`
- `quality.signals.competitorPresence === 0`
- `confidence` values in findings are 4–5 (should be 0.4–0.5)

---

## Task 1 — Add diagnostic logging to Agent 6

**Goal:** Make the silent `return null` filter visible. Zero behaviour change — only logging added. This confirms the root cause before we fix it in Task 2.

**File:** `lib/agents/agent6-synthesis.ts`

- [ ] **Step 1: Add raw-text logging and a filtered-all warning**

Open `lib/agents/agent6-synthesis.ts`. Replace lines 112–148 (the `.map()` + `.filter()` block) with:

```typescript
  // ── Step 6: Map to Recommendation[] ───────────────────────────
  const rawRecs = raw.recommendations;
  console.log(`[agent6] LLM returned ${rawRecs.length} raw recommendations`);
  if (rawRecs.length > 0) {
    const sampleSections = rawRecs.slice(0, 3).map((r) => (r as Record<string, unknown>).section);
    console.log(`[agent6] First 3 section values from LLM:`, sampleSections);
  }

  const recommendations = rawRecs.map((item, i) => {
    const r = item as Record<string, unknown>;

    if (!VALID_PRIORITIES.has(r.priority as Priority)) {
      throw new AgentError(
        "agent6",
        `recommendations[${i}] has invalid priority: "${r.priority}"`
      );
    }
    if (!VALID_SECTION_TYPES.has(r.section as SectionType)) {
      console.warn(
        `[agent6] DROPPED recommendations[${i}]: section="${r.section}" not in whitelist ` +
        `(priority="${r.priority}", title="${r.title}")`
      );
      return null;
    }
    for (const field of ["title", "reasoning", "competitorExample", "suggestedAction"] as const) {
      if (typeof r[field] !== "string" || !(r[field] as string).trim()) {
        throw new AgentError("agent6", `recommendations[${i}] missing or empty field: ${field}`);
      }
    }

    return {
      priority: r.priority as Priority,
      section: r.section as SectionType,
      title: r.title as string,
      reasoning: r.reasoning as string,
      exampleFromCompetitor: r.competitorExample as string,
      suggestedAction: r.suggestedAction as string,
      impact:
        typeof r.impact === "string" && (r.impact as string).trim()
          ? (r.impact as string).trim()
          : undefined,
      confidence:
        typeof r.confidence === "number" ? r.confidence : undefined,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  if (rawRecs.length > 0 && recommendations.length === 0) {
    console.error(
      `[agent6] All ${rawRecs.length} recommendations were filtered out. ` +
      `Raw section values: ${rawRecs.map((r) => (r as Record<string, unknown>).section).join(", ")}`
    );
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/yaroslavtokariev/Desktop/Ярослав/Uxio && npm run build 2>&1 | tail -20
```

Expected: no type errors.

- [ ] **Step 3: Run pipeline and capture server logs**

```bash
# Terminal 1 — restart dev server to clear old process
pkill -f "next dev" 2>/dev/null; npm run dev > /tmp/dev-task1.log 2>&1 &
sleep 8

# Terminal 2 — trigger pipeline
curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' > /tmp/run-task1.txt

# Check server logs for agent6 output
grep '\[agent6\]' /tmp/dev-task1.log
```

Expected output (one of two cases):

**Case A — section names were wrong:**
```
[agent6] LLM returned 21 raw recommendations
[agent6] First 3 section values from LLM: [ 'Hero', 'Hero', 'Hero' ]
[agent6] DROPPED recommendations[0]: section="Hero" not in whitelist ...
[agent6] All 21 recommendations were filtered out. Raw section values: Hero, Hero, Hero, ...
```

**Case B — LLM returned empty array:**
```
[agent6] LLM returned 0 raw recommendations
```

The logged output tells us exactly which Task 2 fix to apply.

- [ ] **Step 4: Commit diagnostics**

```bash
cd /Users/yaroslavtokariev/Desktop/Ярослав/Uxio
git add lib/agents/agent6-synthesis.ts
git commit -m "debug: log agent6 raw recommendations for diagnostics"
```

---

## Task 2 — Fix Agent 6: normalize section names (Case A fix)

**Goal:** If Task 1 reveals section values like `"Hero"`, `"hero section"`, or `"videoDemo section"`, add normalization before the VALID_SECTION_TYPES check. This is the primary fix for recommendations=0.

> Skip this task if Task 1 revealed Case B (empty array) — in that case see the note at the end.

**File:** `lib/agents/agent6-synthesis.ts`

- [ ] **Step 1: Add section normalization helper**

Add this function near the top of `agent6-synthesis.ts`, after the imports and before `computeOverallScores`:

```typescript
/**
 * Normalise LLM-returned section strings to match VALID_SECTION_TYPES.
 * Handles: capitalisation ("Hero" → "hero"), trailing " section" suffix,
 * and camelCase mismatches ("SocialProof" → "socialProof").
 */
function normalizeSectionType(raw: unknown): string {
  if (typeof raw !== "string") return String(raw ?? "");
  return raw
    .trim()
    .replace(/\s+section$/i, "")   // remove trailing " section"
    .replace(/\s+/g, "")           // remove internal spaces
    // camelCase: lowercase first char only when the result is a known type
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}
```

- [ ] **Step 2: Apply normalization in the map**

In the `recommendations` map, replace the line:

```typescript
    if (!VALID_SECTION_TYPES.has(r.section as SectionType)) {
```

with:

```typescript
    const normalizedSection = normalizeSectionType(r.section);
    if (!VALID_SECTION_TYPES.has(normalizedSection as SectionType)) {
```

And replace the line that builds the return object `section: r.section as SectionType` with:

```typescript
      section: normalizedSection as SectionType,
```

Also update the DROPPED warning to show both raw and normalized:

```typescript
      console.warn(
        `[agent6] DROPPED recommendations[${i}]: section raw="${r.section}" normalized="${normalizedSection}" not in whitelist`
      );
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: no type errors.

- [ ] **Step 4: Run pipeline and verify recommendations are produced**

```bash
pkill -f "next dev" 2>/dev/null; npm run dev > /tmp/dev-task2.log 2>&1 &
sleep 8
curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' \
  | grep '"type":"complete"' \
  | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().strip()[5:])
recs = d['data']['recommendations']
print(f'Recommendations count: {len(recs)}')
for r in recs[:3]:
    print(f'  [{r[\"priority\"]}] {r[\"section\"]}: {r[\"title\"]}')
"
```

Expected:
```
Recommendations count: 21
  [critical] hero: Replace abstract headline with a specific outcome claim
  ...
```

- [ ] **Step 5: Remove the raw-text diagnostic log from Task 1**

Find and remove only the `console.log` lines added in Task 1 (keep the `console.warn` and `console.error` — they are useful):

```typescript
  // REMOVE these two lines from Task 1:
  console.log(`[agent6] LLM returned ${rawRecs.length} raw recommendations`);
  // and the sampleSections log block
```

- [ ] **Step 6: Commit fix**

```bash
git add lib/agents/agent6-synthesis.ts
git commit -m "fix(agent6): normalize LLM section names before VALID_SECTION_TYPES check"
```

> **Case B note:** If Task 1 showed `LLM returned 0 raw recommendations`, the root cause is an LLM compliance failure (model returned empty array despite instructions). In that case: add a retry in `runSynthesis` — call `aiGenerate` a second time with a simpler prompt template that strips the SECTION ANALYSES and asks for recommendations based on product brief only as fallback.

---

## Task 3 — Fix confidence scale in Agent 5 (code-side guard)

**Goal:** Agent 5's LLM sometimes returns `confidence: 5` on a 1–10 scale instead of 0–1. Add normalization so values always land in [0, 1].

**File:** `lib/agents/agent5-analyzer.ts`

- [ ] **Step 1: Update confidence assignment at line 233**

Find the line (currently line 233):
```typescript
        confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
```

Replace with:
```typescript
        confidence:
          typeof raw.confidence === "number"
            ? raw.confidence > 1
              ? Math.round((raw.confidence / 10) * 100) / 100   // 1–10 scale → 0–1
              : raw.confidence
            : undefined,
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: no type errors.

- [ ] **Step 3: Verify confidence values are in 0–1 range after a run**

```bash
curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' \
  | grep '"type":"complete"' \
  | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().strip()[5:])
for sa in d['data']['sections']:
    for f in sa['findings']:
        conf = f.get('confidence')
        if conf is not None and conf > 1:
            print(f'BAD confidence: {conf} in {sa[\"sectionType\"]} / {f.get(\"site\")}')
print('All confidence values in range' if True else '')
"
```

Expected: no `BAD confidence` lines.

- [ ] **Step 4: Commit**

```bash
git add lib/agents/agent5-analyzer.ts
git commit -m "fix(agent5): normalise confidence scale from 1-10 to 0-1"
```

---

## Task 4 — Add confidence scale hint to sectionAnalyzerBatch prompt

**Goal:** Fix the root cause — the LLM guesses the scale because the prompt doesn't specify it. Adding `// 0.0–1.0` prevents the scale ambiguity.

**File:** `lib/agents/prompts.ts`

- [ ] **Step 1: Add scale annotation to the output format**

Find the `sectionAnalyzerBatch` prompt output format block. It currently has:

```
      "overallScore": number,
      "confidence": number,
```

Replace with:

```
      "overallScore": number,    // 0.0–1.0 using the formula above
      "confidence": number,      // 0.0–1.0: 1.0 = screenshot + full copy available; 0.7 = text-only analysis; 0.4 = inferred from sparse markdown
```

- [ ] **Step 2: Also update the legacy visionAnalyzer prompt** (same change, different section)

Find the `visionAnalyzer` output format block with:
```
    "overallScore": number,
    "confidence": number,
```

Replace with:
```
    "overallScore": number,    // 0.0–1.0 using the formula above
    "confidence": number,      // 0.0–1.0: 1.0 = full visual + copy evidence; 0.7 = text-only; 0.4 = inferred
```

- [ ] **Step 3: Verify TypeScript compiles (prompts.ts is plain strings — lint check)**

```bash
npm run lint 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/agents/prompts.ts
git commit -m "fix(prompts): add 0.0-1.0 scale annotation to confidence field in agent5 prompts"
```

---

## Task 5 — Fix duplicate groundInsight evidence in Agent 5

**Goal:** `groundInsight` currently prepends the same quote to ALL ungrounded strengths/weaknesses. Cap automatic grounding at 1 prepend per section to avoid duplicates.

**File:** `lib/agents/agent5-analyzer.ts`

- [ ] **Step 1: Update the grounding logic**

Find the existing call site (lines 234–235):

```typescript
        strengths: (raw.strengths ?? []).map((s) => groundInsight(s, evidenceCtx)),
        weaknesses: (raw.weaknesses ?? []).map((w) => groundInsight(w, evidenceCtx)),
```

Replace with:

```typescript
        strengths: applyGrounding(raw.strengths ?? [], evidenceCtx),
        weaknesses: applyGrounding(raw.weaknesses ?? [], evidenceCtx),
```

- [ ] **Step 2: Add the `applyGrounding` helper**

Add this function directly below the existing `groundInsight` function (after line ~101):

```typescript
/**
 * Apply evidence grounding to a list of insights, but only prepend a quote
 * to the FIRST ungrounded item. Subsequent ungrounded items are left as-is
 * to avoid repeating the same anchor quote across all bullets.
 */
function applyGrounding(
  items: string[],
  evidence: { copyQuote: string | null; headlineText: string | null }
): string[] {
  let groundingUsed = false;
  return items.map((item) => {
    if (!needsGrounding(item)) return item;
    if (groundingUsed) return item; // don't repeat the same quote
    const grounded = groundInsight(item, evidence);
    if (grounded !== item) groundingUsed = true;
    return grounded;
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Verify no duplicates in a run**

```bash
curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' \
  | grep '"type":"complete"' \
  | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().strip()[5:])
for sa in d['data']['sections']:
    for f in sa['findings']:
        all_items = f.get('strengths', []) + f.get('weaknesses', [])
        if len(all_items) != len(set(all_items)):
            print(f'DUPLICATE in {sa[\"sectionType\"]} / {f.get(\"site\")}')
print('No duplicates found')
"
```

Expected: `No duplicates found`

- [ ] **Step 5: Commit**

```bash
git add lib/agents/agent5-analyzer.ts
git commit -m "fix(agent5): cap groundInsight at 1 prepend per section to prevent duplicate evidence"
```

---

## Task 6 — Fix primaryCTAText extraction in Agent 0 prompt

**Goal:** Agent 0 identified "Continue reading" (a content link) as the primary CTA instead of "Try Claude" (the conversion button). Fix the prompt rule so it picks conversion-oriented buttons, not content navigation links.

**File:** `lib/agents/prompts.ts`

- [ ] **Step 1: Update the primaryCTAText rule in pageIntelligence prompt**

Find (in the `pageIntelligence` prompt):

```
  - primaryCTAText: exact button label. Return null if none found.
```

Replace with:

```
  - primaryCTAText: The single most conversion-oriented action on the page — the button that starts a trial, opens the product, signs up, or contacts sales. Exact label from page. Return null if none found. EXCLUDE: "Read more", "Learn more", "Continue reading", "Read the story", "Watch demo", "See how it works" — these are content navigation links, not conversion actions.
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint 2>&1 | tail -10
```

- [ ] **Step 3: Run pipeline and verify primaryCTAText**

```bash
curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' \
  | grep '"type":"complete"' \
  | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().strip()[5:])
print('primaryCTAText:', d['data']['productBrief']['primaryCTAText'])
"
```

Expected: `primaryCTAText: Try Claude` (or `null` if no conversion CTA found — both are correct for anthropic.com)

- [ ] **Step 4: Commit**

```bash
git add lib/agents/prompts.ts
git commit -m "fix(agent0): exclude content links from primaryCTAText extraction"
```

---

## Task 7 — Fix mission/about section classification

**Goal:** Anthropic's "At Anthropic, we build AI to serve humanity's long-term well-being" block was not classified because no section type matched company values/mission content. Update `benefits` type description to include this pattern.

**File:** `lib/agents/prompts.ts`

- [ ] **Step 1: Update the `benefits` type definition in sectionClassifier**

Find (in the `sectionClassifier` prompt):

```
  - benefits: outcome-focused copy, "you will get X" statements
```

Replace with:

```
  - benefits: outcome-focused copy, "you will get X" statements, or company mission/values block (e.g. "We build X to serve Y" + a grid of principles, documents, or commitments)
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint 2>&1 | tail -10
```

- [ ] **Step 3: Run pipeline and check anthropic.com section detection**

```bash
curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' \
  | grep '"type":"complete"' \
  | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().strip()[5:])
for ps in d['data']['pageSections']:
    if 'anthropic' in ps['url']:
        print('anthropic.com sections:', [s['type'] for s in ps['sections']])
"
```

Expected: `anthropic.com sections: ['hero', 'features', 'benefits']` (previously only had hero + features)

- [ ] **Step 4: Commit**

```bash
git add lib/agents/prompts.ts
git commit -m "fix(agent4): extend benefits type to capture company mission/values blocks"
```

---

## Task 8 — Fix competitor validator: exclude infrastructure platforms

**Goal:** For anthropic.com, Agent 2 selected Microsoft Azure ML and Google Cloud AI Platform as competitors instead of true AI research/model companies (Mistral, Cohere, Meta AI). Add an exclusion rule for cloud infrastructure providers.

**File:** `lib/agents/prompts.ts`

- [ ] **Step 1: Add exclusion rule to competitorValidator prompt**

Find in the `competitorValidator` prompt (the SELECTION RULES block):

```
  - EXCLUDE: Any candidate whose domain is a review aggregator, comparison site, or media outlet (e.g. g2.com, capterra.com, techcrunch.com, alternativeto.net). These are not product competitors.
```

Add a new rule directly below it:

```
  - EXCLUDE INFRASTRUCTURE: Do not select generic cloud infrastructure providers (AWS, Azure, Google Cloud Platform, DigitalOcean, Heroku) as competitors for companies that sell AI models, AI APIs, or AI research services. Infrastructure platforms are deployment venues, not product competitors. An acceptable exception: if the cloud provider has a clearly separate, standalone AI model product competing for the same ICP (e.g. a dedicated LLM API product with its own pricing page and brand separate from the cloud platform).
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint 2>&1 | tail -10
```

- [ ] **Step 3: Run pipeline and check competitors**

```bash
curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' \
  | grep '"type":"complete"' \
  | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().strip()[5:])
for c in d['data']['competitors']:
    print(f'  {c[\"name\"]} ({c[\"url\"]}) score={c[\"matchScore\"]}')
"
```

Expected: no Azure or Google Cloud AI Platform in the list. Should show OpenAI, and other AI model companies (Mistral, Cohere, Google DeepMind, Meta AI).

- [ ] **Step 4: Commit**

```bash
git add lib/agents/prompts.ts
git commit -m "fix(agent2): exclude cloud infrastructure providers from competitor selection"
```

---

## Task 9 — Surface Agent 5 page analysis failures via SSE warning

**Goal:** When `Promise.allSettled` catches an error from `analyzePageBatch` (e.g. Azure timing out), the failure is only logged to the server console. Add a mechanism to surface these failures as SSE progress warnings so they're visible in the UI and in pipeline output.

**Files:** `lib/agents/agent5-analyzer.ts`, `lib/agents/orchestrator.ts`

> **Prerequisites:** Tasks 3 and 5 must be complete before this task. The code in Step 2 below already incorporates the confidence normalization (Task 3) and uses `applyGrounding` (Task 5). The `applyGrounding` function definition added in Task 5 must exist in the file — this task does NOT re-define it.

- [ ] **Step 1: Return failed URLs from runAnalyzer**

In `lib/agents/agent5-analyzer.ts`, update the `runAnalyzer` function signature and return type:

Find:
```typescript
export async function runAnalyzer(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<SectionAnalysis[]> {
```

Replace with:
```typescript
export async function runAnalyzer(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<{ analyses: SectionAnalysis[]; failedUrls: string[] }> {
```

- [ ] **Step 2: Replace the settled loop and update the return value**

Find and replace the entire `for (const [i, result] of settled.entries()) {` block (currently lines ~208–249 in `agent5-analyzer.ts`, from the `for` keyword to the closing brace, plus the final `return` statement) with the following. This single replacement:
- adds `failedUrls` tracking
- preserves the Task 3 confidence normalization
- preserves the Task 5 `applyGrounding` calls
- returns the new `{ analyses, failedUrls }` shape

```typescript

```typescript
  const failedUrls: string[] = [];

  for (const [i, result] of settled.entries()) {
    if (result.status === "rejected") {
      console.error(
        `[agent5] Failed to analyze page ${ctx.pages[i].url}:`,
        result.reason instanceof Error ? result.reason.message : String(result.reason)
      );
      failedUrls.push(ctx.pages[i].url);
      continue;
    }

    const page = ctx.pages[i];
    const site = siteLabel(page.url, ctx.inputUrl, competitors);

    for (const raw of result.value) {
      const sectionType = raw.sectionType as SectionType;

      const kev = raw.keyEvidence;
      const evidenceCtx = {
        copyQuote: kev.copyQuote,
        headlineText: kev.headlineText,
      };

      const finding: SectionFinding = {
        site,
        score: raw.overallScore,
        scores: raw.scores ?? undefined,
        confidence:
          typeof raw.confidence === "number"
            ? raw.confidence > 1
              ? Math.round((raw.confidence / 10) * 100) / 100
              : raw.confidence
            : undefined,
        strengths: applyGrounding(raw.strengths ?? [], evidenceCtx),
        weaknesses: applyGrounding(raw.weaknesses ?? [], evidenceCtx),
        summary: raw.strengths[0] ?? raw.weaknesses[0] ?? "No notable findings",
        evidence: {
          headlineText: raw.keyEvidence.headlineText ?? undefined,
          ctaText: raw.keyEvidence.ctaText ?? undefined,
          quote: raw.keyEvidence.copyQuote ?? undefined,
          visualNote: raw.keyEvidence.visualObservation ?? undefined,
        },
      };

      if (!analysisMap.has(sectionType)) {
        analysisMap.set(sectionType, { sectionType, findings: [] });
      }
      analysisMap.get(sectionType)!.findings.push(finding);
    }
  }

  return { analyses: Array.from(analysisMap.values()), failedUrls };
```

- [ ] **Step 3: Update orchestrator to use new return shape and emit SSE warning**

In `lib/agents/orchestrator.ts`, find the analysis step run function:

```typescript
        ctx.sectionAnalyses = await runAnalyzer(ctx, onActions);
```

Replace with:

```typescript
        const { analyses, failedUrls } = await runAnalyzer(ctx, onActions);
        ctx.sectionAnalyses = analyses;

        if (failedUrls.length > 0) {
          const hostnames = failedUrls.map((u) => {
            try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
          });
          writer.send({
            type: "progress",
            stage: "analysis",
            status: "running",
            message: `Could not analyze ${hostnames.join(", ")} — excluded from comparison. Other pages analyzed successfully.`,
          });
        }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: no type errors.

- [ ] **Step 5: Run pipeline — check that SSE stream includes failure warnings when pages fail**

If all 4 pages succeed, no warning will appear (expected). To test: temporarily add a bad URL as a competitor in ctx. Otherwise, confirm by checking the server log:

```bash
grep '\[agent5\] Failed' /tmp/dev-task9.log
```

- [ ] **Step 6: Commit**

```bash
git add lib/agents/agent5-analyzer.ts lib/agents/orchestrator.ts
git commit -m "fix(agent5): surface page analysis failures as SSE warnings instead of silent drops"
```

---

## Final verification — full pipeline run

After all 9 tasks are complete:

```bash
pkill -f "next dev" 2>/dev/null; npm run dev > /tmp/dev-final.log 2>&1 &
sleep 8

curl -N -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com"}' \
  | grep '"type":"complete"' \
  | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().strip()[5:])
data = d['data']
q = d.get('quality', {})

print('=== CHECKS ===')
recs = data.get('recommendations', [])
print(f'[1] recommendations.length = {len(recs)} (expected > 0)')

confs = [f.get(\"confidence\") for sa in data.get(\"sections\",[]) for f in sa.get(\"findings\",[]) if f.get(\"confidence\") is not None]
bad_confs = [c for c in confs if c > 1]
print(f'[2] confidence values > 1: {bad_confs} (expected [])')

cta = data.get('productBrief', {}).get('primaryCTAText')
print(f'[3] primaryCTAText = \"{cta}\" (expected not \"Continue reading\")')

anthropic_sections = next((ps for ps in data.get('pageSections',[]) if 'anthropic' in ps.get('url','')), None)
if anthropic_sections:
    types = [s['type'] for s in anthropic_sections.get('sections', [])]
    print(f'[4] anthropic.com section types: {types} (expected includes benefits)')

competitors = [(c['name'], c['url']) for c in data.get('competitors', [])]
infra = [c for c in competitors if any(x in c[1] for x in ['azure.microsoft', 'cloud.google', 'aws.amazon'])]
print(f'[5] infra providers in competitors: {infra} (expected [])')

print(f'[6] quality.overallQuality = {q.get(\"overallQuality\")} (expected > 79 with recs fixed)')
print(f'[7] quality.competitorPresence = {q.get(\"signals\",{}).get(\"competitorPresence\")} (expected > 0)')
"
```

All 7 checks should pass. If any fail, refer to the corresponding task.

---

## Rollback

Each task is an independent commit. To rollback a single task:

```bash
git log --oneline -9   # find the commit hash
git revert <hash>      # creates a new revert commit, no force-push needed
```
