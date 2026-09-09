import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RAW_TEXT_URL =
  "https://raw.githubusercontent.com/aozorahack/aozorabunko_text/master/cards/000153/files/816_ruby_5621/816_ruby_5621.txt";
const CARD_URL = "https://www.aozora.gr.jp/cards/000153/card816.html";
const OUTPUT_PATH = resolve("content/aozora-catalog.json");

const SOURCE = {
  id: "aozora-000153-816",
  title: "一握の砂",
  author: "石川啄木",
  death_year: 1912,
  year: 1910,
  genre: "短歌",
  card_url: CARD_URL,
  raw_text_url: RAW_TEXT_URL,
};

function cleanLine(line) {
  return line
    .replace(/［＃[^］]*］/g, "")
    .replace(/｜/g, "")
    .replace(/《[^》]*》/g, "")
    .trim();
}

function parseTanka(rawText) {
  const start = rawText.indexOf("東海《とうかい》の小島");
  const end = rawText.indexOf("底本：");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not find the poem collection boundaries in the Aozora source.");
  }

  const seen = new Set();
  const poems = [];

  for (const block of rawText.slice(start, end).split(/\n\s*\n/)) {
    const lines = block.split("\n").map(cleanLine).filter(Boolean);
    if (lines.length !== 3) continue;

    const body = lines.join("\n");
    if (body.length < 8 || body.length > 180 || seen.has(body)) continue;
    seen.add(body);

    poems.push({
      source_record_id: `${SOURCE.id}-${String(poems.length + 1).padStart(3, "0")}`,
      source_id: SOURCE.id,
      body,
      author: SOURCE.author,
      year: SOURCE.year,
      genre: SOURCE.genre,
      source: SOURCE.title,
      source_url: SOURCE.card_url,
      death_year: SOURCE.death_year,
    });
  }

  if (poems.length < 100) {
    throw new Error(`Expected at least 100 tanka records, but found ${poems.length}.`);
  }

  return poems;
}

async function main() {
  const response = await fetch(RAW_TEXT_URL);
  if (!response.ok) {
    throw new Error(`Could not download Aozora source: ${response.status} ${response.statusText}`);
  }

  const rawText = new TextDecoder("shift_jis").decode(await response.arrayBuffer()).replace(/\r\n/g, "\n");
  const poems = parseTanka(rawText);
  const catalog = {
    schema_version: 1,
    sources: [SOURCE],
    poems,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Imported ${poems.length} Aozora records into ${OUTPUT_PATH}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
