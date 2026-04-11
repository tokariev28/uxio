# PRD: Uxio — Competitive Landing Page Analyzer

**Author:** Yaroslav Tokariev — Product Designer / AI Design Engineer  
**Date:** April 2026

---

## The Problem Worth Solving

Designers and product teams regularly need to answer one question: *"How does our landing page compare to what competitors are doing?"*

Answering it properly today means 2–4 hours of manual work — capturing screenshots, writing notes, trying to stay consistent across 4–5 pages at once. Most teams skip it, or do it once and never revisit. There's no structured framework, no consistent criteria, and no way to defend a design decision with data when a stakeholder pushes back.

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

---

### 1. How do you define "competitor"?

Not "what tools does this company mention" — that's too narrow and too easy to game. A true competitor is a product that targets the **same buyer, for the same job, at the same market tier**.

I operationalized this as four scoring axes: same ICP (who buys it), same job-to-be-done (why they buy it), same value proposition shape (what outcome they promise), same market segment (SMB vs mid-market vs enterprise). A weighted average across these four gives each candidate a match score from 0 to 1. Anything below 0.7 is filtered out or flagged as adjacent.

This matters because a generic "alternatives list" will surface tools that share a category name but serve completely different buyers — which produces useless analysis. Apollo.io's real competitors aren't every "sales tool" on G2; they're the specific products an SDR team would evaluate *instead of* Apollo.

---

### 2. Where does competitor data come from, and how do you weigh it?

Two independent sources run in parallel and cross-validate each other.

**Web search** runs 5 parallel queries built from the product brief: alternatives searches, category leader lists, feature comparison queries, "X vs" pages, and "best tools for [buyer type]" searches. Each match increments a confidence count.

**LLM knowledge discovery** runs simultaneously — the model surfaces the most likely direct competitors based on its training data. These results get a higher base weight than single-search matches, because they represent a stronger prior signal anchored to real market knowledge.

The merge rule: candidates confirmed by both sources score significantly higher. A competitor appearing in 3 searches AND named by the LLM is a much stronger signal than one that appeared in either source alone.

Why this matters: any single source is unreliable. Search can miss market leaders for niche verticals. LLM training data goes stale. The cross-validation catches what either source would miss alone — and the scoring makes the confidence level explicit, not hidden.

---

### 3. What makes a landing page "good"? Who decides the criteria?

This is the hardest question and the one most tools answer badly.

The goal isn't to evaluate "design quality" in the abstract — that's subjective and useless for people trying to make decisions. The goal is to evaluate **conversion-relevant design quality**: the specific patterns that research and industry practice have shown to affect whether a B2B SaaS visitor becomes a lead.

The rubric has 10 axes across three groups:

**Communication** (weighted 1.5×) — because message clarity is the highest-leverage variable for SaaS conversion:
- *Clarity:* does the visitor understand who this is for and what it does within 5 seconds?
- *Specificity:* measurable outcomes ("2× pipeline") vs. aspirational claims ("grow faster")?
- *ICP Fit:* does the language match the actual buyer's sophistication level?

**Conversion Architecture** (weighted 1.2×) — the structural choices that drive action:
- *Attention Ratio:* one dominant CTA vs. competing visual weights?
- *CTA Quality:* outcome-oriented copy vs. "Learn more"?
- *Trust Signals:* logos + testimonials + numbers above the fold, or scattered?

**Visual Quality** (weighted 1.0×) — supporting execution:
- *Visual Hierarchy, Cognitive Ease, Typography Readability, Density Balance*

The weighting is a product decision, not a technical one. A page with mediocre visuals but exceptional clarity will almost always outperform a beautiful page with a weak value proposition.

Every insight must reference specific copy or a named visual element. "Add social proof" with no evidence isn't an insight — it's noise.

---

### 4. One screenshot or sections? One agent or many?

**Sections, not one screenshot.** A full landing page screenshot fed to a vision model produces surface-level observations — the model sees the page as a whole but can't reason carefully about the hero's CTA specificity while also evaluating the pricing section's friction signals. The context is too diffuse.

