# PRD: Uxio — Competitive Landing Page Analyzer

**Author:** Yaroslav Tokariev — Product Designer / AI Design Engineer  
**Date:** April 2026  
**Status:** Shipped — MVP

---

## The Problem Worth Solving

Designers and product teams regularly need to answer one question: *"How does our landing page compare to what competitors are doing?"*

Answering it properly today means 2–4 hours of manual work — capturing screenshots, writing notes, trying to be consistent across 4–5 pages at once. Most teams skip it, or do it once and never revisit. There's no structured framework, no consistent criteria, and no way to defend a design decision with data when a stakeholder pushes back.

Three capabilities have recently converged to make this automatable:
- **Vision models** can now analyze layout, hierarchy, and messaging from a screenshot with near-expert accuracy
- **Web scraping APIs** can return a full-page screenshot and structured content in a single call — including JavaScript-rendered pages that blocked this approach until recently
- **AI search APIs** can execute multi-signal competitive research in seconds

The gap Uxio fills: existing tools (SimilarWeb, SEMrush) measure traffic and SEO. None of them evaluate *design quality, messaging clarity, or conversion architecture* from a product design perspective. Uxio thinks like a senior designer, not an analytics tool.

---

## Who This Is For

**Primary:** Product Designer at a SaaS company (Seed to Series B). Reviews competitors before redesigns, needs evidence to defend decisions, doesn't have 3 hours before a design sprint.

**Secondary:** Growth marketers running A/B tests who need directional benchmarks. PMs building competitive battle cards. Founders validating their positioning against category leaders.

**Out of scope:** Non-SaaS products, e-commerce, blogs. The rubric is tuned specifically to SaaS landing page conversion patterns — that specialization is what makes it useful, not generic.

---

## Jobs to Be Done

| Job | When | Current alternative |
|-----|------|---------------------|
| See what patterns top competitors use before a redesign | Monthly | Manual screenshot review (2–3 hrs) |
| Defend a design decision to a stakeholder with evidence | Weekly | None — decisions are subjective |
| Understand what a competitor's redesign changed and why | Ad hoc | Manually visiting their site |
| Get up to speed on a new company's competitive landscape | On joining | Manual research + case study reading |
| Align a team on design changes with shared context | Weekly | Figma comments on pasted screenshots |

---

## Five Hard Questions I Had to Answer

These were the real design problems. The answers shaped everything else.

---

### 1. How do you define "competitor"?

Not "what tools does this company mention" — that's too narrow and too easy to game. A true competitor is a product that targets the **same buyer, for the same job, at the same market tier**.

I operationalized this as four scoring axes: same ICP (who buys it), same job-to-be-done (why they buy it), same value proposition shape (what outcome they promise), same market segment (SMB vs mid-market vs enterprise). A weighted average across these four gives each candidate a match score from 0 to 1. Anything below 0.7 is either filtered out or flagged as an adjacent competitor.

This matters because a generic "alternatives list" will surface tools that share a category name but serve completely different buyers — which produces useless analysis. Apollo.io's real competitors aren't every "sales tool" on G2; they're the specific products an SDR team would evaluate *instead of* Apollo.

---

### 2. Where does competitor data come from, and how do you weigh it?

Two independent sources run in parallel and cross-validate each other.

**Tavily Search** runs 5 parallel queries built from the product brief: alternatives searches, category leader lists, feature comparison queries, "X vs" pages, and "best tools for [buyer type]" searches. Each match increments a confidence count.

**LLM knowledge discovery** runs simultaneously — the model surfaces the most likely direct competitors based on its training knowledge. These results get a higher base weight than single-Tavily matches, because they represent a stronger prior signal.

The merge rule: candidates confirmed by both sources score significantly higher. A competitor appearing in 3 Tavily searches AND named by the LLM is a much stronger signal than one that appeared in a single search alone.

Why this matters: any single source is unreliable. Tavily can miss market leaders for niche verticals. LLM training data goes stale. The cross-validation catches what either source would miss alone — and the scoring makes the confidence level explicit, not hidden.

