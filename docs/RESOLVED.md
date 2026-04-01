# 解決済み

## 白画面問題：SSR/CSR シード同期 + GitHub Pages デプロイ

### 症状
- ローカルおよび GitHub Pages (`https://meklick.github.io/rester/`) で白画面が表示される
- `curl http://localhost:3000/` のレスポンスに `<!--!$e000000--><!--!$/e000000-->` が含まれ、詩のコンテンツが空

### 原因（複数）

#### 1. `app.tsx` に `Suspense` がなかった（最重要）
`FileRoutes` の遅延ロードされるルートコンポーネントは SSR で正しく解決されるために `Suspense` が必須。
欠落していたため、プリレンダリング時に SolidJS のエラーバウンダリがエラーをキャッチし `<!--!$e000000-->` を出力していた。

#### 2. `pnpm-lock.yaml` と `package.json` のバージョン不一致
- `@solidjs/start`: lockfile `^1.1.0` ↔ manifest `^1.0.11`
- `vinxi`: lockfile `^0.5.6` ↔ manifest `^0.0.10`
- `typescript@^5.9.3` が lockfile に未追記
- Docker ビルドが `ERR_PNPM_OUTDATED_LOCKFILE` で失敗していた

#### 3. Router の `base` prop 未設定（GitHub Pages）
GitHub Pages では `BASE_PATH=/rester/` でビルドするが、`Router` に `base` を渡していなかったため、
クライアントサイドのルーティングが `/rester/` 配下を正しく処理できなかった。

#### 4. `vite.base` の設定不整合
アセット URL を GitHub Pages 用に `/rester/_build/assets/...` にするには `vite.base` の設定が必要だが、
設定値が不適切でプリレンダリング時の SSR を壊していた。

### 対応

#### `app/src/app.tsx`
`Suspense` を追加し、`Router` に `base` prop を注入:
```tsx
export default function App() {
  const routerBase = (import.meta as any).env.APP_BASE_PATH as string;
  const base = routerBase === "/" ? undefined : routerBase;
  return (
    <Router base={base} root={(props) => <Suspense>{props.children}</Suspense>}>
      <FileRoutes />
    </Router>
  );
}
```

#### `app/app.config.ts`
`server.baseURL` を正規化し、`APP_BASE_PATH` を `vite.define` で注入:
```typescript
const baseURL = basePath === "/" ? "/" : basePath.replace(/\/+$/, "");

export default defineConfig({
  server: { baseURL, prerender: { crawlLinks: true } },
  vite: {
    define: { "import.meta.env.APP_BASE_PATH": JSON.stringify(baseURL) },
  } as any,
});
```

#### `app/package.json` + `app/pnpm-lock.yaml`
バージョンを lockfile に合わせて更新:
- `@solidjs/start`: `^1.0.11` → `^1.1.0`
- `vinxi`: `^0.0.10` → `^0.5.6`
- `typescript@^5.9.3` を lockfile に追記

#### `app/src/routes/index.tsx`（追加実装）
SSR/CSR ハイドレーションミスマッチ対策として、シード付き乱数でシャッフル順を同期:
- SSR: `crypto.randomUUID()` でシード生成 → `data-poem-seed` 属性として HTML に埋め込む
- CSR: `document.querySelector("[data-poem-seed]")` でシードを読み取り → 同一シャッフル順を再現
- `onMount` / `mounted` フラグを削除し、SSR 時点から詩を表示

### 診断コマンド

```bash
# SSR エラーの確認（<!--!$e000000--> が含まれれば SSR 失敗）
curl -s http://localhost:3000/ | grep -o "e000000"

# プリレンダリング結果の確認（poem-body があれば SSR 成功）
grep -c "poem-body" app/.output/public/index.html

# GitHub Pages 用ビルドのアセット URL 確認
BASE_PATH=/rester/ pnpm --dir app build
grep -o 'src="[^"]*"' app/.output/public/index.html
```

---

## GitHub Models API: `models: read` 権限が必要

### 症状

GitHub Actions で GitHub Models API（`models.inference.ai.azure.com`）を呼び出すと以下のエラーが発生する:

```
AuthenticationError: 401 The `models` permission is required to access this endpoint
```

### 原因

`GITHUB_TOKEN` はワークフローで `permissions` を明示した場合、宣言した権限のみが付与される。`models: read` を宣言していないと GitHub Models API へのアクセスが拒否される。

### 対応

ワークフローの `permissions` に `models: read` を追加する:

```yaml
permissions:
  contents: write
  pull-requests: write
  models: read
```

### 一次ソース

- **公式発表（Changelog）**: https://github.blog/changelog/2025-05-15-modelsread-now-required-for-github-models-access/
- **GITHUB_TOKEN の権限設定**: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token
- **GitHub Models クイックスタート**: https://docs.github.com/en/github-models/quickstart

---

## GITHUB_TOKEN で作成した PR でワークフローが起動しない

### 症状

`auto-add-poem.yml` が `GITHUB_TOKEN` を使って PR を作成しても、`pull_request` イベントがトリガーされず `public-domain-check` や `validate` ワークフローが動作しない。

### 原因

GitHub の仕様で、`GITHUB_TOKEN` による操作は `pull_request` などのイベントを発火しない。無限ループ防止のためのセキュリティ制限。

### 対応

PR 作成に Personal Access Token (PAT) を使用する。

1. GitHub の **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** で PAT を作成
   - Repository access: 対象リポジトリのみ
   - Permissions: `Contents: Read and Write`、`Pull requests: Read and Write`
2. リポジトリの **Settings** → **Secrets and variables** → **Actions** に `GH_PAT` として登録
3. `auto-add-poem.yml` の PR 作成ステップで `GH_TOKEN: ${{ secrets.GH_PAT }}` を使用

PAT で作成した PR は通常のユーザー操作と同等に扱われ、`pull_request` イベントが発火する。

---

## GitHub Actions が PR を作成できない

### 症状

`gh pr create` 実行時に以下のエラーが発生する:

```
pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)
```

### 原因

リポジトリの Actions 設定でデフォルトの **GitHub Actions による PR 作成・承認が無効** になっている。

### 対応

リポジトリの **Settings** → **Actions** → **General** → **Workflow permissions** セクションで、**Allow GitHub Actions to create and approve pull requests** にチェックを入れて **Save**。

---

## npm run tsc` 実行時に型定義エラーが大量に発生する。

### 原因
  1. node_modules 由来の型不足
      - @cloudflare/workers-types など多数の “未インストール依存” が原因
      - src/app.tsx の ImportMeta に env がない
      - types に vite/client を入れるのが一般的です
  3. app.config.ts の vite.base 型エラー
      - SolidStart の ViteCustomizableConfig が base を受け付けない型定義
      - 実際の runtime は base を許容するので、型だけの問題です

### 対応
  - app/tsconfig.json に skipLibCheck: true と types: ["node", "vite/client"]
  - app/app.config.ts の vite.base を /${base}_build/ に戻し、型を as any で回避

### 確認方法

```
npm run tsc
```