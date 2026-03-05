# 解決済み

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