---

### 3. What makes a landing page "good"? Who decides the criteria?

This is the hardest question and the one most tools answer badly.

The goal isn't to evaluate "design quality" in the abstract — that's subjective and useless for the people trying to make decisions. The goal is to evaluate **conversion-relevant design quality**: the specific patterns that research and industry practice have shown to affect whether a B2B SaaS visitor becomes a lead.

The rubric has 10 axes across three groups:

**Communication** (weighted highest) — because message clarity is the highest-leverage variable for SaaS conversion:
- *Clarity:* does the visitor understand who this is for and what it does within 5 seconds?
- *Specificity:* measurable outcomes ("2× pipeline") vs. aspirational claims ("grow faster")?
- *ICP Fit:* does the language match the actual buyer's sophistication level?

**Conversion Architecture** — the structural choices that drive action:
- *Attention Ratio:* one dominant CTA vs. competing visual weights?
- *CTA Quality:* outcome-oriented copy vs. "Learn more"?
- *Trust Signals:* logos + testimonials + numbers above the fold, or scattered?

**Visual Quality** — supporting execution:
- *Visual Hierarchy, Cognitive Ease, Typography Readability, Density Balance*

The formula weights Communication at 1.5×, Conversion at 1.2×, and Visual at 1.0× — because a page with mediocre visuals but exceptional clarity will almost always outperform a beautiful page with a weak value proposition. This weighting is a product decision, not a technical one.

Every insight must reference specific copy or a named visual element. "Add social proof" with no evidence isn't an insight — it's noise.

---

### 4. One screenshot or sections? One agent or many?

**Sections, not one screenshot.** A full landing page screenshot fed to a vision model produces surface-level observations — the model sees the page as a whole but can't reason carefully about the hero's CTA specificity while also evaluating the pricing section's friction signals. The context is too diffuse.

But completely separate calls per section lose spatial context — a model analyzing the hero in isolation doesn't know that the social proof is buried below the fold, which is directly relevant to evaluating trust signal placement.

**The solution: batch analysis per page.** Agent 5 receives the full-page screenshot alongside all section content in a single call. The screenshot provides spatial awareness and visual context; the structured section markdown enables precision per section. One LLM call per page — not one per section, not one for the whole pipeline.

**Multiple specialized agents, not one general agent.** A single "analyze this page" prompt would need to understand product markets, run web searches, evaluate design quality, synthesize cross-competitor patterns, and generate recommendations — all in one context window, with no separation of concerns. Quality degrades across every dimension when a prompt tries to do too many things.

Instead, each agent does one job with full context for that job:

| Agent | Job |
|-------|-----|
| 0 — Page Intelligence | Understands the product: extracts company, ICP, value prop, key features |
| 1 — Discovery | Finds competitor candidates from 5 parallel searches + LLM knowledge |
| 2 — Validator | Scores and ranks candidates on 4 alignment axes; selects top 3 |
| 3 — Scraper | Captures all 4 pages in parallel with JS-rendered page retry |
| 4 — Classifier | Identifies which sections are present and where they sit in scroll order |
| 5 — Vision Analyzer | Analyzes each page: full screenshot + section content in one batch call |
| 6 — Synthesis | Generates 3 recommendations per section with named competitor examples |

Failures are isolated. Each agent's output is inspectable. Prompts can be refined per task without affecting others.

---

### 5. How do you handle a 2–4 minute AI workflow without losing the user?

The naive solution — a loading spinner — would see most users abandon after 30 seconds.

My approach: make the wait feel **productive and transparent**, not hidden.

The backend streams real-time progress events as each agent completes. The frontend shows a 7-stage progress panel where each stage transitions from pending → active (with a live indicator and named action chips) → done. The user sees *"Validating competitors: apollo.io, outreach.io, salesloft.com"* — not a generic loading bar.

