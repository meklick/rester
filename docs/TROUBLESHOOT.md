# トラブルシューティング記録

## 症状

Podman コンテナで `pnpm dev --host` を実行し `http://localhost:3000` にアクセスすると、HTTP 200 が返るが画面が真っ白になる。

---

## 調査の流れ

### 1. コンテナログの確認

**疑い**: コンテナが正常に起動していないのではないか。

**コマンド**:
```bash
podman logs rester
```

**結果**: vinxi dev server は正常に起動しており、`http://localhost:3000/` でリッスン中であることを確認。ただし以下の警告が繰り返し出力されていた。

```
No route matched for preloading js assets
```

**判断**: サーバー自体は起動している。問題は別にある。

---

### 2. 返却される HTML の確認

**疑い**: SSR が失敗してコンテンツが空になっているのではないか。

**コマンド**:
```bash
curl -s http://localhost:3000/ | head -60
```

**結果**: HTML は正常に返ってきていた。`<div id="app">` 内は `<!--!$e0000000--><!--!$/e0000000-->` のみ（SolidJS の SSR マーカー）で、実コンテンツは空。

CSS はインラインで埋め込まれており、`<script type="module" src="/_build/@vite/client">` などのスクリプトタグも含まれていた。

**判断**: SSR 側は正常。`Show when={mounted()}` が SSR 時は false のため、コンテンツがレンダリングされないのは仕様通り。クライアント側 JS のハイドレーションが機能していない可能性が高い。

---

### 3. JS アセットの HTTP ステータス確認

**疑い**: JS ファイルが 404 などで取得できていないのではないか。

**コマンド**:
```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/_build/@vite/client"
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/_build/@fs/app/src/entry-client.tsx"
```

**結果**: どちらも HTTP 200。

**判断**: ステータスコードは正常だが、内容が問題の可能性がある。

---

### 4. Content-Type ヘッダーの確認

**疑い**: JS ファイルが誤った Content-Type で返されており、ブラウザがモジュールとして実行を拒否しているのではないか。

**コマンド**:
```bash
curl -sI "http://localhost:3000/_build/@vite/client" | grep -i content-type
curl -sI "http://localhost:3000/_build/@fs/app/src/entry-client.tsx" | grep -i content-type
```

**結果**:
```
Content-Type: text/html
Content-Type: text/html
```

**判断**: **問題を発見。** JS ファイルのはずが `text/html` で返されている。ブラウザは `<script type="module">` タグで読み込んだリソースが `text/html` だと実行を拒否するため、ハイドレーションが一切行われず画面が白いままになっていた。

---

### 5. 実際のレスポンスボディ確認

**疑い**: なぜ JS パスが HTML を返すのか。

**コマンド**:
```bash
curl -s "http://localhost:3000/_build/@vite/client" | head -5
```

**結果**: `/` と同じ HTML ページ全体が返ってきた。つまり `/_build/@vite/client` への GET リクエストが、Vite の内部ハンドラーではなく SSR ハンドラーに横取りされていた。

---

### 6. コンテナ内部からの確認

**疑い**: ホスト→コンテナのポートマッピングの問題ではないか。

**コマンド**:
```bash
podman exec rester wget -qO- "http://localhost:3000/_build/@vite/client" | head -3
```

**結果**: コンテナ内部からアクセスしても同じく HTML が返ってきた。ポートマッピングの問題ではなく、vinxi 内部のルーティング問題であることを確認。

---

### 7. コンテナ内のリスニングポート確認

**疑い**: vinxi が複数のポートを使用していて、内部 Vite サーバーが別ポートで動いているのではないか。

**コマンド**:
```bash
podman exec rester ss -tlnp
```

**結果**:
```
:3000   メインの HTTP サーバー
:44153
:44587  WebSocket (HMR) サーバー群
:41647
```

上記内部ポートに `/@vite/client` でアクセスすると HTTP 426 (Upgrade Required) → WebSocket サーバーであることを確認。

**判断**: 内部 Vite 開発サーバーは存在するが、メインサーバー (port 3000) がリクエストを正しくプロキシしていない。

---

## 根本原因

**vinxi の開発サーバー (`pnpm dev`) における SSR ハンドラーのキャッチオール問題。**

vinxi の開発モードでは、Vite の内部パス (`/_build/@vite/client`、`/_build/@fs/...` など) へのリクエストが、Vite ミドルウェアに到達する前に SolidStart の SSR ハンドラー (`/**` キャッチオール) に捕捉される。

その結果:
- `/_build/@vite/client` → HTML が返る (正しくは Vite HMR クライアント JS)
- `/_build/@fs/app/src/entry-client.tsx` → HTML が返る (正しくは JS モジュール)
- ブラウザはモジュールとして実行できず、ハイドレーション失敗 → 白画面

---

## 対処

`pnpm dev` (開発モード) の代わりに `pnpm build && pnpm start` (本番ビルドモード) を使用するよう Dockerfile を変更した。

**変更前の Dockerfile (抜粋)**:
```dockerfile
CMD ["pnpm", "dev", "--host"]
```

**変更後の Dockerfile (抜粋)**:
```dockerfile
RUN pnpm build
CMD ["pnpm", "start"]
```

本番ビルドでは静的ファイルが `.output/` ディレクトリに出力され、`pnpm start` がそれを提供する。Vite の内部ルーティング機構に依存しないため、`/_build/assets/*.js` が正しく `text/javascript` で返る。

**確認コマンド**:
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://localhost:3000/"
# → 200 text/html; charset=utf-8

curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://localhost:3000/_build/assets/index-Cehwd6fI.js"
# → 200 text/javascript; charset=utf-8
```

---

## 未解決の問題

本番ビルドモードに切り替えた後も、ユーザーから「画面が真っ白のまま」との報告あり。引き続き調査が必要。

考えられる追加原因:
- `app.tsx` の `import.meta.env.BASE_URL` の値がビルド時と実行時で異なる
- `Show when={mounted()}` のハイドレーション失敗（クライアント JS は読み込まれているが別エラー）
- ブラウザキャッシュ（旧バージョンの HTML/JS がキャッシュされている）
- ネットワークエラー（Google Fonts などへの接続失敗によるレンダリングブロック）
