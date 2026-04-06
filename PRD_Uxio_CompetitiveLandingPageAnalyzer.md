# PRD: Uxio — AI-Powered Competitive Landing Page Analyzer

**Version:** 1.1  
**Author:** Yaroslav Tokariev — Product Designer / AI Design Engineer  
**Date:** April 2026  
**Status:** Draft — In Review

---

## Executive Summary

Uxio is an AI-native tool that gives SaaS product teams instant, evidence-based competitive design intelligence. A user submits their landing page URL; within about 45 seconds, a multi-agent AI pipeline identifies direct competitors, captures and analyzes each page through a senior-designer lens, and delivers prioritized, actionable recommendations backed by specific visual and copy evidence.

The tool is designed to think — not just scan. It applies a structured design rubric informed by conversion research and UI/UX best practices, returning insights like: *"Your hero headline uses a generic benefit claim ('Grow faster') while Outreach.io anchors theirs to a measurable outcome ('Book 2× more meetings'). This specificity gap likely reduces perceived credibility with skeptical buyers."*

This PRD first describes the **full, unconstrained product vision** for Uxio. It then explicitly defines the **MVP slice** chosen for implementation under the test-task timebox, plus a roadmap for what comes next.

---

## 1. Problem Statement

### The Pain

Designers and product teams regularly need to answer: *"How does our landing page compare to competitors?"*

Today, answering this question properly means:
- 2–4 hours of manual work per competitive review
- Subjective observations with no structured framework
- Screenshots collected once, rarely revisited
- No consistent criteria — different team members evaluate different things
- High cognitive load to synthesize insights across 4–5 competitor pages simultaneously

The result: most teams either skip competitive reviews entirely or do them once per quarter — far too infrequently to stay informed in fast-moving markets.

### Why Now

Three capabilities have converged to make this solvable automatically:
1. **Vision LLMs** (Gemini 2.5 Flash, Claude Sonnet) can now analyze page design with near-expert accuracy[cite:20]
2. **Web scraping APIs** (Firecrawl) return full-page screenshots plus structured content in a single call[cite:22]
3. **AI search APIs** (Tavily) can perform multi-signal web research faster than any human analyst[cite:39]

### What's Missing in Existing Solutions

Existing tools (SimilarWeb, SEMrush, Hotjar) focus on traffic analytics, SEO, or behavioral data. None of them evaluate *design quality, messaging effectiveness, or UX patterns* from a product design perspective. Generic "SEO audit" tools produce templated output with zero design intelligence.

Uxio fills this gap: it behaves like a senior product designer embedded in the browser — specializing in SaaS landing pages.

---

## 2. Target Users

### Primary User
**Product Designer at a SaaS company (Seed to Series B)**  
- Reviews competitor pages before redesign projects or major experiments  
- Needs to justify design decisions to stakeholders with evidence  
- Time-constrained; cannot spend 3 hours on research before a 30-minute design sprint  

### Secondary Users
- **Growth Marketers** running landing page A/B tests who need directional benchmarks
- **Product Managers** building competitive battle cards or positioning documents
- **Founders** at early-stage startups validating their messaging vs. category leaders

### Out of Scope (for Vision v1)
- Enterprise teams with heavy compliance requirements and custom workflows
- Non-SaaS businesses (e-commerce, media, marketplaces)

---

## 3. Jobs to Be Done

| # | Job Statement | Frequency | Current Alternative |
|---|---|---|---|
| 1 | When I'm about to redesign our landing page, I want to see what patterns top competitors use, so I can make evidence-backed decisions instead of guessing | Monthly | Manual screenshot review (2–3 hrs) |
| 2 | When a stakeholder asks "why did we choose this CTA placement?", I want to show industry benchmarks, so I can defend the decision with data | Weekly | None — decisions are subjective |
| 3 | When a competitor launches a redesign, I want to understand what changed and why it matters, so I can react quickly | Ad hoc | Manually checking their site |
| 4 | When I join a new company, I want to quickly understand the competitive landscape visually, so I can get up to speed without weeks of research | Once | Manual review + reading case studies |
| 5 | (Future collaboration) When my team is aligning on a redesign, I want to co-comment on a shared competitive analysis, so we can converge on decisions faster | Weekly | Figma comments hacked onto pasted screenshots |

