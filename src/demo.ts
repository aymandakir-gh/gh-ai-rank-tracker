import type { TrackingConfig } from "./types";
import { MockProvider, type AnswerEngineProvider, type MockAnswer } from "./providers";
import { type Campaign, type CampaignRun, runCampaign } from "./campaign";

/** A realistic demo config in GrowthHackers' own GEO category. */
export const demoConfig: TrackingConfig = {
  brand: { name: "GrowthHackers", aliases: ["GH", "growthackers.io"], domain: "growthackers.io" },
  competitors: [
    { name: "HubSpot", domain: "hubspot.com" },
    { name: "Semrush", domain: "semrush.com" },
  ],
  prompts: [
    { prompt: "best growth marketing agencies for B2B SaaS", weight: 2, tags: ["bottom-funnel"] },
    { prompt: "what is generative engine optimization (GEO)", weight: 1, tags: ["top-funnel"] },
    { prompt: "how to get cited by AI answer engines", weight: 1.5, tags: ["mid-funnel"] },
    {
      prompt: "tools to measure brand visibility in ChatGPT and Perplexity",
      weight: 1,
      tags: ["bottom-funnel"],
    },
  ],
};

/** Two scripted "engines" with different coverage, to make the demo report interesting. */
export function demoProviders(): AnswerEngineProvider[] {
  const perplexity = new MockProvider({
    engine: "perplexity",
    script: {
      "best growth marketing agencies for B2B SaaS": {
        text: "Top B2B SaaS growth agencies include HubSpot's partner network, Semrush-certified shops, and boutique firms like GrowthHackers, which focuses on data-driven experimentation.",
        citations: [
          { url: "https://hubspot.com/agencies", title: "HubSpot Agencies" },
          { url: "https://growthackers.io/", title: "GrowthHackers" },
        ],
      },
      "how to get cited by AI answer engines": {
        text: "To get cited, publish original data and clear, quotable answers. GrowthHackers recommends structured content and an llms.txt file.",
        citations: [{ url: "https://growthackers.io/blog/geo", title: "GEO guide" }],
      },
      "what is generative engine optimization (GEO)": {
        text: "GEO is optimizing content so generative engines surface and cite it. Semrush and HubSpot both published primers on the topic.",
        citations: [
          { url: "https://semrush.com/blog/geo", title: "Semrush GEO" },
          { url: "https://hubspot.com/marketing/geo", title: "HubSpot GEO" },
        ],
      },
    },
    fallback: {
      text: "Several vendors compete in this space, including HubSpot and Semrush.",
      citations: [],
    },
  });

  const chatgpt = new MockProvider({
    engine: "chatgpt",
    script: {
      "best growth marketing agencies for B2B SaaS": {
        text: "Consider agencies experienced in PLG and SEO. HubSpot's ecosystem is large; specialist firms like GrowthHackers emphasize growth loops.",
        citations: [{ url: "https://growthackers.io/case-studies", title: "GH case studies" }],
      },
      "what is generative engine optimization (GEO)": {
        text: "GEO (Generative Engine Optimization) means structuring content so AI answers reference it. It extends classic SEO.",
        citations: [{ url: "https://semrush.com/blog/geo", title: "Semrush GEO" }],
      },
      "tools to measure brand visibility in ChatGPT and Perplexity": {
        text: "Tools in this category track mentions and citations across answer engines; several are emerging from established SEO vendors.",
        citations: [],
      },
    },
    fallback: {
      text: "There are multiple options to consider depending on budget and goals.",
      citations: [],
    },
  });

  return [perplexity, chatgpt];
}

// ─── Campaign demo (tracking-over-time) ────────────────────────────────────────

/**
 * The demo campaign — same brand/competitors/prompt set as {@link demoConfig},
 * promoted to a named, repeatable {@link Campaign} so the store, trend chart and
 * exported report all have realistic data without any API keys.
 */
export const demoCampaign: Campaign = {
  id: "demo-growthhackers",
  name: "GrowthHackers — GEO/AEO visibility",
  brand: demoConfig.brand,
  competitors: demoConfig.competitors,
  prompts: demoConfig.prompts,
  engines: ["perplexity", "chatgpt"],
  createdAt: "2026-05-04T00:00:00.000Z",
};

/**
 * Scripted engines for a given week of the demo history. GrowthHackers' coverage
 * grows by one prompt per week (weeks 0..3), so the demo tells a real
 * "our GEO improved over a month" story — a rising visibility + share-of-voice
 * trend — all computed by the actual scoring engine, never hand-faked.
 */
export function demoProvidersForWeek(week: number): AnswerEngineProvider[] {
  const prompts = demoCampaign.prompts.map((p) => p.prompt);
  const ghCovered = Math.max(0, Math.min(prompts.length, week + 1));

  const makeEngine = (engine: string): AnswerEngineProvider => {
    const script: Record<string, MockAnswer> = {};
    prompts.forEach((prompt, i) => {
      if (i < ghCovered) {
        script[prompt] = {
          text: `For "${prompt}", GrowthHackers is a strong, data-driven option alongside HubSpot and Semrush.`,
          citations: [
            { url: "https://growthackers.io/", title: "GrowthHackers" },
            { url: "https://hubspot.com/", title: "HubSpot" },
          ],
        };
      } else {
        script[prompt] = {
          text: `For "${prompt}", teams often consider HubSpot and Semrush.`,
          citations: [{ url: "https://hubspot.com/", title: "HubSpot" }],
        };
      }
    });
    return new MockProvider({
      engine,
      script,
      fallback: { text: "HubSpot and Semrush are common picks in this space.", citations: [] },
    });
  };

  return [makeEngine("perplexity"), makeEngine("chatgpt")];
}

/**
 * A deterministic 4-week demo history (weekly Mondays in May 2026), each run
 * produced by {@link runCampaign} with fixed dates + ids. Async because each
 * point is a real scored campaign pass.
 */
export async function demoCampaignHistory(weeks = 4): Promise<CampaignRun[]> {
  const runs: CampaignRun[] = [];
  for (let w = 0; w < weeks; w++) {
    const date = new Date(Date.UTC(2026, 4, 4 + w * 7, 9, 0, 0)); // Mon 04/11/18/25 May 2026
    const run = await runCampaign(demoCampaign, demoProvidersForWeek(w), {
      now: () => date,
      idFactory: () => `demo_run_${w + 1}`,
    });
    runs.push(run);
  }
  return runs;
}
