import type { TrackingConfig } from "./types";
import { MockProvider, type AnswerEngineProvider } from "./providers";

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