Simultaneously, an **InspirationGallery** of 20 curated SaaS landing pages plays during the wait — a 3D auto-scrolling carousel with brief design annotations on each site. It's contextually relevant (you're about to analyze a landing page, here are some of the best ones) and makes the wait feel active rather than wasted.

For returning users: results are cached in the browser for 2 hours per URL. The same analysis loads instantly without re-running the pipeline.

On the technical side: the analysis runs as a real-time stream with a 5-minute execution ceiling. This avoids the complexity of a background job queue while keeping the connection alive for the full pipeline duration.

---

### 6. What control should users have?

**MVP decision: minimal control, maximum autonomy.** The pipeline is fully automated — submit a URL, get results. No confirmation steps, no manual competitor review before analysis runs.

This was a deliberate choice, not an omission. The product's core value is *instant* intelligence. Adding a "confirm these competitors?" step before analysis starts adds friction to every single use — and most users don't have strong priors about who their competitors should be (that's partly why they're running the analysis in the first place).

**What I'd add with more time:** a lightweight competitor review step between discovery and scraping, surfacing the top candidates with match scores and a simple approve/swap UI. Not blocking — with a 10-second timeout that auto-proceeds if the user doesn't interact. This gives power users control while preserving the instant experience for everyone else.

---

## Full Feature Vision

### Must-Have (for Uxio to be a real product)

- Autonomous 7-agent pipeline, fully automated from URL to results
- Multi-signal competitor discovery with source cross-validation and confidence scoring
- Full-page screenshot capture with automatic retry for JavaScript-rendered pages
- 10-axis design rubric with weighted scoring groups
- Evidence-grounded findings — every insight tied to specific copy or visual proof
- Confidence levels on every finding
- Section navigation ordered by actual page scroll position, not a fixed template
- Shareable report link (read-only, no login required)
- PDF export of the full analysis report

### Should-Have (high value, needs foundation work first)

- User accounts and authentication — the prerequisite for all history and collaboration features
- Re-analyze flow: re-run on the same URL, surface what changed since last time
- Manual competitor override before the pipeline runs
- Inline team comments on specific insights
- Report history per account

### Could-Have (later phases)

- Historical diff view: track how competitor pages evolve over time
- Slack integration: post analysis summary to a channel on completion
- Figma integration: push insights as comments directly onto design frames
- Benchmark scoring: compare section scores against anonymized category data
- @mentions with email notifications

### Won't Have (out of scope)

- SEO or performance auditing — a different job, a different tool
- Behavior analytics (heatmaps, scroll maps) — requires instrumentation on the target site
- Non-SaaS content types — the rubric wouldn't apply

---

## Technical Architecture

### The Pipeline

Seven sequential agents, each doing one job. Each receives a shared context object that accumulates results throughout the run.

```
URL submitted
    │
    ▼
Agent 0 — understand the product
    Reads the page, extracts a structured brief: company, industry,
    ideal customer, value proposition, key features, pricing signals.
    This brief drives every downstream step — search queries,
    competitor scoring, and the analysis lens all derive from it.
    │
    ▼
Agent 1 — find competitor candidates
    Runs 5 parallel search queries + LLM knowledge discovery simultaneously.
    Cross-validates both sources: candidates appearing in both get
    a significantly higher confidence score.
    │
    ▼
Agent 2 — score and select
    Evaluates each candidate on 4 alignment axes (same buyer, same job,
    same outcome promise, same market tier). Selects top 3 as primaries,
    keeps positions 4–5 as backup in case a primary site can't be scraped.
    │
    ▼
Agent 3 — capture all pages (4 in parallel)
    Scrapes full-page screenshots + structured content for the input URL
    and all 3 competitors simultaneously. For JavaScript-heavy pages that
    don't load on first request, retries with extended wait time.
    If a primary fails, substitutes a backup automatically.
    │
    ▼
Agent 4 — classify sections (4 in parallel)
    Identifies which sections are present on each page from a set of
    15 types. Records where each section sits in the scroll order —
    used later so results display in the same order a human reads the page.
    │
    ▼
Agent 5 — analyze each page (4 in parallel)
    One call per page: full screenshot + all section content together.
    The screenshot provides spatial context; the structured content
    enables precision per section. Evaluates against the 10-axis rubric.
    A post-processing step verifies every finding is anchored to
    specific evidence before it's passed forward.
    │
    ▼
Agent 6 — synthesize
    Compares patterns across all 4 pages and generates 3 recommendations
    per detected section — each with a priority level, a named competitor
    example, and one concrete suggested action.
    The overall conversion score is computed from the analysis data directly,
    not generated by the AI — so it reflects the actual findings.
    │
    ▼
Results (~2–4 minutes total)
```

