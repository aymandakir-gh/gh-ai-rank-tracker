/**
 * Local-first persistence for campaign runs.
 *
 * No external database, no network: history lives in a single JSON file behind
 * the {@link TrackingStore} interface. {@link InMemoryStore} backs tests and
 * ephemeral usage; {@link JsonFileStore} persists to disk with an atomic
 * write-then-rename so a crash mid-write can never corrupt the store.
 *
 * Concurrency: a store instance owns its file. Mutations are serialized through
 * a per-instance write queue and each flush writes a uniquely-named temp file
 * before an atomic rename, so concurrent writes on one instance never race on a
 * shared temp path or corrupt the store. Running two separate processes against
 * the same path is last-writer-wins (out of scope for a local-first store).
 */
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { Campaign, CampaignRun } from "./campaign";

/** On-disk schema version, bumped only on a breaking layout change. */
export const STORE_VERSION = 1;

/** The full persisted document. */
export interface StoreData {
  version: number;
  campaigns: Campaign[];
  runs: CampaignRun[];
}

/** Pluggable history store. All methods are async so file/remote backends fit. */
export interface TrackingStore {
  /** Persist or update (upsert by id) a campaign definition. */
  saveCampaign(campaign: Campaign): Promise<void>;
  /** All known campaigns, in insertion order. */
  listCampaigns(): Promise<Campaign[]>;
  /** A single campaign by id, or undefined. */
  getCampaign(id: string): Promise<Campaign | undefined>;
  /** Append a run; idempotent on (campaignId, runId) — a repeat upserts. */
  recordRun(run: CampaignRun): Promise<void>;
  /** All runs for a campaign, oldest-first. */
  getRuns(campaignId: string): Promise<CampaignRun[]>;
  /** Most recent run for a campaign, or undefined. */
  latestRun(campaignId: string): Promise<CampaignRun | undefined>;
}

/** Oldest-first comparator: by generatedAt, tie-broken by runId for stability. */
function byTimeAsc(a: CampaignRun, b: CampaignRun): number {
  const ta = Date.parse(a.generatedAt);
  const tb = Date.parse(b.generatedAt);
  if (ta !== tb) return ta - tb;
  return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
}

/** In-memory store — never touches disk. Default for tests and one-shot runs. */
export class InMemoryStore implements TrackingStore {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly runs: CampaignRun[] = [];

  async saveCampaign(campaign: Campaign): Promise<void> {
    this.campaigns.set(campaign.id, campaign);
  }

  async listCampaigns(): Promise<Campaign[]> {
    return [...this.campaigns.values()];
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    return this.campaigns.get(id);
  }

  async recordRun(run: CampaignRun): Promise<void> {
    const i = this.runs.findIndex(
      (r) => r.campaignId === run.campaignId && r.runId === run.runId,
    );
    if (i >= 0) this.runs[i] = run;
    else this.runs.push(run);
  }

  async getRuns(campaignId: string): Promise<CampaignRun[]> {
    return this.runs.filter((r) => r.campaignId === campaignId).sort(byTimeAsc);
  }

  async latestRun(campaignId: string): Promise<CampaignRun | undefined> {
    const runs = await this.getRuns(campaignId);
    return runs[runs.length - 1];
  }
}

/**
 * JSON-file store. Lazily loads the file on first access (a missing file starts
 * empty), keeps the document in memory, and persists after every mutation via
 * an atomic temp-file rename. A fresh instance pointed at the same path reloads
 * everything previously written.
 */
export class JsonFileStore implements TrackingStore {
  private data: StoreData | null = null;
  /** Cache the in-flight load so concurrent first-access calls don't double-read. */
  private loadPromise: Promise<StoreData> | null = null;
  /** Serializes flushes so concurrent mutations never race on the temp file. */
  private writeChain: Promise<void> = Promise.resolve();
  /** Monotonic counter for unique temp filenames. */
  private writeSeq = 0;

  constructor(private readonly path: string) {}

  private load(): Promise<StoreData> {
    return (this.loadPromise ??= this.doLoad());
  }

  private async doLoad(): Promise<StoreData> {
    try {
      const raw = await fs.readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      this.data = {
        version: typeof parsed.version === "number" ? parsed.version : STORE_VERSION,
        campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.data = { version: STORE_VERSION, campaigns: [], runs: [] };
      } else {
        this.loadPromise = null; // allow a retry on a transient read error
        throw err;
      }
    }
    return this.data;
  }

  /**
   * Queue a flush of the current in-memory document. Mutations call this instead
   * of writing directly: each flush is chained after the previous one (so the
   * temp-file write+rename never interleave) and uses a unique temp name. The
   * returned promise resolves once *this* mutation's data has been flushed.
   */
  private enqueuePersist(): Promise<void> {
    const run = () => this.flush();
    // Continue the chain on both success and failure so one failed write does
    // not wedge every later write.
    this.writeChain = this.writeChain.then(run, run);
    return this.writeChain;
  }

  private async flush(): Promise<void> {
    const data = this.data ?? { version: STORE_VERSION, campaigns: [], runs: [] };
    await fs.mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${this.writeSeq++}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, this.path); // atomic on POSIX + Windows
  }

  async saveCampaign(campaign: Campaign): Promise<void> {
    const data = await this.load();
    const i = data.campaigns.findIndex((c) => c.id === campaign.id);
    if (i >= 0) data.campaigns[i] = campaign;
    else data.campaigns.push(campaign);
    await this.enqueuePersist();
  }

  async listCampaigns(): Promise<Campaign[]> {
    const data = await this.load();
    return [...data.campaigns];
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const data = await this.load();
    return data.campaigns.find((c) => c.id === id);
  }

  async recordRun(run: CampaignRun): Promise<void> {
    const data = await this.load();
    const i = data.runs.findIndex(
      (r) => r.campaignId === run.campaignId && r.runId === run.runId,
    );
    if (i >= 0) data.runs[i] = run;
    else data.runs.push(run);
    await this.enqueuePersist();
  }

  async getRuns(campaignId: string): Promise<CampaignRun[]> {
    const data = await this.load();
    return data.runs.filter((r) => r.campaignId === campaignId).sort(byTimeAsc);
  }

  async latestRun(campaignId: string): Promise<CampaignRun | undefined> {
    const runs = await this.getRuns(campaignId);
    return runs[runs.length - 1];
  }
}

/** Default store path: `$TRACKER_STORE_PATH` or `./.tracker/store.json`. */
export function defaultStorePath(): string {
  return process.env["TRACKER_STORE_PATH"] || "./.tracker/store.json";
}

/**
 * Open the canonical local store. With an explicit path (or `TRACKER_STORE_PATH`)
 * you get a {@link JsonFileStore}; otherwise the default file path is used.
 */
export function openStore(path: string = defaultStorePath()): TrackingStore {
  return new JsonFileStore(path);
}
