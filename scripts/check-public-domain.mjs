import { execFileSync } from "node:child_process";

const POEMS_PATH = "app/src/data/poems.json";
const CATALOG_PATH = "content/aozora-catalog.json";
const CURRENT_YEAR = new Date().getUTCFullYear();
const LATEST_PUBLIC_DOMAIN_DEATH_YEAR = CURRENT_YEAR - 71;

function gitShow(ref, path) {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function parseJson(raw, label) {
  if (raw == null) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function parsePoems(raw, label) {
  if (raw == null) return [];
  const parsed = parseJson(raw, label);

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }

  return parsed;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function findNewOrChangedPoems(beforePoems, afterPoems) {
  const beforeFingerprints = new Set(beforePoems.map((poem) => stableStringify(poem)));
  return afterPoems.filter((poem) => !beforeFingerprints.has(stableStringify(poem)));
}

function matchesCatalogRecord(poem, record) {
  return ["body", "author", "year", "genre", "source", "source_url"].every(
    (field) => poem?.[field] === record?.[field],
  );
}

function verifyPoem(poem, catalogById) {
  const id = poem?.id ?? null;
  const sourceRecordId = poem?.source_record_id ?? null;
  const record = typeof sourceRecordId === "string" ? catalogById.get(sourceRecordId) : null;

  if (!record) {
    return {
      id,
      author: poem?.author ?? null,
      death_year: null,
      status: "unknown",
      is_public_domain: false,
      reason: "Missing or unknown Aozora catalog record",
    };
  }

  if (!matchesCatalogRecord(poem, record)) {
    return {
      id,
      author: poem?.author ?? null,
      death_year: record.death_year ?? null,
      status: "unknown",
      is_public_domain: false,
      reason: "Poem fields do not match the referenced Aozora catalog record",
    };
  }

  const deathYear = record.death_year;
  const isPublicDomain = typeof deathYear === "number" && deathYear <= LATEST_PUBLIC_DOMAIN_DEATH_YEAR;

  return {
    id,
    author: record.author ?? null,
    death_year: deathYear ?? null,
    status: isPublicDomain ? "public_domain" : "not_public_domain",
    is_public_domain: isPublicDomain,
    ...(isPublicDomain ? {} : { reason: "Author is not outside the configured copyright term" }),
  };
}

function main() {
  const baseSha = process.env.GITHUB_BASE_SHA || "HEAD~1";
  const headSha = process.env.GITHUB_HEAD_SHA || "HEAD";
  const beforePoems = parsePoems(gitShow(baseSha, POEMS_PATH), `${baseSha}:${POEMS_PATH}`);
  const afterRaw = gitShow(headSha, POEMS_PATH);

  if (afterRaw == null) {
    throw new Error(`Could not read ${POEMS_PATH} at ${headSha}`);
  }

  const afterPoems = parsePoems(afterRaw, `${headSha}:${POEMS_PATH}`);
  const newPoems = findNewOrChangedPoems(beforePoems, afterPoems);

  if (newPoems.length === 0) {
    console.log(
      JSON.stringify({
        ok: true,
        all_passed: true,
        base_sha: baseSha,
        head_sha: headSha,
        message: "No new poems were added.",
        total_new_poems: 0,
        checks: [],
      }),
    );
    return;
  }

  const catalog = parseJson(gitShow(headSha, CATALOG_PATH), `${headSha}:${CATALOG_PATH}`);
  if (!catalog || !Array.isArray(catalog.poems)) {
    throw new Error(`Could not read a valid Aozora catalog at ${headSha}`);
  }

  const catalogById = new Map(
    catalog.poems
      .filter((record) => record && typeof record.source_record_id === "string")
      .map((record) => [record.source_record_id, record]),
  );
  const checks = newPoems.map((poem) => verifyPoem(poem, catalogById));
  const allPassed = checks.every((check) => check.is_public_domain === true);

  console.log(
    JSON.stringify({
      ok: allPassed,
      all_passed: allPassed,
      base_sha: baseSha,
      head_sha: headSha,
      current_year: CURRENT_YEAR,
      latest_death_year_for_pd: LATEST_PUBLIC_DOMAIN_DEATH_YEAR,
      total_new_poems: newPoems.length,
      checks,
    }),
  );

  process.exitCode = allPassed ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.log(JSON.stringify({ ok: false, all_passed: false, error: error.message, checks: [] }));
  process.exitCode = 1;
}
