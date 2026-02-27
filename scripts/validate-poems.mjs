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
let errors = 0;

for (const [i, poem] of poems.entries()) {
  const label = `[${i}] id="${poem.id}"`;

  if (!poem.id || typeof poem.id !== "string") {
    console.error(`❌ ${label} missing or invalid field: id`);
    errors++;
  }
  if (!poem.body || typeof poem.body !== "string") {
    console.error(`❌ ${label} missing or invalid field: body`);
    errors++;
  }
  if (!poem.author || typeof poem.author !== "string") {
    console.error(`❌ ${label} missing or invalid field: author`);
    errors++;
  }
  if (poem.id && ids.has(poem.id)) {
    console.error(`❌ ${label} duplicate id: ${poem.id}`);
    errors++;
  }
  if (poem.id) ids.add(poem.id);
}

if (errors > 0) {
  console.error(`\n❌ Validation failed with ${errors} error(s)`);
  process.exit(1);
}

console.log(`✅ All ${poems.length} poems validated successfully.`);
