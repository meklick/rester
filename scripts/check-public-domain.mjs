import { execFileSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";

const FILE_PATH = "app/src/data/poems.json";
const CURRENT_YEAR = 2026;
const PUBLIC_DOMAIN_THRESHOLD_YEARS = 70;
const MODEL = "claude-haiku-4-5-20251001";
const SYSTEM_PROMPT =
  "You are a literary historian specializing in Japanese poetry. Answer questions about Japanese poets' biographical information concisely and accurately.";

function gitShow(ref) {
  try {
    return execFileSync("git", ["show", `${ref}:${FILE_PATH}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function parsePoems(raw, label) {
  if (raw == null) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }

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
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function fetchDeathYear(client, author) {
  const userPrompt = `What year did ${author} die? Reply with ONLY a JSON object like: {\"death_year\": 1902} or {\"death_year\": null} if unknown or still living.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 128,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const parsed = extractJsonObject(text);
  if (!parsed || !("death_year" in parsed)) {
    throw new Error(`Unexpected API response for author \"${author}\": ${text}`);
  }

  const { death_year: deathYear } = parsed;
  if (deathYear === null) return null;

  if (typeof deathYear === "number" && Number.isFinite(deathYear)) {
    return Math.trunc(deathYear);
  }

  return null;
}

function findNewPoems(beforePoems, afterPoems) {
  const beforeIds = new Set(
    beforePoems
      .map((p) => (p && typeof p === "object" ? p.id : undefined))
      .filter((id) => typeof id === "string")
  );

  const beforeFingerprints = new Set(beforePoems.map((p) => stableStringify(p)));

  return afterPoems.filter((poem) => {
    if (poem && typeof poem === "object" && typeof poem.id === "string") {
      return !beforeIds.has(poem.id);
    }
    return !beforeFingerprints.has(stableStringify(poem));
  });
}

async function main() {
  const baseSha = process.env.GITHUB_BASE_SHA || "HEAD~1";
  const headSha = process.env.GITHUB_HEAD_SHA || "HEAD";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const beforePoems = parsePoems(gitShow(baseSha), `${baseSha}:${FILE_PATH}`);
  const afterRaw = gitShow(headSha);

  if (afterRaw == null) {
    throw new Error(`Could not read ${FILE_PATH} at ${headSha}`);
  }

  const afterPoems = parsePoems(afterRaw, `${headSha}:${FILE_PATH}`);
  const newPoems = findNewPoems(beforePoems, afterPoems);

  if (newPoems.length === 0) {
    const result = {
      ok: true,
      all_passed: true,
      base_sha: baseSha,
      head_sha: headSha,
      message: "No new poems were added.",
      total_new_poems: 0,
      checks: [],
    };
    console.log(JSON.stringify(result));
    process.exit(0);
  }

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when new poems are added");
  }

  const client = new Anthropic({ apiKey });
  const checks = [];

  for (const poem of newPoems) {
    const author = poem?.author ?? null;
    const id = poem?.id ?? null;

    if (typeof author !== "string" || author.trim() === "") {
      checks.push({
        id,
        author,
        death_year: null,
        status: "unknown",
        is_public_domain: false,
        reason: "Missing or invalid author field",
      });
      continue;
    }

    const deathYear = await fetchDeathYear(client, author.trim());

    let status = "unknown";
    let isPublicDomain = false;

    if (deathYear !== null) {
      isPublicDomain = CURRENT_YEAR - deathYear >= PUBLIC_DOMAIN_THRESHOLD_YEARS;
      status = isPublicDomain ? "public_domain" : "not_public_domain";
    }

    checks.push({
      id,
      author: author.trim(),
      death_year: deathYear,
      status,
      is_public_domain: isPublicDomain,
    });
  }

  const allPassed = checks.every((c) => c.is_public_domain === true);

  const result = {
    ok: allPassed,
    all_passed: allPassed,
    base_sha: baseSha,
    head_sha: headSha,
    current_year: CURRENT_YEAR,
    minimum_death_year_for_pd: CURRENT_YEAR - PUBLIC_DOMAIN_THRESHOLD_YEARS,
    total_new_poems: newPoems.length,
    checks,
  };

  console.log(JSON.stringify(result));
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  const result = {
    ok: false,
    all_passed: false,
    error: error.message,
    checks: [],
  };
  console.error(error);
  console.log(JSON.stringify(result));
  process.exit(1);
});