### Model Routing

All AI calls route through Vercel AI Gateway with automatic fallback:
- **Gemini 2.5 Flash** for vision analysis and synthesis — tasks that need stronger reasoning
- **Gemini 2.5 Flash-Lite** for extraction, search, and classification — faster and cheaper, sufficient for structured tasks
- **GPT-5.4-nano** as automatic fallback for both, triggered when primary models are rate-limited or unavailable

The gateway handles retries, fallback switching, and latency monitoring — the pipeline never calls an AI provider directly.

### Quality Gate

Every completed analysis produces a validation report scored across five signals: evidence grounding (do findings cite specific copy?), score variance (did the model differentiate or average?), specificity rate (are recommendations concrete or generic?), competitor presence (are examples named?), and field completeness (are all required fields populated?).

Warnings are logged when signals fall below threshold. This doesn't block delivery — but it surfaces systemic prompt failures early and drives targeted improvement. It's the difference between a tool that works sometimes and one you can trust consistently.

### Stack

Next.js App Router + React 19, Tailwind CSS, shadcn/ui, Framer Motion. No database — all pipeline data lives in memory for the duration of one request. All API keys server-side only, never in the client bundle. Deployed to Vercel at `https://uxio-wheat.vercel.app`.

---

## What Separates Excellent from Mediocre

**A mediocre version:**
- Says "Improve your CTA" without referencing the actual CTA text — that's noise, not insight
- Evaluates the input page in isolation with no competitor context
- Produces the same output regardless of whether you're analyzing a developer tool or an enterprise HR platform — not specialized for anything
- Uses one large prompt for everything — context gets diluted, output gets generic
- Has no way to know whether the AI actually did its job well or produced plausible-sounding filler

**Uxio:**
- Every insight references specific copy or a named visual element, enforced at the prompt level and verified by the quality gate. *"Your hero CTA reads 'Get started free' — Outreach.io uses 'Book your first demo in 2 minutes'. Outcome specificity increases click intent for skeptical B2B buyers."*
- Every finding is comparative: what you do, what the best competitor does, and why the difference matters for conversion
- Communication carries the highest rubric weight — because messaging clarity drives SaaS conversion more reliably than visual polish, and the tool should reflect that
- Batch vision analysis: the model sees the full screenshot alongside structured section content simultaneously — spatial awareness that section-by-section calls would lose
- The overall score is derived from the analysis data directly, not summarized by the AI after the fact — this prevents the model from flattering or rounding up its own findings
- The quality gate means the system knows when it failed to produce evidence-grounded output — and that signal is what drives improvement over time

---

## MVP: What I Built, What I Cut, and Why

### Built

The complete 7-agent pipeline, end-to-end, with all real API integrations. Real-time progress streaming with named action chips per stage. Full results UI: animated conversion score gauge, section navigation sidebar with per-section scores, per-section insight carousel with competitor names linked inline, PDF export on demand. Browser cache for instant re-visits. Browser notification on completion when the tab is in the background. Security: rate limiting, private IP blocking, API keys server-side only.

Deployed and working: `https://uxio-wheat.vercel.app`

### Cut — and the reasoning behind each decision

**User accounts** — cut because they're the prerequisite for history, re-analyze, and collaboration. Without building accounts properly, all three features are impossible. I chose to ship a complete anonymous analysis experience rather than a half-built authenticated one. The right order: prove the core pipeline → add accounts → unlock everything that depends on them.