But completely separate calls per section lose spatial context — a model analyzing the hero in isolation doesn't know that the social proof is buried below the fold, which is directly relevant to evaluating trust signal placement.

**The solution: batch analysis per page.** Each page is sent to the vision model as one call — full screenshot plus all section content together. The screenshot provides spatial awareness; the structured markdown enables precision per section. One call per page, not one per section and not one for the whole pipeline.

**Multiple specialized agents, not one general agent.** A single "analyze this page" prompt would need to understand product markets, run web searches, evaluate design quality, synthesize cross-competitor patterns, and generate recommendations — all in one context window, with no separation of concerns. Quality degrades across every dimension when a prompt tries to do too many things.

Instead, each agent does one job:

| Agent | Job |
|-------|-----|
| 0 — Page Intelligence | Extracts company, ICP, value prop, and key features from the input page |
| 1 — Discovery | Finds competitor candidates from parallel web searches + LLM knowledge |
| 2 — Validator | Scores each candidate on 4 alignment axes; selects the top 3 |
| 3 — Scraper | Captures full-page screenshots and content for all 4 pages in parallel |
| 4 — Classifier | Identifies which sections are present and where they sit in scroll order |
| 5 — Vision Analyzer | Analyzes each page: screenshot + section content in a single batch call |
| 6 — Synthesis | Generates 3 prioritized recommendations per section with named competitor examples |

Failures are isolated. Each agent's output is inspectable. Prompts can be refined per task without affecting others.

---

### 5. How do you handle a 2–4 minute AI workflow without losing the user?

The naive solution — a loading spinner — would see most users abandon after 30 seconds.

My approach: make the wait feel **productive and transparent**, not hidden.

The backend streams real-time progress events as each agent completes. The frontend shows a 7-stage progress panel where each stage transitions from pending → active (with a live indicator and named action chips) → done. The user sees *"Validating competitors: apollo.io, outreach.io, salesloft.com"* — not a generic loading bar.

Simultaneously, an **InspirationGallery** of 20 curated SaaS landing pages plays during the wait — a 3D auto-scrolling carousel shown on the home view before analysis starts. It's contextually relevant (you're about to analyze a landing page, here are some of the best ones) and makes the wait feel active rather than wasted.

For returning users: results are cached in the browser for 2 hours per URL. The same analysis loads instantly without re-running the pipeline.

---

### 6. What control should users have?

**MVP decision: minimal control, maximum autonomy.** The pipeline is fully automated — submit a URL, get results. No confirmation steps, no manual competitor review before analysis runs.

This was a deliberate choice, not an omission. The product's core value is *instant* intelligence. Adding a "confirm these competitors?" step adds friction to every single use — and most users don't have strong priors about who their competitors should be (that's partly why they're running the analysis in the first place).

**What I'd add next:** a lightweight competitor review step between discovery and scraping, surfacing the top candidates with match scores and a simple approve/swap UI. Not blocking — with a 10-second timeout that auto-proceeds if the user doesn't interact. This gives power users control while preserving the instant experience for everyone else.

---

## What Separates Excellent from Mediocre

**A mediocre version:**
- Says "Improve your CTA" without referencing the actual CTA text — that's noise, not insight
- Evaluates the input page in isolation with no competitor context
- Produces the same output regardless of whether you're analyzing a developer tool or an enterprise HR platform — no specialization
- Uses one large prompt for everything — context gets diluted, output gets generic
- Has no way to know whether the AI actually did its job well or produced plausible-sounding filler

