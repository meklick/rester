import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const POEMS_PATH = resolve("app/src/data/poems.json");
const CATALOG_PATH = resolve("content/aozora-catalog.json");
const CURRENT_YEAR = new Date().getUTCFullYear();
const LATEST_PUBLIC_DOMAIN_DEATH_YEAR = CURRENT_YEAR - 71;
const month = process.env.ROTATION_MONTH || new Date().toISOString().slice(0, 7);
const attempt = process.env.ROTATION_ATTEMPT || "0";

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label}: ${error.message}`);
  }
}

function seededRandom(seed) {
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(records, seed) {
  const result = [...records];
  const random = seededRandom(seed);

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function isEligible(record) {
  return (
    record &&
    typeof record === "object" &&
    typeof record.source_record_id === "string" &&
    typeof record.body === "string" &&
    typeof record.author === "string" &&
    typeof record.source === "string" &&
    typeof record.source_url === "string" &&
    typeof record.death_year === "number" &&
    record.death_year <= LATEST_PUBLIC_DOMAIN_DEATH_YEAR
  );
}

function main() {
  const currentPoems = readJson(POEMS_PATH, "poems.json");
  const catalog = readJson(CATALOG_PATH, "Aozora catalog");

  if (!Array.isArray(currentPoems) || currentPoems.length === 0) {
    throw new Error("poems.json must contain at least one poem before rotation.");
  }
  if (!Array.isArray(catalog.poems)) {
    throw new Error("Aozora catalog must contain a poems array.");
  }

  const currentRecordIds = new Set(
    currentPoems.map((poem) => poem?.source_record_id).filter((id) => typeof id === "string"),
  );
  const candidates = catalog.poems
    .filter(isEligible)
    .filter((record) => !currentRecordIds.has(record.source_record_id))
    .sort((a, b) => a.source_record_id.localeCompare(b.source_record_id, "en"));

  if (candidates.length < currentPoems.length) {
    throw new Error(
      `Not enough eligible Aozora records for a full replacement: need ${currentPoems.length}, found ${candidates.length}.`,
    );
  }

  const selection = shuffled(candidates, `${month}:${attempt}`).slice(0, currentPoems.length);
  const poems = selection.map((record, index) => ({
    id: String(index + 1).padStart(3, "0"),
    body: record.body,
    author: record.author,
    year: record.year,
    genre: record.genre,
    source: record.source,
    source_record_id: record.source_record_id,
    source_url: record.source_url,
  }));

  writeFileSync(POEMS_PATH, `${JSON.stringify(poems, null, 2)}\n`, "utf8");
  console.log(
    `Selected ${poems.length} public-domain poems from the Aozora catalog for ${month} (attempt ${attempt}).`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