**Manual competitor override** — cut because it requires an intermediate UI state between submission and analysis that adds friction to every single use. The pipeline's validator is good enough to make this optional, not essential. First candidate for the next iteration.

**Re-analyze and history** — cut as a direct consequence of not having accounts. These require storing past results per user. I didn't want to fake this with localStorage tricks that would need to be thrown away later.

**Comments and collaboration** — cut for the same reason. They require accounts, which require persistence, which requires a proper backend. These belong after the analysis itself has proven its value.

**The prioritization principle:** I'd rather ship one thing that works completely than three things that work partially. The analysis pipeline is the entire value proposition — everything else amplifies it once it's established.

---

## Monetization

Accounts and collaboration aren't just product features — they're what makes monetization possible. Without persistent identity, there's nothing to gate, nothing to retain, and no natural reason to pay. The monetization strategy is therefore directly coupled to the roadmap: the moment accounts land, a paid tier becomes viable.

### The model: bottoms-up, team-driven

Individual contributors discover Uxio for free and bring it into their team. The free tier demonstrates real value; the team tier captures it. This is the Figma and Notion playbook — individual utility that grows into shared team infrastructure.

| Tier | Price | What it unlocks |
|------|-------|-----------------|
| **Free** | $0 | 3 analyses/month, shareable read-only link, 7-day report access |
| **Pro** | $29/mo | 25 analyses/month, report history (30 days), re-analyze, PDF export |
| **Team** | $79/mo | Unlimited analyses, team collaboration (comments, @mentions), shared workspaces, unlimited history |
| **Enterprise** | Custom | SSO, API access, Figma and Slack integrations, SLA |

### Why these tiers

**Free at 3 analyses** is enough to run a real use case — not just a demo. A designer can analyze their own page against two competitors in one session and walk away with actionable findings. That's the moment the value becomes tangible, and it happens before a credit card is ever asked for.

**Pro at $29** targets individual power users. A single avoided stakeholder debate pays for the month. The lower price point compared to most SaaS tools in this category reduces churn risk for solo practitioners who may not have a budget to expense.

**Team at $79** is the primary revenue driver and the natural endpoint of the product's growth loop. A team of 3–5 designers and PMs sharing a workspace, commenting on findings, and aligning on decisions gets more value from one session than the plan costs in a month. The collaboration feature is also what creates retention — it shifts Uxio from a research tool you use occasionally to a shared decision space your team returns to.

### The viral loop

Every analysis produces a shareable link. A designer shares a report → a PM or growth lead sees a specific finding → they want to comment → they need an account → the team is on a paid plan. Sharing is the acquisition channel; collaboration is the conversion trigger. This is why comments are the most important feature after accounts, not just a nice-to-have.

### AI quality as an upsell

The free and Pro tiers run on Gemini 2.5 Flash — already excellent for most use cases. The Team tier can route the synthesis step through Claude Sonnet for noticeably stronger design reasoning on nuanced findings. This creates a meaningful quality difference between tiers without requiring separate infrastructure — just a different model in the same gateway chain.

---

## What I'd Build Next

In order of impact:

1. **Auth and report persistence** — the unlocking move. Once users have accounts, re-analyze, history, and sharing all become possible. Nothing else in this list can happen without this.

2. **Re-analyze with diff view** — bring the same URL back a month later, see what changed on competitor pages and why it matters. This is the feature that creates a weekly habit instead of a one-time use.

3. **Manual competitor override** — a lightweight review step before the pipeline runs, with an auto-proceed timeout so it doesn't block users who trust the defaults.

4. **Inline team comments** — the moment Uxio becomes a shared decision space. A designer shares a report, a PM comments on a specific finding, the team aligns in context. This is the feature that drives team-level retention.

---

*Uxio is a focused bet: that product teams need evidence-based competitive design intelligence, and that a specialized multi-agent system tuned to SaaS landing pages can deliver it better than any general-purpose tool. The MVP proves the pipeline. Everything else extends it.*
