# Rester

故人の詩・短歌を現代に届けるウェブサイト。

没後70年以上経過したパブリックドメインの詩・短歌をランダムに1首ずつ表示します。
画面をクリック（またはタップ）すると次の作品へ進みます。

**公開URL**: https://meklick.github.io/rester/

---

## 開発環境のセットアップ

Node.js >= 22 と pnpm が必要です。

```bash
cd app
pnpm install
pnpm dev
```

開発サーバー起動後、以下のURLでアクセスしてください:

```
http://localhost:3000/
```

> Note: GitHub Pages 用のベースパスはビルド時に自動判定されます。
> ローカル開発では `/` がベースパスです。

---

## ビルド

```bash
cd app
pnpm build
```

ビルド成果物は `app/.output/public/` に生成されます。

---

## デプロイ

`main` ブランチへのプッシュで GitHub Actions が自動的にビルド・デプロイを実行します。

**初回設定**: GitHub リポジトリの Settings → Pages → Source で
「GitHub Actions」を選択してください。

---

## コンテンツの追加

詩・短歌の追加は Pull Request で行います。
詳しくは [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

---

## 技術スタック

- **フレームワーク**: [SolidStart](https://start.solidjs.com/)
- **ビルドツール**: [Vinxi](https://vinxi.vercel.app/)
- **ホスティング**: GitHub Pages
- **CI/CD**: GitHub Actions