---

## 4. Full User Journey (Vision)

### Happy Path — Full Product Vision

```
1. User lands on Uxio homepage
2. Enters SaaS landing page URL (e.g., apollo.io)
3. Clicks "Analyze" — no other input required
4. Watches real-time progress panel:
   ├── ✓ Identified: "B2B Sales Intelligence · SDR/AE teams"
   ├── ✓ Found 3 direct competitors (with match confidence scores)
   ├── ✓ Captured screenshots + content (4 pages)
   ├── ✓ Analyzed 6 design sections per page
   └── ✓ Generated comparative insights
5. Views Results page:
   ├── Competitor overview cards (logo, headline, CTA text)
   ├── Section-by-section comparison table
   ├── Top 5 prioritized recommendations with evidence
   └── Screenshot viewer with annotated callouts
6. Copies the Uxio report link and pastes it into Slack / email / task tracker
7. Teammates open the same report (no login needed on first view):
   ├── Leave inline comments on specific insights
   ├── Mention teammates (e.g., @PM, @Growth) to request input
   ├── Resolve comments as decisions are made
8. Team converges on a set of design changes and exports a summary
   ├── PDF export for leadership
   └── Figma push as comments on actual design file
9. Later, user clicks "Re-analyze" to see how competitors changed over time
```

### Edge Cases (Vision)

- Competitor page blocks scraping → skip + continue with remaining competitors, highlight gap in report
- Page is not a SaaS landing page (e.g., blog post URL) → friendly error with suggestion to try the main product page
- Fewer than 3 direct competitors found with high confidence → use best available + mark as "adjacent competitor" in UI
- Analysis takes longer than expected → progress bar updates granularly, user sees agent activity instead of a static spinner

---

## 5. Feature Set — Full Vision

This section describes the **full, unconstrained product vision** for Uxio. The MVP slice is defined separately in Section 10.

### Core Analysis Features (Vision)

- Single URL input and domain validation
- Fully autonomous competitor identification (no manual confirmation)
- Real-time progress panel showing agent reasoning and steps
- Full-page screenshot capture via Firecrawl for input and competitors
- Section-level analysis: hero, features, social proof, pricing, CTA, footer
- Structured evaluation rubric (8 design + messaging criteria)
- Confidence levels on every insight ("High / Medium — based on 3 consistent signals")
- Evidence-backed insights: specific copy quotes, visual references, screenshot coordinates
- Section screenshot viewer with annotated callouts (bounding boxes)

### Collaboration & Sharing (Vision)

- Shareable report URL for every analysis
- Comment mode for invited teammates (no account required for first use)
- Inline comments attached to specific insights or sections
- @mentions to notify specific teammates
- Comment states: open, resolved, archived
- Basic permissions model: owner, editor, commenter, viewer
- Activity log: who commented, what changed, when

### Workflow & Integrations (Vision)

- Re-analyze button to refresh competitive snapshot
- Historical timeline showing how competitors’ pages evolved over time
- PDF export of full report
- Slack integration: send summary to a channel when analysis completes
- Figma integration: sync key insights and comments into a linked file

### Administration & Accounts (Vision)

- User accounts with email-based sign-in
- Organization workspaces
- Role-based access control (Admin, Member, Commenter)
- Billing management and subscription plans

---

## 6. MoSCoW Prioritization (Vision-Level)

### Must-Have (for Uxio to be a real product, not only MVP)

- Autonomous multi-agent analysis pipeline (Agents 0–6)
- Full-page screenshot + markdown capture
- Section-based design analysis using defined rubric
- Competitor comparison view
- Shareable report link

### Should-Have (strongly desirable in early versions)

- Re-analyze flow
- Manual competitor override before running
- PDF export
- Basic comment system on reports (collaboration v1)

### Could-Have (future enhancements)

- Figma plugin
- Slack integration
- Historical change tracking and diff view
- Industry benchmarks and scoring
- Advanced permission model and organization spaces

