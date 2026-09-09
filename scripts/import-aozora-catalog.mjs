import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUTPUT_PATH = resolve("content/aozora-catalog.json");

const SOURCES = [
  {
    id: "aozora-000153-816",
    title: "一握の砂",
    author: "石川啄木",
    death_year: 1912,
    year: 1910,
    genre: "短歌",
    card_url: "https://www.aozora.gr.jp/cards/000153/card816.html",
    raw_text_url:
      "https://raw.githubusercontent.com/aozorahack/aozorabunko_text/master/cards/000153/files/816_ruby_5621/816_ruby_5621.txt",
    parser: "takuboku",
  },
  {
    id: "aozora-000885-2557",
    title: "晶子詩篇全集",
    author: "与謝野晶子",
    death_year: 1942,
    year: null,
    genre: "詩",
    card_url: "https://www.aozora.gr.jp/cards/000885/card2557.html",
    raw_text_url:
      "https://raw.githubusercontent.com/aozorahack/aozorabunko_text/master/cards/000885/files/2557_ruby_13911/2557_ruby_13911.txt",
    parser: "akiko",
  },
  {
    id: "aozora-000162-885",
    title: "秋草と虫の音",
    author: "若山牧水",
    death_year: 1928,
    year: null,
    genre: "短歌",
    card_url: "https://www.aozora.gr.jp/cards/000162/card885.html",
    raw_text_url:
      "https://raw.githubusercontent.com/aozorahack/aozorabunko_text/master/cards/000162/files/885_ruby_18398/885_ruby_18398.txt",
    parser: "wakayama",
  },
  {
    id: "aozora-000305-1896",
    title: "寒山落木　卷一",
    author: "正岡子規",
    death_year: 1902,
    year: null,
    genre: "俳句",
    card_url: "https://www.aozora.gr.jp/cards/000305/card1896.html",
    raw_text_url:
      "https://raw.githubusercontent.com/aozorahack/aozorabunko_text/master/cards/000305/files/1896_ruby/1896_ruby.txt",
    parser: "shiki",
  },
];

function cleanLine(line) {
  return line
    .replace(/［＃[^］]*］/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/｜/g, "")
    .replace(/《[^》]*》/g, "")
    .replace(/^[　\s]+|[　\s]+$/g, "")
    .trim();
}

function inRange(rawText, startMarker) {
  const start = rawText.indexOf(startMarker);
  const end = rawText.indexOf("底本：");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not find the expected collection boundaries for ${startMarker}.`);
  }

  return rawText.slice(start, end);
}

function parseTakuboku(rawText) {
  const range = inRange(rawText, "東海《とうかい》の小島");
  const seen = new Set();

  return range.split(/\n\s*\n/).flatMap((block) => {
    const lines = block.split("\n").map(cleanLine).filter(Boolean);
    if (lines.length !== 3) return [];

    const body = lines.join("\n");
    if (body.length < 8 || body.length > 180 || seen.has(body)) return [];
    seen.add(body);
    return [body];
  });
}

function parseAkiko(rawText) {
  const range = inRange(rawText, "［＃４字下げ］草と人");
  const titlePattern = /［＃４字下げ］([^［\n]+)［＃[^］]*］/g;
  const matches = [...range.matchAll(titlePattern)];
  const seen = new Set();
  const poems = [];

  for (const [index, match] of matches.entries()) {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? range.length;
    const lines = range
      .slice(start, end)
      .split("\n")
      .map(cleanLine)
      .filter(Boolean);
    const body = lines.join("\n");

    if (lines.length === 0 || lines.length > 40 || body.length < 8 || body.length > 900 || seen.has(body)) {
      continue;
    }

    seen.add(body);
    poems.push(body);
  }

  return poems;
}

function parseWakayama(rawText) {
  const range = inRange(rawText, "をとこへし、これは一本二本");
  const seen = new Set();
  const poems = [];
  let insideVerse = false;

  for (const rawLine of range.split("\n")) {
    if (rawLine.includes("［＃ここから３字下げ］")) {
      insideVerse = true;
      continue;
    }
    if (rawLine.includes("［＃ここで字下げ終わり］")) {
      insideVerse = false;
      continue;
    }
    if (!insideVerse) continue;

    const body = cleanLine(rawLine);
    if (body.length < 12 || body.length > 100 || seen.has(body)) continue;
    seen.add(body);
    poems.push(body);
  }

  return poems;
}

function parseShiki(rawText) {
  const range = inRange(rawText, "梅のさく門は茶屋なり");
  const seen = new Set();
  const poems = [];

  for (const rawLine of range.split("\n")) {
    const body = cleanLine(rawLine).replace(/^(?:（[^）]*）|\([^)]*\))\s*/, "");
    if (
      body.length < 6 ||
      body.length > 80 ||
      body.includes("　") ||
      /[。、]/.test(body) ||
      /^(明治|第一期|第[一二三四五六七八九十]|寒山落木|[一二三四五六七八九十]$)/.test(body) ||
      seen.has(body)
    ) {
      continue;
    }
    seen.add(body);
    poems.push(body);
  }

  return poems;
}

const parsers = {
  takuboku: parseTakuboku,
  akiko: parseAkiko,
  wakayama: parseWakayama,
  shiki: parseShiki,
};

async function fetchSourceText(source) {
  const response = await fetch(source.raw_text_url);
  if (!response.ok) {
    throw new Error(`Could not download ${source.title}: ${response.status} ${response.statusText}`);
  }

  return new TextDecoder("shift_jis").decode(await response.arrayBuffer()).replace(/\r\n/g, "\n");
}

async function main() {
  const poems = [];
  const bodies = new Set();

  for (const source of SOURCES) {
    const parser = parsers[source.parser];
    const bodiesFromSource = parser(await fetchSourceText(source));

    if (bodiesFromSource.length < 18) {
      throw new Error(`Expected at least 18 records for ${source.title}, but found ${bodiesFromSource.length}.`);
    }

    let number = 0;
    for (const body of bodiesFromSource) {
      if (bodies.has(body)) continue;
      bodies.add(body);
      number++;
      poems.push({
        source_record_id: `${source.id}-${String(number).padStart(3, "0")}`,
        source_id: source.id,
        body,
        author: source.author,
        year: source.year,
        genre: source.genre,
        source: source.title,
        source_url: source.card_url,
        death_year: source.death_year,
      });
    }

    console.log(`Imported ${number} records from ${source.author}「${source.title}」.`);
  }

  writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify({ schema_version: 1, sources: SOURCES, poems }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Imported ${poems.length} Aozora records into ${OUTPUT_PATH}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
