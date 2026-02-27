
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Project Overview

This is a SolidStart documentation/static site built with SolidBase (the SolidJS equivalent of VitePress). The app lives entirely in the `app/` directory.

## Commands

All commands must be run from the `app/` directory:

```bash
pnpm install          # install dependencies
pnpm dev              # start dev server (vinxi)
pnpm build            # production build (vinxi)
pnpm start            # start production server
```

Package manager is **pnpm**. Node >= 22 required.

## Architecture

- **Framework**: SolidStart (meta-framework for SolidJS) with Vinxi as the build tool
- **SolidBase**: Provides documentation site features (sidebar, theme, MDX support) via `@kobalte/solidbase`
- **Routing**: File-based routing in `app/src/routes/` — pages are `.mdx` files with YAML frontmatter
- **Config**: `app/app.config.ts` — wraps SolidStart config with `withSolidBase()` for sidebar navigation and site metadata
- **Entry points**: `app/src/entry-client.tsx` (client hydration), `app/src/entry-server.tsx` (SSR with `getHtmlProps()` from SolidBase)
- **Root component**: `app/src/app.tsx` — uses `SolidBaseRoot` as the router root
- **Path alias**: `~/*` maps to `app/src/*` (configured in tsconfig)
- **Pre-rendering**: Enabled with `crawlLinks: true` in server config

## General rule

- 調査やデバッグにはサブエージェントを活用してコンテキストを節約してください
- 重要な決定事項は定期的にマークダウンファイルに記録してください

## コード規約

- TypeScriptを使用
- テストはVitestで書く
- コミットメッセージは日本語で簡潔に

## Language Preference

- 入力された言語にかかわらず常に英語で思考してください。
- 常に日本語で返答してください。
- ソースコードへのコメントは英語で行ってください。