### Won’t Have (explicitly out of scope for current vision)

- Non-SaaS content types (e-commerce, blogs, marketplaces)
- Behavior analytics (scroll maps, heatmaps)
- SEO/performance auditing (Lighthouse-style reports)

---

## 7. Technical Architecture (Vision)

### Design Philosophy

The system is built as a **multi-agent pipeline** rather than a single monolithic AI call, mirroring how a senior design team would actually work: one analyst understands the product, another researches the market, specialists analyze specific page sections, and a strategist synthesizes findings into recommendations.

Each agent is given only the context it needs. This approach:
- Stays within LLM context window limits
- Enables parallel execution (4 pages analyzed simultaneously)
- Makes failures isolated and recoverable
- Produces more accurate output than a single "do everything" prompt

### Agent Pipeline (unchanged logic, renamed to Uxio)

```
[URL Input] → ONE CLICK → fully automated
       │
       ▼
┌──────────────────────────────────────────────┐
│ AGENT 0 · Page Intelligence                  │
│ Tools: Firecrawl (scrape) + Gemini 2.5 Flash │
│                                              │
│ Extracts structured Product Brief:           │
│ - Company name, industry, ICP                │
│ - Core value proposition                     │
│ - Key features and pricing model             │
│ - Competitor search signals                  │
│                                              │
│ Output: ProductBrief JSON                    │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ AGENT 1 · Multi-Signal Discovery             │
│ Tools: Tavily Search API (×3 parallel)       │
│                                              │
│ Runs 3 simultaneous queries:                 │
│ Q1: "[company] alternatives SaaS [industry]" │
│ Q2: "best [feature] software for [ICP]"      │
│ Q3: "site:g2.com [company] competitors"      │
│                                              │
│ Cross-validates: URLs appearing in 2+        │
│ results get higher confidence score          │
│ Output: 10–15 candidate URLs + scores        │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ AGENT 2 · Competitor Validator & Ranker      │
│ Tools: Gemini 2.5 Flash-Lite (classifier)    │
│                                              │
│ Scores each candidate on 4 dimensions:       │
│ - ICP alignment (0–25 pts)                   │
│ - Price range match (0–25 pts)               │
│ - Feature overlap (0–30 pts)                 │
│ - Market segment match (0–20 pts)            │
│                                              │
│ Selects TOP 3 (confidence ≥ 70%)             │
│ Outputs reasoning shown in UI                │
│ → Never blocks pipeline for confirmation     │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ AGENT 3 · Scraper (×4 parallel)              │
│ Tools: Firecrawl /scrape endpoint            │
│ formats: ["markdown", "screenshot"]          │
│                                              │
│ Captures input URL + 3 competitors           │
│ simultaneously to minimize total wait time   │
│ Output: {url, markdown, screenshotBase64}×4  │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ AGENT 4 · Section Classifier (×4 parallel)   │
│ Tools: Gemini 2.5 Flash-Lite                 │
│                                              │
│ Splits page markdown into logical sections:  │
│ hero / features / social_proof /             │
│ pricing / cta / footer                       │
│                                              │
│ Sets needsDeepVision flag per section        │
│ (hero/cta always true; footer usually false) │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ AGENT 5 · Vision Analyzer (parallel ×N)      │
│ Tools: Gemini 2.5 Flash with vision          │
│                                              │
│ Evaluates each section against 8-point       │
│ design rubric (see Section 8)                │
│ Returns structured JSON per section:         │
│ { score, finding, evidence, confidence }     │
│                                              │
│ Sections with needsDeepVision: false         │
│ → analyzed from markdown only (saves quota)  │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ AGENT 6 · Synthesis                          │
│ Tools: Gemini 2.5 Flash                      │
│                                              │
│ Receives all section analyses for all 4 URLs │
│ Compares patterns across competitors         │
│ Generates TOP 5 recommendations:             │
│ - Priority (Critical / High / Medium)        │
│ - Finding with specific evidence             │
│ - Example from best-performing competitor    │
│ - Suggested action                           │
└──────────────────────────────────────────────┘
       │
       ▼
   Results UI  (~35–45 seconds total)
```