**Uxio:**
- Every insight references specific copy or a named visual element, enforced at the prompt level and verified by an automated quality gate. *"Your hero CTA reads 'Get started free' — Outreach.io uses 'Book your first demo in 2 minutes'. Outcome specificity increases click intent for skeptical B2B buyers."*
- Every finding is comparative: what you do, what the best competitor does, and why the difference matters for conversion
- Communication carries the highest rubric weight — because messaging clarity drives SaaS conversion more reliably than visual polish
- Batch vision analysis: the model sees the full screenshot alongside structured section content simultaneously — spatial awareness that section-by-section calls would lose
- The overall score is derived from the analysis data directly, not summarized by the AI — this prevents the model from flattering or rounding up its own findings
- The quality gate means the system knows when it failed to produce evidence-grounded output — and that signal is what drives prompt improvement over time

---

## Technical Approach

Uxio runs a **7-agent sequential pipeline** entirely on the server, orchestrated as a single request/response cycle with Server-Sent Events for real-time streaming. No database — all intermediate data lives in memory for the duration of one analysis. The pipeline calls three external services: Firecrawl (scraping + screenshots), Tavily (web search), and Gemini (LLM + vision), all routed through Vercel AI Gateway with automatic model fallbacks.

The architecture is deliberately simple for the MVP: no background jobs, no queues, no persistent storage. The 5-minute execution ceiling covers the full pipeline with room to spare, and SSE keeps the connection alive throughout.

**Model routing:** Gemini 2.5 Flash-Lite handles extraction, scoring, and classification (faster, cheaper, sufficient for structured tasks); Gemini 2.5 Flash handles vision analysis and synthesis (stronger reasoning). GPT-5.4-nano serves as automatic fallback for both when primary models are unavailable.

**Quality gate:** Every completed analysis is automatically scored across five signals — evidence grounding, score variance, specificity rate, competitor presence, field completeness. This doesn't block delivery but surfaces systemic prompt failures early, making it possible to improve the system systematically rather than by guessing.

**Stack:** Next.js 16 App Router + React 19, Tailwind CSS v4, shadcn/ui, Framer Motion. Deployed to Vercel.

---

## MVP: What I Built, What I Cut, and Why

### Built

The complete 7-agent pipeline, end-to-end, with all real API integrations. Real-time progress streaming with named action chips per stage. Full results UI: animated conversion score gauge, section navigation sidebar with per-section scores, per-section insight carousel with competitor names linked inline, PDF export on demand. Browser cache for instant re-visits. Browser notification on completion when the tab is in the background. Security: rate limiting, SSRF protection, API keys server-side only.

Deployed and working: `https://uxio-wheat.vercel.app`

### Cut — and the reasoning behind each decision

**User accounts** — cut because they're the prerequisite for history, re-analyze, and collaboration. Without building accounts properly, all three features are impossible. I chose to ship a complete anonymous analysis experience rather than a half-built authenticated one. The right order: prove the core pipeline → add accounts → unlock everything that depends on them.

**Shareable report links** — cut for the same reason. A truly shareable link requires either server-side storage (to host the report) or accounts (to attach the report to a user). The browser cache achieves instant re-visits for the same user, but cross-user sharing needs a backend. First thing to add after accounts land.

**Manual competitor override** — cut because it requires an intermediate UI state between submission and analysis that adds friction to every single use. The pipeline's validator is good enough to make this optional for MVP, not essential. First candidate for the next product iteration.

**Re-analyze and history** — cut as a direct consequence of no accounts. These require storing past results per user. I didn't want to fake this with localStorage hacks that would need to be thrown away later.

**Comments and collaboration** — cut for the same reason. They require accounts, which require persistence, which requires a proper backend. These belong after the analysis itself has proven its value.

**The prioritization principle:** I'd rather ship one thing that works completely than three things that work partially. The analysis pipeline is the entire value proposition — everything else amplifies it once it's established.

---

## Full Feature Vision

### Must-Have (for Uxio to be a real product)

- Autonomous 7-agent pipeline, fully automated from URL to results ✅
- Multi-signal competitor discovery with source cross-validation and confidence scoring ✅
- Full-page screenshot capture with automatic retry for JavaScript-rendered pages ✅
- 10-axis design rubric with weighted scoring groups ✅
- Evidence-grounded findings — every insight tied to specific copy or visual proof ✅
- Section navigation ordered by actual page scroll position, not a fixed template ✅
- PDF export of the full analysis report ✅
- Shareable report link (read-only, no login required)
- User accounts — prerequisite for all persistence and collaboration features

