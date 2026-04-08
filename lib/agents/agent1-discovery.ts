import type { PipelineContext, CompetitorCandidate } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

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
      max_results: 7,
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

  const queries: Array<{ label: string; query: string }> = [
    {
      label: "alternatives",
      query: `${brief.company} alternatives SaaS ${brief.industry}`,
    },
    {
      label: "feature",
      query: `best ${cvpKeyword} software for ${icpKeyword}`,
    },
    {
      label: "g2",
      query: `site:g2.com ${brief.company} competitors`,
    },
  ];

  // Emit the actual search queries as chips
  onActions?.(queries.map((q) => q.query));

  const inputDomain = rootDomain(ctx.inputUrl);

  const allResults = await Promise.all(
    queries.map(({ label, query }) =>
      tavilySearch(query, apiKey).then((results) =>
        results.map((r) => ({ url: r.url, label }))
      )
    )
  );

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

      if (map.has(domain)) {
        map.get(domain)!.mentions += 1;
      } else {
        map.set(domain, {
          url,
          name: nameFromDomain(domain),
          source: label,
          mentions: 1,
        });
      }
    }
  }

  return Array.from(map.values());
}