### Technology Stack (Vision)

**Frontend**
- Next.js 15 App Router + TypeScript
- Tailwind CSS + shadcn/ui component library
- Server-Sent Events (SSE) for real-time progress streaming
- Comments & mentions implemented as lightweight React layer on top of report data

**Backend**
- Next.js 15 App Router with Route Handlers (`app/api/*/route.ts`).
- Node.js runtime (not Edge) — required because Firecrawl and Gemini SDKs use Node-specific APIs.
- No separate backend service; frontend and backend live in the same Next.js repo and deploy together to Vercel.

**APIs — Free Tier Stack (for MVP, see Section 9)**
- Gemini 2.5 Flash / Flash-Lite for language + vision[cite:20]
- Tavily Search for competitor discovery[cite:39]
- Firecrawl for screenshot + structured content capture[cite:22]

---

## 8. AI Analysis Rubric (Vision)

The 8-point rubric is the product's core IP — it is what separates Uxio from a generic screenshot comparison tool. Each criterion is evaluated with specific evidence references, not generic observations.

| # | Criterion | What Good Looks Like | Common Failure |
|---|---|---|---|
| 1 | **Hero Clarity** | Clear "who this is for + what it does" within 5 seconds | Generic headline, no ICP signal |
| 2 | **Value Prop Specificity** | Measurable outcomes ("2× pipeline") vs. generic claims ("grow faster") | Aspirational language without evidence |
| 3 | **CTA Quality** | Action-oriented copy, singular focus, above the fold | "Learn more" instead of outcome-focused copy |
| 4 | **Social Proof Pattern** | Customer logos + testimonials + quantified results | Only logos OR only text quotes |
| 5 | **Visual Hierarchy** | Clear F/Z-pattern reading flow, primary action stands out | Competing visual weights, no clear focal point |
| 6 | **Friction Signals** | Number of steps to signup, pricing visibility, free trial prominence | Hidden pricing, long forms before value |
| 7 | **Trust Signals** | Security badges, integrations, company credibility markers | No social proof above the fold |
| 8 | **Messaging Tone Fit** | Tone matches buyer sophistication (technical vs. executive) | Mismatch between ICP language and copy register |

Every insight must quote specific copy or describe specific visual elements — not general observations.

---

## 9. What Makes Uxio Excellent vs. Mediocre

### Mediocre Version

- Generic checklist output: "Add social proof," "Improve your CTA," "Use more white space"
- No competitor context — just evaluates the input page in isolation
- Single screenshot analyzed as one image (misses section-level nuance)
- Hallucinated insights with no traceable evidence
- Works for any website, specialized for none
- No collaboration — analysis lives in a designer's private notes

### Excellent Version (Uxio Vision)

- Every insight references specific copy, color, or layout elements by name
- Insights are comparative: "You do X, your best competitor does Y, here's why Y converts better"
- Confidence levels distinguish high-signal findings from educated inferences
- Analysis is SaaS-specific — rubric is tuned to SaaS landing page patterns, not generic web design
- Multi-agent architecture means each specialist does one job with full context → higher accuracy overall
- UI shows agent reasoning in real-time → users understand *why* these competitors were chosen
- Collaboration is first-class: shared reports, inline comments, mentions, and decision tracking
- Graceful degradation: partial results delivered rather than total failure if one agent encounters an error

---

## 10. MVP Scope — What Is Included and What Is Cut

This section explicitly scopes the **MVP implementation slice** derived from the full vision above, under an estimated 8 hours of focused work.

### MVP: Included Now

**Core Pipeline**
- Implement full 6-agent autonomous pipeline (Agents 0–6)
- Use free-tier stack: Gemini 2.5 Flash / Flash-Lite, Tavily, Firecrawl, Vercel
- In-memory orchestration (no long-lived jobs)

**UI & UX**
- URL input form with basic validation
- Real-time SSE-based progress panel showing key steps (discovery, scraping, analysis, synthesis)
- Results page with:
  - Competitor overview cards (logo if available, headline, CTA)
  - Section-by-section comparison table (hero, features, social proof, pricing, CTA, footer)
  - Top 5 prioritized recommendations with short rationale
