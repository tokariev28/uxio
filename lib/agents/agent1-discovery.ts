import { z } from "zod";
import type { PipelineContext, CompetitorCandidate, ProductBrief } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { aiGenerateStructured, CHAINS } from "@/lib/ai/gateway";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";

const META_DOMAINS = new Set([
  'g2.com', 'capterra.com', 'trustpilot.com', 'getapp.com',
  'softwareadvice.com', 'gartner.com', 'sourceforge.net',
  'alternativeto.net', 'techcrunch.com', 'forbes.com',
  'linkedin.com', 'twitter.com', 'facebook.com', 'youtube.com',
  'reddit.com', 'quora.com',
]);

interface TavilyResult {
  url: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

function rootDomain(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function nameFromDomain(domain: string): string {
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

async function tavilySearch(
  query: string,
  apiKey: string,
  excludeDomains: string[]
): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 10,
      days: 365,
      exclude_domains: excludeDomains,
    }),
  });

  if (!res.ok) {
    throw new AgentError(
      "agent1",
      `Tavily request failed: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as TavilyResponse;
  return data.results ?? [];
}

// ── LLM-based competitor discovery ────────────────────────────────────────────
// Runs in parallel with Tavily. Uses the model's training knowledge to surface
// well-known direct competitors that Tavily searches might miss (e.g. Jira for
// a project management tool). Results are merged into the candidate map with a
// base `mentions` signal so Agent 2 can weigh them appropriately.
const LlmCompetitorSchema = z.array(z.object({
  url: z.string(),
  name: z.string(),
}));

async function llmDiscovery(
  brief: ProductBrief
): Promise<Array<{ url: string; name: string }>> {
  const userMessage = [
    `Company: ${brief.company}`,
    `Industry: ${brief.industry}`,
    `ICP: ${brief.icp}`,
    `Core value proposition: ${brief.coreValueProp}`,
  ].join("\n");

  try {
    const competitors = await aiGenerateStructured(CHAINS.flashLite, {
      system: AGENT_PROMPTS.competitorDiscovery,
      prompt: userMessage,
      schema: LlmCompetitorSchema,
    });
    return competitors
      .filter((c) => {
        try { new URL(c.url); return true; } catch { return false; }
      })
      .slice(0, 8);
  } catch (err) {
    console.warn(
      "[agent1] LLM competitor discovery failed:",
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

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
  const currentYear = new Date().getFullYear();

  const queries: Array<{ label: string; query: string }> = [
    {
      // Simple direct query — avoids over-fitting to the product's own industry label,
      // which is often a marketing phrase rather than a searchable category.
      label: "alternatives",
      query: `${brief.company} alternatives ${currentYear}`,
    },
    {
      label: "feature",
      query: `best ${cvpKeyword} software for ${icpKeyword} ${currentYear}`,
    },
    {
      // Search for comparison articles referencing G2 Leaders in this category.
      // Avoids site: restriction so results include competitor homepages, not
      // just g2.com URLs (which META_DOMAINS would filter out).
      label: "leaders",
      query: `"${brief.industry}" software top rated leaders ${currentYear}`,
    },
    {
      label: "vs",
      query: `"${brief.company}" vs`,
    },
    {
      // Use icpKeyword instead of industry label — more likely to match how
      // users search for tools in this space.
      label: "category",
      query: `best tools for ${icpKeyword} ${currentYear}`,
    },
  ];

  const inputDomain = rootDomain(ctx.inputUrl);

  // ── Compute deterministic filter conditions BEFORE Tavily calls ───────────
  // Moved up so we can include filtered domains in exclude_domains, freeing
  // Tavily result slots for actual competitors.
  const briefText = `${brief.industry} ${brief.coreValueProp}`.toLowerCase();

  const VCS_PLATFORM_DOMAINS = new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'sourcehut.org']);
  const isVcsTool = /version.?control|code.?host|source.?code|git.*(platform|hosting)|repository|vcs/.test(briefText);

  const MODEL_HUB_DOMAINS = new Set(['huggingface.co', 'kaggle.com', 'paperswithcode.com']);
  const isModelHub = /model.*(hub|registry|sharing)|dataset.*(hub|sharing)|ai.*(community|repository)/.test(briefText);

  const CONSUMER_AI_DOMAINS = new Set(['character.ai', 'perplexity.ai', 'poe.com', 'you.com']);
  const isConsumerAI = /consumer.*(chat|assistant)|ai.*(search|companion)|personal.*(ai|assistant)/.test(briefText);

  const ORCHESTRATION_DOMAINS = new Set(['langchain.com', 'llamaindex.ai']);

  const DOCS_WIKI_DOMAINS = new Set(['notion.so', 'slab.com', 'slite.com', 'nuclino.com', 'tettra.com']);
  const isDocsWikiTool = /wiki|knowledge.?base|documentation.*(platform|tool)|note.?taking|connected.?workspace|team.?docs/.test(briefText);

  // ── Build Tavily exclude_domains list ─────────────────────────────────────
  // Pre-filtering at the API level frees all 10 result slots for real competitors.
  // Post-fetch filtering is kept as a safety net below.
  const excludeDomains = [...META_DOMAINS, inputDomain];
  if (!isVcsTool) excludeDomains.push(...VCS_PLATFORM_DOMAINS);
  if (!isModelHub) excludeDomains.push(...MODEL_HUB_DOMAINS);
  if (!isConsumerAI) excludeDomains.push(...CONSUMER_AI_DOMAINS);
  excludeDomains.push(...ORCHESTRATION_DOMAINS);
  if (!isDocsWikiTool) excludeDomains.push(...DOCS_WIKI_DOMAINS);

  // ── Run Tavily searches and LLM discovery in parallel ─────────────────────
  // Emit each short label as its search completes — progressive reveal.
  const emitted: string[] = [];
  const [tavilySettled, llmCandidates] = await Promise.all([
    Promise.allSettled(
      queries.map(({ label, query }) =>
        tavilySearch(query, apiKey, excludeDomains).then((results) => {
          emitted.push(label);
          onActions?.([...emitted]);
          return results.map((r) => ({ url: r.url, label }));
        })
      )
    ),
    llmDiscovery(brief),
  ]);

  const allTavilyResults = tavilySettled
    .filter((r): r is PromiseFulfilledResult<{ url: string; label: string }[]> => r.status === "fulfilled")
    .map((r) => r.value);

  if (allTavilyResults.length === 0 && llmCandidates.length === 0) {
    throw new AgentError("agent1", "All Tavily search queries failed");
  }

  const map = new Map<string, CompetitorCandidate>();

  // ── Process Tavily results ─────────────────────────────────────────────────
  for (const results of allTavilyResults) {
    for (const { url, label } of results) {
      let domain: string;
      try {
        domain = rootDomain(url);
      } catch {
        continue;
      }

      if (domain === inputDomain) continue;
      if (META_DOMAINS.has(domain)) continue;

      if (map.has(domain)) {
        map.get(domain)!.mentions += 1;
      } else {
        // Normalize to root homepage — prevents blog/deep-page URLs from
        // propagating through the scraping pipeline
        const { protocol, hostname } = new URL(url);
        map.set(domain, {
          url: `${protocol}//${hostname}`,
          name: nameFromDomain(domain),
          source: label,
          mentions: 1,
        });
      }
    }
  }

  // ── Merge LLM-discovered competitors ──────────────────────────────────────
  // LLM-only entries get mentions=2 (base knowledge signal).
  // Entries confirmed by both Tavily and LLM get +2 boost — strongest signal.
  for (const { url, name } of llmCandidates) {
    let domain: string;
    try { domain = rootDomain(url); } catch { continue; }

    if (domain === inputDomain || META_DOMAINS.has(domain)) continue;

    if (map.has(domain)) {
      map.get(domain)!.mentions += 2;
    } else {
      const { protocol, hostname } = new URL(url);
      map.set(domain, {
        url: `${protocol}//${hostname}`,
        name,
        source: "llm-knowledge",
        mentions: 2,
      });
    }
  }

  // ── Deterministic domain filters (safety net) ────────────────────────────
  // These domains are also pre-excluded via Tavily's exclude_domains parameter.
  // The post-fetch filters below catch anything that slips through (e.g. from
  // LLM discovery or if Tavily's exclusion is imperfect).

  // VCS / code-hosting platforms — issue tracking is a bundled minor feature
  if (!isVcsTool) {
    for (const d of VCS_PLATFORM_DOMAINS) {
      if (map.delete(d)) {
        console.warn(`[agent1] Filtered VCS platform '${d}' — not a code-hosting product`);
      }
    }
  }

  // Model hubs / AI community platforms — not commercial API competitors
  if (!isModelHub) {
    for (const d of MODEL_HUB_DOMAINS) {
      if (map.delete(d)) {
        console.warn(`[agent1] Filtered model hub '${d}' — not a model hub product`);
      }
    }
  }

  // Consumer AI products — not API platform competitors
  if (!isConsumerAI) {
    for (const d of CONSUMER_AI_DOMAINS) {
      if (map.delete(d)) {
        console.warn(`[agent1] Filtered consumer AI product '${d}' — not a consumer AI product`);
      }
    }
  }

  // Orchestration frameworks — developer libraries, never direct SaaS competitors
  for (const d of ORCHESTRATION_DOMAINS) {
    if (map.delete(d)) {
      console.warn(`[agent1] Filtered orchestration framework '${d}'`);
    }
  }

  // Docs/wiki platforms — not PM/issue-tracking competitors
  if (!isDocsWikiTool) {
    for (const d of DOCS_WIKI_DOMAINS) {
      if (map.delete(d)) {
        console.warn(`[agent1] Filtered docs/wiki platform '${d}' — not a docs/wiki product`);
      }
    }
  }

  return Array.from(map.values());
}
