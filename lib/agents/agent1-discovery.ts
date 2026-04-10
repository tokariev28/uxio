import type { PipelineContext, CompetitorCandidate } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

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
  apiKey: string
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
      label: "alternatives",
      query: `${brief.company} alternatives SaaS ${brief.industry} ${currentYear}`,
    },
    {
      label: "feature",
      query: `best ${cvpKeyword} software for ${icpKeyword} ${currentYear}`,
    },
    {
      label: "g2",
      query: `site:g2.com ${brief.company} competitors`,
    },
    {
      label: "vs",
      query: `"${brief.company}" vs`,
    },
    {
      label: "category",
      query: `${brief.industry} software alternatives ${currentYear}`,
    },
  ];

  // Emit the actual search queries as chips
  onActions?.(queries.map((q) => q.query));

  const inputDomain = rootDomain(ctx.inputUrl);

  const settled = await Promise.allSettled(
    queries.map(({ label, query }) =>
      tavilySearch(query, apiKey).then((results) =>
        results.map((r) => ({ url: r.url, label }))
      )
    )
  );

  const allResults = settled
    .filter((r): r is PromiseFulfilledResult<{ url: string; label: string }[]> => r.status === "fulfilled")
    .map((r) => r.value);

  if (allResults.length === 0) {
    throw new AgentError("agent1", "All Tavily search queries failed");
  }

  const map = new Map<string, CompetitorCandidate>();

  for (const results of allResults) {
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

  return Array.from(map.values());
}
