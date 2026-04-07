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
  | "features"
  | "socialProof"
  | "pricing"
  | "cta"
  | "footer";

export interface ClassifiedSection {
  type: SectionType;
  markdownSlice: string;
  needsDeepVision: boolean;
}

export interface PageSections {
  url: string;
  sections: ClassifiedSection[];
}

// ── Section Analysis (Agent 5 output) ──────────────────────────

export interface SectionFinding {
  site: string; // "input" or competitor URL/name
  score: number; // 0–1
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
}

// ── Recommendations (Agent 6 output) ───────────────────────────

export type Priority = "critical" | "high" | "medium";

export interface Recommendation {
  priority: Priority;
  section?: SectionType;
  title: string;
  reasoning: string;
  exampleFromCompetitor: string;
  suggestedAction: string;
}

// ── Full Analysis Result ───────────────────────────────────────

export interface AnalysisResult {
  productBrief: ProductBrief;
  competitors: Competitor[];
  pages: PageData[];
  sections: SectionAnalysis[];
  recommendations: Recommendation[];
  executiveSummary?: string;
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

export interface SSEProgressEvent {
  type: "progress";
  stage: AgentStage;
  status: StageStatus;
  message: string;
}

export interface SSECompleteEvent {
  type: "complete";
  data: AnalysisResult;
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
  recommendations?: Recommendation[];
  executiveSummary?: string;
}
