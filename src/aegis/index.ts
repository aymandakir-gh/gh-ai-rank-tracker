/**
 * gh-aegis — vendored public API
 *
 * Vendored from gh-aegis v0.1 into gh-ai-rank-tracker to avoid a private
 * package dependency before gh-aegis is published to npm.
 *
 * @example
 * import { createAegisGuard, ThreatType } from "./aegis";
 *
 * const aegis = createAegisGuard({ enabled: true });
 * const result = await aegis.scan(userInput, { scope: "input" });
 * if (!result.safe) {
 *   console.error("Threat detected:", result.threatType, result.score);
 * }
 */
export { createAegisGuard } from "./aegis-guard";
export { ThreatType } from "./types";
export type { AegisGuard, AegisOptions, ScanContext, ScanResult } from "./types";
