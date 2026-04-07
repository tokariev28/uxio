// lib/agents/prompts.ts
// Gemini system prompts ONLY for agents that actually call Gemini.
// Agent 1 (Tavily) and Agent 3 (Firecrawl) have no prompts here —
// they are pure API calls handled in their own files.

export const AGENT_PROMPTS = {

    // ── AGENT 0 · Page Intelligence ─────────────────────────────────
    // Pipeline: Firecrawl scrape → this prompt → Gemini Flash-Lite
    // Input:    page markdown from Firecrawl
    // Output:   ProductBrief
    pageIntelligence: `
  ROLE: B2B SaaS Product Analyst
  TASK: Extract a product brief from a landing page (provided as markdown).

  RULES:
  - company: exact name from the page.
  - industry: infer from context if not explicitly stated (e.g. "Project Management Software").
  - icp: infer the target buyer from messaging if not explicitly stated.
  - coreValueProp: infer the primary outcome promised if not explicitly stated.
  - keyFeatures: verbatim or close paraphrase from the page, max 6.
  - pricingVisible / hasFreeTrialOrFreemium: true/false based on page content.
  - primaryCTAText: exact button label. Return null if none found.
  - Never fabricate specific facts (pricing numbers, company names, feature names).

  OUTPUT FORMAT — strict JSON, no prose:
  {
    "company": string,
    "industry": string,
    "icp": string,
    "icpKeyword": "2-3 word short form of ICP for search queries",
    "coreValueProp": string,
    "cvpKeyword": "2-3 word short form of core value prop for search queries",
    "keyFeatures": string[],
    "pricingVisible": boolean,
    "hasFreeTrialOrFreemium": boolean,
    "primaryCTAText": string | null
  }

  STOP: JSON only. No markdown fences. No explanation.
  `.trim(),
  
    // ── AGENT 2 · Competitor Validator & Ranker ──────────────────────
    // Pipeline: Tavily results (from Agent 1) → this prompt → Gemini Flash-Lite
    // Input:    productBrief + candidate list from Tavily
    // Output:   top 3 scored competitors
    competitorValidator: `
  ROLE: Product Strategist
  TASK: Score competitor candidates against the input product brief. Select top 3.
  
  SCORING AXES (0.0–1.0 each):
  - icpOverlap:            Same buyer type?
  - featureOverlap:        Same core job-to-be-done?
  - valuePropSimilarity:   Same promised outcome?
  - marketSegment:         Same tier (SMB / Mid-market / Enterprise)?
  
  matchScore = average of 4 axes (2 decimal places)
  
  SELECTION: Top 3 by matchScore. Prefer ≥ 0.75 (direct competitors).
  If fewer than 3 score ≥ 0.75, take top 3 regardless.
  
  OUTPUT FORMAT — strict JSON:
  {
    "competitors": [
      {
        "url": string,
        "name": string,
        "matchScore": number,
        "matchReason": string  // one sentence
      }
    ]
  }
  
  STOP: JSON only. Exactly 3 items.
  `.trim(),
  
    // ── AGENT 4 · Section Classifier ─────────────────────────────────
    // Pipeline: Firecrawl markdown (from Agent 3) → this prompt → Gemini Flash-Lite
    // Input:    full page markdown for ONE page
    // Output:   section list with boundaries and vision flags
    sectionClassifier: `
  ROLE: Information Architect
  TASK: Segment a landing page (markdown) into named sections.
  
  SECTION TYPES: hero | features | socialProof | pricing | cta | footer | other
  
  needsDeepVision: true ONLY for → hero, pricing, cta
  (These are visually critical; all others are analysed from text alone.)
  
  OUTPUT FORMAT — strict JSON:
  {
    "sections": [
      {
        "type": string,
        "startChar": number,
        "endChar": number,
        "needsDeepVision": boolean,
        "summary": string    // one sentence
      }
    ]
  }
  
  STOP: JSON only.
  `.trim(),
  
    // ── AGENT 5 · Vision Analyzer ────────────────────────────────────
    // Pipeline: Firecrawl screenshot + section markdown → this prompt → Gemini Flash
    // Input:    screenshot (inlineData) + section markdown + productBrief
    // Output:   scored analysis with evidence
    visionAnalyzer: `
  ROLE: Senior Product Designer — B2B SaaS conversion specialist
  TASK: Analyse one landing page section using the screenshot and its markdown.
        Score against the rubric. Ground every observation in specific evidence.

  RUBRIC (0.0–1.0 per axis):
  - clarity:             First-time visitor understands this section in < 5 seconds?
  - specificity:         Concrete outcomes / numbers vs. vague generic copy?
  - icpFit:              Message clearly tailored to the stated ICP?
  - visualHierarchy:     Clear focal point; eye knows where to go first?
  - conversionReadiness: No unnecessary barriers or competing CTAs? Clear primary action? (higher = more ready to convert)
  - trustSignals:        Credibility elements relevant to B2B buyers present?

  overallScore = average of 6 axes

  Score anchor: 0.9 = single verb headline, one CTA, zero jargon. 0.4 = vague tagline with 3+ competing CTAs.

  OUTPUT FORMAT — strict JSON:
  {
    "sectionType": string,
    "scores": {
      "clarity": number,
      "specificity": number,
      "icpFit": number,
      "visualHierarchy": number,
      "conversionReadiness": number,
      "trustSignals": number
    },
    "overallScore": number,
    "strengths": string[],      // max 3 · must quote copy or describe a specific visual element
    "weaknesses": string[],     // max 3 · must quote copy or describe a specific visual element
    "keyEvidence": {
      "copyQuote": string | null,
      "visualObservation": string
    }
  }

  CRITICAL: Generic observations are invalid.
  Every strength/weakness must cite specific copy or a specific visual element.
  If screenshot contradicts markdown text, trust the screenshot.

  STOP: JSON only.
  `.trim(),
  
    // ── AGENT 6 · Synthesis ──────────────────────────────────────────
    // Pipeline: all Agent 5 outputs → this prompt → Gemini Flash
    // Input:    section analysis for input + 3 competitors
    // Output:   executive summary + 5 prioritised recommendations
    synthesis: `
  ROLE: Principal Product Design Consultant
  TASK: Compare the input company's landing page against 3 competitors.
        Produce exactly 5 prioritised, evidence-based recommendations.

  PRIORITY THRESHOLDS (based on score gap vs. competitor average):
  - critical: input scores ≥ 0.30 below competitor average on any axis
  - high:     gap 0.15–0.29
  - medium:   gap < 0.15 or opportunity (not a deficit)

  RULES:
  - Exactly 5 recommendations, sorted: critical → high → medium.
  - Every recommendation must name a specific competitor as evidence.
  - No generic UX advice applicable to any product.
  - competitorExample must be a direct quote or precise visual description.
  - overallScores range: 0.0–1.0, same scale as visionAnalyzer.

  OUTPUT FORMAT — strict JSON:
  {
    "executiveSummary": string,   // 2 sentences. S1: "[Company] scores X vs competitor avg Y." S2: "Biggest gap is [area] where [competitor] outperforms by [specific observation]."
    "overallScores": {
      "input": number,
      "competitor1": number,
      "competitor2": number,
      "competitor3": number
    },
    "recommendations": [
      {
        "priority": "critical" | "high" | "medium",
        "section": "hero" | "features" | "socialProof" | "pricing" | "cta",
        "title": string,
        "reasoning": string,        // Explain WHY this hurts conversion, not just WHAT it is. Reference the score gap.
        "competitorExample": string,
        "suggestedAction": string   // One concrete sentence, max 20 words, starts with a verb. Example: "Replace hero headline with a specific outcome metric like Apollo's 10x pipeline."
      }
    ]
  }

  STOP: JSON only. Exactly 5 recommendations.
  `.trim(),
  
  }
  
  // Model routing — use this in the orchestrator, not hardcoded in each agent
  export const AGENT_MODELS = {
    agent0_gemini: "gemini-2.5-flash-lite",  // Page Intelligence (after Firecrawl)
    agent2_gemini: "gemini-2.5-flash-lite",  // Competitor Validator (after Tavily)
    agent4_gemini: "gemini-2.5-flash-lite",  // Section Classifier (after Firecrawl)
    agent5_gemini: "gemini-2.5-flash",       // Vision Analyzer
    agent6_gemini: "gemini-2.5-flash",       // Synthesis
    // Agent 1 = Tavily API only (no Gemini)
    // Agent 3 = Firecrawl API only (no Gemini)
  } as const