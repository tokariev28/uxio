// ── Product Brief (Agent 0 output) ──────────────────────────────

export interface ProductBrief {
  company: string;
  industry: string;
  icp: string;
  icpKeyword: string;   // short form, e.g. "enterprise dev teams"
  coreValueProp: string;
  cvpKeyword: string;   // short form, e.g. "ship faster AI"
  keyFeatures: string[];
  pricingModel?: string;
  primaryCTAText?: string;
  pricingVisible?: boolean;
  hasFreeTrialOrFreemium?: boolean;
}

// ── Competitor Discovery & Validation (Agents 1–2) ─────────────

export interface CompetitorCandidate {
  url: string;
  name: string;
  source: string; // which Tavily query found it
  mentions: number; // how many queries returned it
}

export interface Competitor {
  url: string;
  name: string;
  matchScore: number; // 0–1
  matchReason: string;
}

// ── Page Data (Agent 3 output) ─────────────────────────────────

export interface PageData {
  url: string;
  markdown: string;
  screenshotBase64?: string;
}

// ── Section Classification (Agent 4 output) ────────────────────

export type SectionType =
  | "hero"
  | "navigation"
  | "features"
  | "benefits"
  | "socialProof"
  | "testimonials"
  | "integrations"
  | "howItWorks"
  | "pricing"
  | "faq"
  | "cta"
  | "footer"
  | "videoDemo"
  | "comparison"
  | "metrics";

export interface ClassifiedSection {
  type: SectionType;
  markdownSlice: string;
  scrollFraction: number; // 0.0–1.0, startChar / totalMarkdownLength
}

export interface PageSections {
  url: string;
  sections: ClassifiedSection[];
}

// ── Section Analysis (Agent 5 output) ──────────────────────────

export interface SectionScores {
  // Communication (×1.5 weight in overallScore)
  clarity: number;
  specificity: number;
  icpFit: number;
  // Conversion Architecture (×1.2 weight)
  attentionRatio: number;
  ctaQuality: number;
  trustSignals: number;
  // Visual Quality (×1.0 weight)
  visualHierarchy: number;
  cognitiveEase: number;
  typographyReadability: number;
  densityBalance: number;
}

export interface SectionFinding {
  site: string; // "input" or competitor URL/name
  score: number; // 0–1
  scores?: SectionScores;
  confidence?: number; // 0–1, how confident the agent is in this finding
  strengths: string[];
  weaknesses: string[];
  summary: string;
  evidence: {
    headlineText?: string;
    ctaText?: string;
    quote?: string;
    visualNote?: string;
  };
}

export interface SectionAnalysis {
  sectionType: SectionType;
  findings: SectionFinding[];
  scrollFraction?: number; // 0.0–1.0, from input page's Agent 4 classification
}

// ── Recommendations (Agent 6 output) ───────────────────────────

export type Priority = "critical" | "high" | "medium";

export interface Recommendation {
  priority: Priority;
  section: SectionType;
  title: string;
  reasoning: string;
  exampleFromCompetitor: string;
  suggestedAction: string;
  impact?: string; // Expected outcome of implementing this recommendation
  confidence?: number; // 0–1, how confident the agent is in this recommendation
}

// ── Overall Scores (Agent 6 output) ───────────────────────────

export interface OverallScores {
  input: number;
  [competitorKey: string]: number;
}

// ── Full Analysis Result ───────────────────────────────────────

export interface AnalysisResult {
  productBrief: ProductBrief;
  competitors: Competitor[];
  pages: PageData[];
  sections: SectionAnalysis[];
  recommendations: Recommendation[];
  executiveSummary?: string;
  overallScores?: OverallScores;
  pageSections?: PageSections[]; // for section-precise screenshot positioning in UI
}

// ── SSE Events ─────────────────────────────────────────────────

export type AgentStage =
  | "page-intelligence"
  | "discovery"
  | "validation"
  | "scraping"
  | "classification"
  | "analysis"
  | "synthesis";

export type StageStatus = "running" | "done" | "error";

export interface StageState {
  status: StageStatus | "pending";
  message: string;
  actions?: string[];
}

export interface SSEProgressEvent {
  type: "progress";
  stage: AgentStage;
  status: StageStatus;
  message: string;
  actions?: string[];
}

export interface SSECompleteEvent {
  type: "complete";
  data: AnalysisResult;
  quality?: {
    overallQuality: number;
    signals: {
      evidenceGrounding: number;
      scoreVariance: number;
      specificityRate: number;
      competitorPresence: number;
      fieldCompleteness: number;
    };
    warnings: string[];
  };
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export type SSEEvent = SSEProgressEvent | SSECompleteEvent | SSEErrorEvent;

// ── Pipeline Context (passed between agents) ──────────────────

export interface PipelineContext {
  inputUrl: string;
  productBrief?: ProductBrief;
  candidates?: CompetitorCandidate[];
  competitors?: Competitor[];
  pages?: PageData[];
  pageSections?: PageSections[];
  sectionAnalyses?: SectionAnalysis[];
  failedUrls?: string[];
  recommendations?: Recommendation[];
  executiveSummary?: string;
  overallScores?: OverallScores;
}