- Single, shareable read-only report URL (hash-based, no auth)

**Non-Functional**
- All API keys stored server-side only
- Scraped content and screenshots kept in memory only; no database persistence
- Basic error handling for: scraping failures, missing competitors, API quota exhaustion

### Vision Features Explicitly Cut from MVP

From earlier vision sections, the following items are consciously **not implemented** in MVP:

| Vision Feature | Status in MVP | Reason |
|---|---|---|
| Inline comments on reports | ❌ Cut | Requires persistent storage + identity; too heavy for 8h scope |
| @mentions and activity log | ❌ Cut | Depends on comments foundation |
| Re-analyze flow with history | ❌ Cut | History requires database and auth |
| PDF export | ❌ Cut | Complex styling; not required to prove core value |
| Figma integration | ❌ Cut | Depends on stable API + auth |
| Slack integration | ❌ Cut | Depends on auth + notifications infrastructure |
| Historical change tracking | ❌ Cut | Requires persistent scraping and diff engine |
| Authentication and org workspaces | ❌ Cut | Adds backend complexity, not needed to demonstrate thinking |
| Advanced permission model | ❌ Cut | Only single-owner shareable link in MVP |

### MVP+: First Features to Add After Initial Release

Given extra time beyond the test-task, the first additions would be:

1. **Re-analyze button** — re-run pipeline on same URL; short-term history in memory
2. **Manual competitor override** — simple UI step before analysis starts
3. **Commenting v1** — minimal inline comments stored in a lightweight backend (e.g., Supabase), no permissions yet

These features directly support collaborative workflows without requiring the full workspace and billing stack.

---

## 11. Post-Release Roadmap (From MVP to Full Vision)

### Phase 1 — Immediate (Weeks 1–2 after MVP)

*Goal: Make Uxio more useful in daily workflows without large infrastructure changes.*

- Add **Re-analyze** action
- Add **Manual competitor override** before pipeline execution
- Improve **Result UI** with simple screenshot viewer
- Stabilize pipelines and refine prompts based on qualitative user feedback

### Phase 2 — Collaboration & Team Adoption (Month 1–3)

*Goal: Turn Uxio from a solo tool into a shared decision space.*

- **Comments v1** — inline comments on insights, stored per report
- **@mentions** — lightweight notification (e.g., email, Slack DM) when someone is mentioned
- **Comment permissions** — owner, editor, commenter roles
- **Shared workspace** — simple organization workspace listing all shared reports

This phase directly implements the "Figma-like" collaboration model: designers and managers can open the same report, discuss, and resolve comments together.

### Phase 3 — Integrations and Benchmarks (Month 3–6)

*Goal: Deep integration into product teams’ existing tools.*

- **Slack integration** — post summaries into channels when analyses complete
- **Figma integration** — attach insights as comments to specific frames
- **Historical tracking** — diff view of competitor page changes over time
- **Industry benchmarks** — scoring against anonymized aggregates

### Phase 4 — Platform & Subscription (Month 6+)

*Goal: Sustainable business model and platform-level stability.*

- Full **authentication and billing** stack (individual + team plans)
- **Role-based access** with fine-grained permissions
- **Team analytics** — track usage, impact, and ROI of Uxio across orgs

---

## 12. Monetization Strategy (Vision)

### Freemium → Seat-Based Subscription

Uxio naturally supports a freemium model where designers initiate analyses and invite collaborators.

| Tier | Price (example) | Analyses/month | Seats | Key Features |
|---|---|---|---|---|
| **Free** | $0 | 2 | 1 analyzer, unlimited viewers | Core analysis, shareable link (view-only), Gemini 2.5 Flash quality |
| **Pro** | $19/month | 30 | 1 analyzer, 3 collaborators | Comments, re-analyze, basic history, PDF export |
| **Team** | $49/month | Unlimited | 5 analyzers, unlimited commenters | Claude Vision quality, Slack/Figma, workspaces, roles |
| **Viewer-only** | $9/month | n/a | 10 viewer/commenter seats | Comment-only role for managers/stakeholders |

