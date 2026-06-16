import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InMemoryStore,
  JsonFileStore,
  defaultStorePath,
  openStore,
  STORE_VERSION,
  type TrackingStore,
} from "../src/store";
import type { Campaign, CampaignRun } from "../src/campaign";

const campaign: Campaign = {
  id: "c1",
  name: "Campaign One",
  brand: { name: "Acme", domain: "acme.com" },
  prompts: [{ prompt: "p" }],
};

function makeRun(runId: string, generatedAt: string, score: number): CampaignRun {
  return {
    campaignId: "c1",
    runId,
    generatedAt,
    brand: "Acme",
    visibilityScore: score,
    report: {
      brand: "Acme",
      generatedAt,
      engines: ["mock"],
      visibilityScore: score,
      coverage: { totalPrompts: 1, totalResponses: 1, mentionRate: 1, citationRate: 1 },
      prompts: [],
      gaps: [],
      shareOfVoice: [],
      recommendations: [],
    },
    engineBreakdown: [],
    competitorComparison: [],
  };
}

// Run the shared contract against every store implementation.
function contract(name: string, make: () => TrackingStore) {
  describe(`TrackingStore contract — ${name}`, () => {
    it("round-trips campaigns (upsert by id)", async () => {
      const store = make();
      await store.saveCampaign(campaign);
      await store.saveCampaign({ ...campaign, name: "Renamed" });
      const all = await store.listCampaigns();
      expect(all).toHaveLength(1);
      expect(all[0]!.name).toBe("Renamed");
      expect((await store.getCampaign("c1"))?.name).toBe("Renamed");
      expect(await store.getCampaign("missing")).toBeUndefined();
    });

    it("appends runs and returns them oldest-first", async () => {
      const store = make();
      await store.recordRun(makeRun("r2", "2026-06-02T00:00:00.000Z", 60));
      await store.recordRun(makeRun("r1", "2026-06-01T00:00:00.000Z", 40));
      const runs = await store.getRuns("c1");
      expect(runs.map((r) => r.runId)).toEqual(["r1", "r2"]);
      expect((await store.latestRun("c1"))?.runId).toBe("r2");
    });

    it("is idempotent on (campaignId, runId) — a repeat upserts in place", async () => {
      const store = make();
      await store.recordRun(makeRun("r1", "2026-06-01T00:00:00.000Z", 40));
      await store.recordRun(makeRun("r1", "2026-06-01T00:00:00.000Z", 88));
      const runs = await store.getRuns("c1");
      expect(runs).toHaveLength(1);
      expect(runs[0]!.visibilityScore).toBe(88);
    });

    it("scopes runs to their campaign", async () => {
      const store = make();
      await store.recordRun(makeRun("r1", "2026-06-01T00:00:00.000Z", 40));
      await store.recordRun({ ...makeRun("x", "2026-06-03T00:00:00.000Z", 99), campaignId: "other" });
      expect(await store.getRuns("c1")).toHaveLength(1);
      expect(await store.getRuns("other")).toHaveLength(1);
      expect(await store.latestRun("empty")).toBeUndefined();
    });
  });
}

contract("InMemoryStore", () => new InMemoryStore());

describe("JsonFileStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `ghairt-store-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    path = join(dir, "nested", "store.json"); // nested → exercises mkdir recursive
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  // The full contract, on a fresh file each time.
  contract("JsonFileStore", () => new JsonFileStore(join(tmpdir(), `ghairt-c-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)));

  it("persists to disk and reloads from a fresh instance (history survives)", async () => {
    const a = new JsonFileStore(path);
    await a.saveCampaign(campaign);
    await a.recordRun(makeRun("r1", "2026-06-01T00:00:00.000Z", 40));
    await a.recordRun(makeRun("r2", "2026-06-02T00:00:00.000Z", 70));

    // A brand-new instance pointed at the same file sees everything.
    const b = new JsonFileStore(path);
    expect((await b.listCampaigns()).map((c) => c.id)).toEqual(["c1"]);
    const runs = await b.getRuns("c1");
    expect(runs.map((r) => r.runId)).toEqual(["r1", "r2"]);
    expect((await b.latestRun("c1"))?.visibilityScore).toBe(70);
  });

  it("writes a version-stamped JSON document", async () => {
    const store = new JsonFileStore(path);
    await store.recordRun(makeRun("r1", "2026-06-01T00:00:00.000Z", 40));
    const raw = JSON.parse(await fs.readFile(path, "utf8"));
    expect(raw.version).toBe(STORE_VERSION);
    expect(Array.isArray(raw.runs)).toBe(true);
    expect(raw.runs[0].runId).toBe("r1");
  });

  it("starts empty for a missing file (no throw)", async () => {
    const store = new JsonFileStore(join(dir, "does-not-exist-yet", "s.json"));
    expect(await store.listCampaigns()).toEqual([]);
    expect(await store.getRuns("c1")).toEqual([]);
  });
});

describe("store factory", () => {
  const KEY = "TRACKER_STORE_PATH";
  afterEach(() => {
    delete process.env[KEY];
  });

  it("defaultStorePath honours TRACKER_STORE_PATH then falls back", () => {
    delete process.env[KEY];
    expect(defaultStorePath()).toBe("./.tracker/store.json");
    process.env[KEY] = "/tmp/custom.json";
    expect(defaultStorePath()).toBe("/tmp/custom.json");
  });

  it("openStore returns a JsonFileStore at the given path", () => {
    const store = openStore(join(tmpdir(), `ghairt-open-${Date.now()}.json`));
    expect(store).toBeInstanceOf(JsonFileStore);
  });
});
