import { createSignal, onMount, Show } from "solid-js";
import type { Component } from "solid-js";
import poems from "~/data/poems.json";

type Poem = (typeof poems)[number];

function shuffle(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const Home: Component = () => {
  const [order, setOrder] = createSignal<number[]>([]);
  const [index, setIndex] = createSignal(0);
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setOrder(shuffle(poems.map((_, i) => i)));
    setIndex(0);
    setMounted(true);
  });

  const poem = (): Poem => poems[order()[index()]];

  const advance = () => {
    const next = index() + 1;
    if (next >= poems.length) {
      setOrder(shuffle(poems.map((_, i) => i)));
      setIndex(0);
    } else {
      setIndex(next);
    }
  };

  return (
    <div class="screen" onClick={advance}>
      <Show when={mounted()}>
        <div class="poem-container">
          <p class="poem-body">{poem().body}</p>
          <p class="poem-author">— {poem().author}</p>
        </div>
      </Show>
    </div>
  );
};

export default Home;
