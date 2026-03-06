import { createSignal, For, Show, onMount } from "solid-js";
import type { Component } from "solid-js";
import { isServer } from "solid-js/web";
import poems from "~/data/poems.json";

type Poem = (typeof poems)[number];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToUint32(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleWithSeed(arr: number[], seed: string): number[] {
  const a = [...arr];
  const random = mulberry32(seedToUint32(seed));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeSeed(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for SSR environments without Web Crypto API
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getSeedFromDom(): string | undefined {
  if (isServer) return undefined;
  return document.querySelector<HTMLElement>("[data-poem-seed]")?.dataset.poemSeed;
}

const Home: Component = () => {
  const initialSeed = isServer ? makeSeed() : getSeedFromDom() ?? makeSeed();
  const [seed, setSeed] = createSignal(initialSeed);
  const [order, setOrder] = createSignal(shuffleWithSeed(poems.map((_, i) => i), initialSeed));
  const [index, setIndex] = createSignal(0);

  const poem = (): Poem => poems[order()[index()]];

  onMount(() => {
    // Re-randomize on every client visit so the pre-rendered seed is not reused
    const freshSeed = makeSeed();
    setSeed(freshSeed);
    setOrder(shuffleWithSeed(poems.map((_, i) => i), freshSeed));
    setIndex(0);
  });

  const advance = () => {
    const next = index() + 1;
    if (next >= poems.length) {
      const nextSeed = makeSeed();
      setSeed(nextSeed);
      setOrder(shuffleWithSeed(poems.map((_, i) => i), nextSeed));
      setIndex(0);
      return;
    }
    setIndex(next);
  };

  return (
    <div class="screen" data-poem-seed={seed()} onClick={advance}>
      <Show keyed when={poem()}>
        {(currentPoem) => {
          const bodyChars = Array.from(currentPoem.body);
          const authorDelay = Math.min(bodyChars.length * 100 + 200, 5000);

          return (
            <div class="poem-container">
              <p class="poem-body">
                <For each={bodyChars}>
                  {(char, charIndex) => {
                    if (char === "\n") return <br />;
                    const delayMs = Math.min(charIndex() * 100, 4800);
                    return (
                      <span class="poem-char" style={{ "animation-delay": `${delayMs}ms` }}>
                        {char}
                      </span>
                    );
                  }}
                </For>
              </p>
              <p class="poem-author" style={{ "animation-delay": `${authorDelay}ms` }}>
                — {currentPoem.author}
              </p>
            </div>
          );
        }}
      </Show>
    </div>
  );
};

export default Home;
