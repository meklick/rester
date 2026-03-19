import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";

const FILE_PATH = "app/src/data/poems.json";
const MODEL = "claude-sonnet-4-6";
const MAX_ATTEMPTS = 3;
const SYSTEM_PROMPT =
  "You are a Japanese literary expert. Your task is to suggest a public domain Japanese poem or waka that is NOT already in the provided collection. The author MUST have died before 1956 (70+ years ago from 2026). Respond ONLY with a valid JSON object.";

function normalizeBody(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\u3000]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function extractText(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function parseJsonObject(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Model response did not contain a JSON object");
    }
    return JSON.parse(match[0]);
  }
}

function validatePoemShape(poem) {
  if (!poem || typeof poem !== "object" || Array.isArray(poem)) {
    throw new Error("Suggested poem is not a JSON object");
  }

  if (typeof poem.body !== "string" || poem.body.trim() === "") {
    throw new Error("Suggested poem.body must be a non-empty string");
  }

  if (typeof poem.author !== "string" || poem.author.trim() === "") {
    throw new Error("Suggested poem.author must be a non-empty string");
  }

  if (!(poem.year === null || (typeof poem.year === "number" && Number.isFinite(poem.year)))) {
    throw new Error("Suggested poem.year must be a number or null");
  }

  const validGenres = new Set(["俳句", "短歌", "詩", null]);
  if (!validGenres.has(poem.genre ?? null)) {
    throw new Error("Suggested poem.genre must be one of: 俳句, 短歌, 詩, or null");
  }

  if (!(poem.source === null || typeof poem.source === "string")) {
    throw new Error("Suggested poem.source must be a string or null");
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  const genreFilter = (process.env.GENRE_FILTER || "").trim();

  const raw = await fs.readFile(FILE_PATH, "utf8");
  const poems = JSON.parse(raw);
  if (!Array.isArray(poems)) {
    throw new Error(`${FILE_PATH} must be a JSON array`);
  }

  const maxId = poems.reduce((max, poem) => {
    const num = Number.parseInt(String(poem?.id ?? ""), 10);
    return Number.isFinite(num) ? Math.max(max, num) : max;
  }, 0);
  const nextId = String(maxId + 1).padStart(3, "0");

  const existingBodies = new Set(poems.map((p) => normalizeBody(p?.body)));
  const client = new Anthropic({ apiKey });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const genreInstruction = genreFilter ? ` Please suggest a ${genreFilter} specifically.` : "";
    const userPrompt = [
      "Current collection JSON:",
      JSON.stringify(poems, null, 2),
      "",
      `Please suggest one Japanese poem or waka for the collection. The author must have died before 1956.${genreInstruction}`,
      "Reply with ONLY a JSON object with these fields: body (string, use \\n for line breaks), author (string, Japanese name), year (number or null), genre (one of: 俳句, 短歌, 詩, or null), source (string or null). Do NOT include the id field.",
    ].join("\n");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = extractText(response);
    const parsed = parseJsonObject(text);
    validatePoemShape(parsed);

    const candidate = {
      id: nextId,
      body: parsed.body,
      author: parsed.author,
      year: parsed.year === null ? null : Math.trunc(parsed.year),
      genre: parsed.genre ?? null,
      source: parsed.source ?? null,
    };

    if (existingBodies.has(normalizeBody(candidate.body))) {
      if (attempt === MAX_ATTEMPTS) {
        console.log(JSON.stringify({ added: false, reason: "Claude suggested duplicate body 3 times" }));
        process.exit(0);
      }
      continue;
    }

    const updatedPoems = [...poems, candidate];
    await fs.writeFile(FILE_PATH, `${JSON.stringify(updatedPoems, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ added: true, poem: candidate }));
    process.exit(0);
  }

  console.log(JSON.stringify({ added: false, reason: "No poem suggestion was produced" }));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  console.log(JSON.stringify({ added: false, reason: error.message }));
  process.exit(1);
});
