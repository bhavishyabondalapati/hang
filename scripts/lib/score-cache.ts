import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SCORES_VERSION, type ImageScores } from "../../src/lib/image-filter";

/**
 * Model scores per artwork id, cached on disk so thresholds can be re-tuned without re-running the models.
 * The file records which models + labels made the scores; if those change, the old scores are discarded.
 */
export const SCORE_CACHE = ".cache/image-scores.json";
export type ScoreCache = Record<string, ImageScores | { error: string }>;

export function loadScoreCache(): ScoreCache {
  if (!existsSync(SCORE_CACHE)) return {};
  const file = JSON.parse(readFileSync(SCORE_CACHE, "utf8")) as { version?: string; scores?: ScoreCache };
  return file.version === SCORES_VERSION ? (file.scores ?? {}) : {};
}

export function saveScoreCache(scores: ScoreCache) {
  mkdirSync(".cache", { recursive: true });
  writeFileSync(SCORE_CACHE, JSON.stringify({ version: SCORES_VERSION, scores }));
}
