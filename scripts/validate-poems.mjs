import { readFileSync } from "fs";
import { resolve } from "path";

const filePath = resolve("app/src/data/poems.json");
let poems;

try {
  poems = JSON.parse(readFileSync(filePath, "utf-8"));
} catch (e) {
  console.error("❌ Invalid JSON:", e.message);
  process.exit(1);
}

if (!Array.isArray(poems)) {
  console.error("❌ poems.json must be a JSON array");
  process.exit(1);
}

const ids = new Set();
const bodies = new Set();
const validGenres = new Set(["俳句", "短歌", "詩", null]);
let errors = 0;

for (const [i, poem] of poems.entries()) {
  const label = `[${i}] id="${poem?.id ?? "unknown"}"`;

  if (!poem || typeof poem !== "object" || Array.isArray(poem)) {
    console.error(`❌ ${label} must be an object`);
    errors++;
    continue;
  }

  if (typeof poem.id !== "string" || !/^\d{3}$/.test(poem.id)) {
    console.error(`❌ ${label} missing or invalid field: id (three digits required)`);
    errors++;
  }
  if (typeof poem.body !== "string" || poem.body.trim() === "") {
    console.error(`❌ ${label} missing or invalid field: body`);
    errors++;
  }
  if (typeof poem.author !== "string" || poem.author.trim() === "") {
    console.error(`❌ ${label} missing or invalid field: author`);
    errors++;
  }
  if (!(poem.year === null || (typeof poem.year === "number" && Number.isFinite(poem.year)))) {
    console.error(`❌ ${label} invalid field: year must be a number or null`);
    errors++;
  }
  if (!validGenres.has(poem.genre ?? null)) {
    console.error(`❌ ${label} invalid field: genre`);
    errors++;
  }
  if (!(poem.source === null || typeof poem.source === "string")) {
    console.error(`❌ ${label} invalid field: source must be a string or null`);
    errors++;
  }
  if (typeof poem.id === "string" && ids.has(poem.id)) {
    console.error(`❌ ${label} duplicate id: ${poem.id}`);
    errors++;
  }
  if (typeof poem.id === "string") ids.add(poem.id);

  if (typeof poem.body === "string") {
    const normalizedBody = poem.body.replace(/\r\n/g, "\n").trim();
    if (normalizedBody && bodies.has(normalizedBody)) {
      console.error(`❌ ${label} duplicate body`);
      errors++;
    }
    if (normalizedBody) bodies.add(normalizedBody);
  }
}

if (errors > 0) {
  console.error(`\n❌ Validation failed with ${errors} error(s)`);
  process.exit(1);
}

console.log(`✅ All ${poems.length} poems validated successfully.`);
