# Uxio MVP Spec — Overview

## Goal

Implement a working MVP of Uxio:

- A single-page web app that:
  - Accepts a SaaS landing page URL.
  - Runs the defined multi-agent pipeline end-to-end.
  - Displays a competitor overview and key recommendations.
- Deployed to Vercel, usable by reviewers without any local setup.

The MVP should demonstrate:

- Correct orchestration of the pipeline across Firecrawl, Tavily, and Gemini.
- A clear, opinionated UX for “one URL in → insights out”.
- Clean, maintainable code that can be extended later (e.g., collaboration, history).

---

## User Flow (MVP)

1. User opens the Uxio web app.
2. Enters a URL (e.g., `https://apollo.io`) into a single input field.
3. Clicks the **“Analyze”** button.
4. Sees a progress panel with a sequence of steps, such as:
   - “Understanding your product…”
   - “Finding competitors…”
   - “Scraping pages…”
   - “Analyzing sections…”
   - “Synthesizing recommendations…”
5. When the analysis finishes, the user sees a **Results** section with:
   - A short textual summary (one or two sentences) comparing their page to competitors.
   - 3 competitor cards (logo if available, title/headline, primary CTA label).
   - A section comparison overview for:
     - Hero
     - Features
     - Social proof
     - Pricing
     - CTA
   - A list of **Top 5 recommended actions**, each with:
     - Priority (Critical / High / Medium).
     - Reasoning (comparative, not generic).
     - Concrete suggestion.

No logins, comments, or history screens in the MVP.

---

## API Surface (Internal Backend)

The backend exposes one main endpoint for the frontend to call:

### `POST /api/analyze`

**Request body:**

```json
{
  "url": "https://apollo.io"
}
```

**Response (simplified shape):**

```json
{
  "productBrief": {
    "company": "Apollo.io",
    "industry": "Sales Intelligence / B2B Data",
    "icp": "SDRs, AEs, Revenue teams at mid-market companies",
    "coreValueProp": "Find, contact, and close ideal buyers",
    "keyFeatures": [
      "contact database",
      "email sequences",
      "dialer",
      "intent data"
    ]
  },
  "competitors": [
    {
      "url": "https://outreach.io",
      "name": "Outreach",
      "matchScore": 0.94,
      "matchReason": "Same ICP, similar features (sequences + dialer)"
    },
    {
      "url": "https://salesloft.com",
      "name": "Salesloft",
      "matchScore": 0.91,
      "matchReason": "Same segment, shared value prop"
    },
    {
      "url": "https://zoominfo.com",
      "name": "ZoomInfo",
      "matchScore": 0.82,
      "matchReason": "Adjacent competitor with strong overlap in data features"
    }
  ],
  "sections": {
    "hero": {
      "findings": [
        {
          "site": "input",
          "score": 0.6,
          "summary": "Headline is generic, no clear ICP.",
          "evidence": {
            "headlineText": "Grow faster with data",
            "screenshotRegion": "0-800px"
          }
        },
        {
          "site": "outreach.io",
          "score": 0.9,
          "summary": "Very clear outcome-focused hero.",
          "evidence": {
            "headlineText": "Book 2x more meetings",
            "screenshotRegion": "0-800px"
          }
        }
      ]
    },
    "features": { },
    "socialProof": { },
    "pricing": { },
    "cta": { },
    "footer": { }
  },
  "recommendations": [
    {
      "priority": "high",
      "title": "Make hero value proposition more specific",
      "reasoning": "Competitors clearly promise measurable outcomes (e.g. '2x more meetings'), while your headline is generic. This reduces perceived credibility for skeptical buyers.",
      "exampleFromCompetitor": "Outreach: 'Book 2x more meetings'",
      "suggestedAction": "Rewrite hero headline to anchor on a quantified outcome (e.g. number of meetings or pipeline growth)."
    }
  ]
}
```

The exact schema can evolve during implementation, but it must:

- Provide enough structure for a clean UI.
- Preserve evidence links (quotes, screenshot regions) for possible future UI improvements.

---

## External Dependencies (MVP)

### Firecrawl

Purpose:

- Given a URL, return:
  - Full-page screenshot (or a reference to it).
  - Markdown representation of the page content.

Usage:

- Agent 0 (Page Intelligence) for the input URL.
- Agent 3 (Scraper) for the input URL + 3 competitors.

### Tavily Search

Purpose:

- Given search queries, return competitor candidates.

Usage:

- Agent 1 (Multi-Signal Discovery):
  - Runs 3 parallel queries based on the productBrief:
    - `"[company] alternatives SaaS [industry]"`
    - `"best [coreValueProp keyword] software for [ICP keyword]"`
    - `"site:g2.com [company] competitors"`

The results are merged and de-duplicated into the candidate set.

### Gemini 2.5 Flash & Flash-Lite

Purpose:

- Extract structured productBrief.
- Score and validate competitor candidates.
- Classify sections of a page.
- Analyze each section visually and via text.
- Synthesize final recommendations.

Usage:

- Flash-Lite for classification/validation steps.
- Flash for heavier reasoning and vision tasks.

All API keys are provided via environment variables and only used server-side.

---

## Non-Goals for MVP

To keep the scope realistic, the following are explicitly **out of scope** for the MVP:

- **Collaboration features**
  - Comments, @mentions, shared workspaces.
- **User account system**
  - Sign-up, login, team management, billing.
- **Exports and integrations**
  - PDF export, Figma plugin, Slack notifications, API access for external systems.
- **Data persistence**
  - No database for storing past analyses or histories.
- **Mobile viewport analysis**
  - Only desktop layout is analyzed initially.

These are part of the full Uxio vision and appear in the main PRD, but will be implemented in later phases, not in this MVP.