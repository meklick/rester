import { defineConfig } from "@solidjs/start/config";

const githubRepo = process.env.GITHUB_REPOSITORY;
const repoName = githubRepo?.split("/")[1];
const inferredBase =
  repoName && !repoName.endsWith(".github.io") ? `/${repoName}/` : "/";
const basePath = process.env.BASE_PATH ?? inferredBase;

export default defineConfig({
  server: {
    baseURL: basePath,
    prerender: {
      crawlLinks: true,
    },
  },
  // SolidStart's Vite type doesn't expose `base`, but Vite supports it.
  vite: {
    base: `${basePath}_build/`,
  } as any,
});