### Should-Have (high value, needs accounts first)

- Re-analyze flow: re-run on the same URL, surface what changed since last time
- Report history per account
- Manual competitor override before the pipeline runs
- Inline team comments on specific insights

### Could-Have (later phases)

- Historical diff view: track how competitor pages evolve over time
- Slack integration: post analysis summary to a channel on completion
- Figma integration: push insights as comments directly onto design frames
- Benchmark scoring: compare section scores against anonymized category data

### Won't Have (out of scope)

- SEO or performance auditing — a different job, a different tool
- Behavior analytics (heatmaps, scroll maps) — requires instrumentation on the target site
- Non-SaaS content types — the rubric wouldn't apply

---

## Monetization

Accounts and collaboration aren't just product features — they're what makes monetization possible. Without persistent identity, there's nothing to gate, nothing to retain, and no natural reason to pay. The monetization strategy is therefore directly coupled to the roadmap: the moment accounts land, a paid tier becomes viable.

### The model: bottoms-up, team-driven

Individual contributors discover Uxio for free and bring it into their team. The free tier demonstrates real value; the team tier captures it. This is the Figma and Notion playbook — individual utility that grows into shared team infrastructure.

| Tier | Price | What it unlocks |
|------|-------|-----------------|
| **Free** | $0 | 3 analyses/month, 7-day report access, PDF export |
| **Pro** | $29/mo | 25 analyses/month, report history (30 days), re-analyze, shareable read-only links |
| **Team** | $79/mo | Unlimited analyses, team collaboration (comments, @mentions), shared workspaces, unlimited history |
| **Enterprise** | Custom | SSO, API access, Figma and Slack integrations, SLA |

### Why these tiers

**Free at 3 analyses** is enough to run a real use case — not just a demo. A designer can analyze their own page against two competitors in one session and walk away with actionable findings. That's the moment the value becomes tangible, and it happens before a credit card is ever asked for.

**Pro at $29** targets individual power users. A single avoided stakeholder debate pays for the month. Shareable links land here — because sharing is what creates the team-level discovery loop that drives upgrades.

**Team at $79** is the primary revenue driver and the natural endpoint of the product's growth loop. A team of 3–5 designers and PMs sharing a workspace, commenting on findings, and aligning on decisions gets more value from one session than the plan costs in a month. Collaboration is also what creates retention — it shifts Uxio from a research tool you use occasionally to a shared decision space your team returns to.

### The growth loop

A Pro user shares a report link → a PM or growth lead opens it, sees a specific finding they want to discuss → they need an account to comment → the team is on a paid plan. Sharing is the acquisition channel; collaboration is the conversion trigger. This is why shareable links come before comments in the roadmap, not after — the link is what starts the loop.

---

## What I'd Build Next

In order of impact:

1. **Auth and report persistence** — the unlocking move. Once users have accounts, everything else in this list becomes buildable. Nothing here can happen without this.

2. **Shareable read-only report links** — the feature that turns individual value into team discovery. A Pro user shares a report, a colleague sees it, the team signs up. This is the core growth mechanism.

3. **Re-analyze with diff view** — bring the same URL back a month later, see what changed on competitor pages and why it matters. This is the feature that creates a weekly habit instead of a one-time use.

4. **Manual competitor override** — a lightweight review step before the pipeline runs, with an auto-proceed timeout so it doesn't block users who trust the defaults.

5. **Inline team comments** — the moment Uxio becomes a shared decision space. A designer shares a report, a PM comments on a specific finding, the team aligns in context. This is the feature that drives team-level retention.

---

*Uxio is a focused bet: that product teams need evidence-based competitive design intelligence, and that a specialized multi-agent system tuned to SaaS landing pages can deliver it better than any general-purpose tool. The MVP proves the pipeline works. Everything else extends what's already there.*