This model supports the collaboration vision: **designers pay for analysis seats**, while managers and stakeholders can be added as cheaper comment-only seats.

### AI Model Upgrade as Upsell

Free tier runs on Gemini 2.5 Flash (good quality, free). Paid tiers upgrade to **Claude claude-sonnet-4-5 Vision** for the analysis agent — producing measurably more nuanced design insights.

The in-product message: *"Upgrade to Team to unlock Claude-powered analysis — internal tests show ~40% more specific, actionable insights compared to the standard tier."*

---

## 13. AI Model Upgrade Path (Technical)

| Current (MVP) | Paid Upgrade | Quality Delta | When to Upgrade |
|---|---|---|---|
| Gemini 2.5 Flash (Vision) | Claude claude-sonnet-4-5 Vision | +30–40% insight specificity; stronger design reasoning | When feedback cites generic insights |
| Tavily Search | Perplexity Sonar Pro | Better grounded competitor research with source citations | When competitor discovery accuracy becomes a pain point |
| Firecrawl Free (500 one-time) | Firecrawl Hobby $16/mo | 3,000 credits/month, stable production usage | Before onboarding first paying teams |
| Gemini 2.5 Flash-Lite (classifier) | Keep | Already optimal for classification tasks | No upgrade needed |

---

## 14. Security & Legal Compliance (MVP and Beyond)

- **API keys:** All third-party API keys stored exclusively in server-side environment variables. Never exposed to client bundle.
- **Scraped content TTL:** For MVP, all captured screenshots and page content are stored only in memory for the duration of a single request. Full product may introduce short-term persistence (24h) with clear legal notice.
- **Public report sharing:** Reports contain AI-generated analysis and quoted copy snippets only — not full page reproductions. This stays within fair-use boundaries for comparative commentary.
- **Rate limiting:** Input endpoint rate-limited to prevent abuse (e.g., 5 requests/IP/hour on free tier).
- **robots.txt compliance:** Firecrawl respects robots.txt by default; pages that disallow scraping will return a graceful error.

---

## 15. Success Metrics

### MVP Evaluation (during test period)

- Pipeline completes successfully for apollo.io, linear.app, anthropic.com, hubspot.com
- Insights reference specific copy or visual elements (not generic statements)
- Total analysis time ≤ 60 seconds for 4-page analysis
- Zero API keys exposed in client-side code

### Collaboration & Adoption Metrics (Vision)

- **Activation:** % of users who run ≥2 analyses within 7 days (target: >40%)
- **Insight quality:** User-rated insight usefulness score >4.0/5.0
- **Collaboration:** Average number of unique commenters per report (target: ≥2 for team plans)
- **Sharing:** % of analyses that generate a shared link (proxy for cross-team value)
- **Time-to-insight:** Median analysis completion time (target: <45 seconds)

---

## 16. Open Questions & Assumptions

| # | Question | Current Assumption | Impact if Wrong |
|---|---|---|---|
| 1 | Will Firecrawl successfully screenshot major SaaS sites (apollo.io, linear.app)? | Yes — Firecrawl is designed for JS-heavy sites | Medium — fallback to markdown-only analysis |
| 2 | Is Gemini 2.5 Flash Vision accurate enough for rubric scoring? | Yes for MVP; qualitative tests suggest strong UI understanding[cite:20] | High — would need Claude upgrade earlier |
| 3 | Does 500 Firecrawl free credits cover evaluation + demo? | Yes — ~80–90 full 4-page analyses, enough for 1-week evaluation[cite:22] | Low — Hobby plan at $16/month is an easy fix |
| 4 | Can Tavily reliably find direct competitors for niche SaaS products? | Mostly yes — multi-query strategy increases robustness[cite:39] | Medium — may produce adjacent rather than direct competitors |
| 5 | Will Vercel Edge Function timeout (60s) be sufficient for full pipeline? | Yes, with parallelization and timeboxing per agent | High — would require Convex or background jobs for production |

---

*This PRD reflects the full vision for Uxio as a collaborative AI design assistant for SaaS landing pages. Section 10 clearly scopes the MVP slice chosen for the test task, balancing ambition with execution quality.*
