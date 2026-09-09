import fs from "node:fs/promises";
import OpenAI from "openai";

const FILE_PATH = "app/src/data/poems.json";
const MODEL = "gpt-4o-mini";
const MAX_ATTEMPTS_PER_POEM = 3;
const CURRENT_YEAR = new Date().getUTCFullYear();
const LATEST_PUBLIC_DOMAIN_DEATH_YEAR = CURRENT_YEAR - 71;

// Every author in this list died no later than 1955. This keeps the scheduled
// job from creating PRs for authors that fail the project's copyright policy.
const PUBLIC_DOMAIN_AUTHORS = [
  { name: "松尾芭蕉", deathYear: 1694, genre: "俳句" },
  { name: "与謝蕪村", deathYear: 1784, genre: "俳句" },
  { name: "小林一茶", deathYear: 1828, genre: "俳句" },
  { name: "正岡子規", deathYear: 1902, genre: "俳句" },
  { name: "河東碧梧桐", deathYear: 1937, genre: "俳句" },
  { name: "内藤鳴雪", deathYear: 1926, genre: "俳句" },
  { name: "石川啄木", deathYear: 1912, genre: "短歌" },
  { name: "与謝野晶子", deathYear: 1942, genre: "短歌" },
  { name: "北原白秋", deathYear: 1942, genre: "短歌" },
  { name: "若山牧水", deathYear: 1928, genre: "短歌" },
  { name: "斎藤茂吉", deathYear: 1953, genre: "短歌" },
  { name: "島木赤彦", deathYear: 1926, genre: "短歌" },
  { name: "萩原朔太郎", deathYear: 1942, genre: "詩" },
  { name: "宮沢賢治", deathYear: 1933, genre: "詩" },
  { name: "島崎藤村", deathYear: 1943, genre: "詩" },
  { name: "中原中也", deathYear: 1937, genre: "詩" },
  { name: "金子みすゞ", deathYear: 1930, genre: "詩" },
  { name: "野口雨情", deathYear: 1945, genre: "詩" },
  { name: "山村暮鳥", deathYear: 1924, genre: "詩" },
  { name: "土井晩翠", deathYear: 1952, genre: "詩" },
];

const SYSTEM_PROMPT =
  "You are a Japanese literary editor. Return an exact, public-domain Japanese poem quotation. Do not modernize spelling or invent text. Respond ONLY with a valid JSON object.";

function normalizeBody(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\u3000]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function parseJsonObject(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model response did not contain a JSON object");
    return JSON.parse(match[0]);
  }
}

function validateCandidate(value, author) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Suggested poem is not a JSON object");
  }
  if (typeof value.body !== "string" || value.body.trim() === "") {
    throw new Error("Suggested poem.body must be a non-empty string");
  }
  if (value.author !== author.name) {
    throw new Error(`Suggested poem.author must be ${author.name}`);
  }
  if (!(value.year === null || (typeof value.year === "number" && Number.isFinite(value.year)))) {
    throw new Error("Suggested poem.year must be a number or null");
  }
  if (value.genre !== author.genre) {
    throw new Error(`Suggested poem.genre must be ${author.genre}`);
  }
  if (typeof value.source !== "string" || value.source.trim() === "") {
    throw new Error("Suggested poem.source must be a non-empty string");
  }
}

function getRotationAttempt() {
  const rawAttempt = process.env.ROTATION_ATTEMPT ?? "0";
  const attempt = Number.parseInt(rawAttempt, 10);
  if (!Number.isInteger(attempt) || attempt < 0 || attempt > 2) {
    throw new Error("ROTATION_ATTEMPT must be an integer from 0 to 2");
  }
  return attempt;
}

async function suggestPoem(client, author, usedBodies) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_POEM; attempt += 1) {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1200,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Choose one exact work by ${author.name} (died ${author.deathYear}) for a Japanese poetry collection.`,
            "The text must be an original quotation from a published work, not a summary or imitation.",
            "Use original Japanese orthography. Do not include a title in body.",
            `Return ONLY JSON with: body (string), author (must be \"${author.name}\"), year (number or null), genre (must be \"${author.genre}\"), source (non-empty source collection or publication title).`,
          ].join("\n"),
        },
      ],
    });

    const raw = response.choices[0].message.content ?? "";
    const parsed = parseJsonObject(raw);
    validateCandidate(parsed, author);

    const normalizedBody = normalizeBody(parsed.body);
    if (usedBodies.has(normalizedBody)) continue;

    return {
      body: parsed.body.trim(),
      author: author.name,
      year: parsed.year === null ? null : Math.trunc(parsed.year),
      genre: author.genre,
      source: parsed.source.trim(),
    };
  }

  throw new Error(`Could not find a unique valid poem for ${author.name}`);
}

async function main() {
  const apiKey = process.env.GITHUB_TOKEN;
  if (!apiKey) throw new Error("GITHUB_TOKEN is required");

  if (PUBLIC_DOMAIN_AUTHORS.some((author) => author.deathYear > LATEST_PUBLIC_DOMAIN_DEATH_YEAR)) {
    throw new Error("The public-domain author list contains an ineligible author");
  }

  const existingPoems = JSON.parse(await fs.readFile(FILE_PATH, "utf8"));
  if (!Array.isArray(existingPoems)) throw new Error(`${FILE_PATH} must be a JSON array`);

  // A rotation always replaces the collection one-for-one so repository and
  // GitHub Pages output size do not grow over time.
  const count = existingPoems.length;
  if (count === 0) throw new Error("Cannot replace an empty poem collection");
  const rotationAttempt = getRotationAttempt();
  const usedBodies = new Set(existingPoems.map((poem) => normalizeBody(poem?.body)));
  const client = new OpenAI({ baseURL: "https://models.inference.ai.azure.com", apiKey });
  const replacements = [];

  for (let index = 0; index < count; index += 1) {
    const author = PUBLIC_DOMAIN_AUTHORS[(index + rotationAttempt) % PUBLIC_DOMAIN_AUTHORS.length];
    const poem = await suggestPoem(client, author, usedBodies);
    usedBodies.add(normalizeBody(poem.body));
    replacements.push({ id: String(index + 1).padStart(3, "0"), ...poem });
  }

  await fs.writeFile(FILE_PATH, `${JSON.stringify(replacements, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ replaced: true, count, authors: [...new Set(replacements.map((p) => p.author))] }));
}

main().catch((error) => {
  console.error(error);
  console.log(JSON.stringify({ replaced: false, reason: error.message }));
  process.exit(1);
});
