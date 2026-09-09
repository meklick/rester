# 詩コンテンツの運用フロー

Rester は青空文庫の公開ドメイン作品を、リポジトリ内の検証済みカタログから選んで表示します。外部の生成AIや推論APIは使いません。

```
青空文庫の作品カードを人が確認
              │
              ▼
content/aozora-catalog.json（来歴・没年付き）
              │
              ▼
月次Action ──► app/src/data/poems.json（同数だけ置換）
              │
              ▼
PRの全件検証 ──► 人の確認・マージ ──► Pages デプロイ
```

## 月次の総入れ替え

`.github/workflows/auto-replace-poems.yml` は毎月1日 09:00 JST（UTC 00:00）に動きます。手動では GitHub Actions の **Monthly Poem Rotation** から実行できます。

処理は次のとおりです。

1. `scripts/rotate-aozora-poems.mjs` が現在の `poems.json` の件数を読み取る。
2. `content/aozora-catalog.json` から、没年が `実行年 - 71` 以下のレコードだけを対象にする。
3. 現在表示中の `source_record_id` を除外し、作者ごとに1件ずつ巡回する決定的な順序で同じ件数を選ぶ。35件なら4作者から8〜9件ずつ選ばれる。
4. `poems.json` を選んだ件数だけで書き直す。35件なら旧35件はすべて削除され、新35件だけが残る。
5. `scripts/validate-poems.mjs` が全作品の ID・本文・作者・年・ジャンル・出典・図書カードURL・重複を検証する。
6. 成功時だけ月次PRを作る。`content/` はフロントエンドに読み込まないため、Pages に公開される詩データは常に `poems.json` の同数だけで、ファイルサイズが増え続けない。

選定の種は年月と再試行番号です。同じ月の最初の実行は再現可能で、形式検証に失敗した場合は候補セット全体を捨て、異なる再試行番号で最大3回選び直します。候補数の多い作者ほど選ばれやすくなる方式ではなく、作者単位のラウンドロビンで均等に選びます。

## Pull Request での公開ドメイン検証

`add-poem.yml` は `poems.json` が変わった全PRで `scripts/check-public-domain.mjs` を動かします。ID が月次で再利用されても、本文を含むレコード全体の差分で判定するため、総入れ替えの全件を検証します。

各変更作品について、次をすべて確認します。

- `source_record_id` がカタログに存在すること
- 本文、作者、年、ジャンル、出典、`source_url` がカタログと完全に一致すること
- カタログに記録された没年が `実行年 - 71` 以下であること

いずれかが失敗するとPRに結果をコメントします。`monthly-rotation` ラベルのPRでは、失敗したPRを閉じ、最大3セットまで月次Actionを再実行します。最後の失敗PRは確認用に残ります。検証に通った月次PRも自動マージせず、作品内容と出典は人が確認してからマージします。

## 青空文庫の出典と扱い

青空文庫の[利用条件](https://www.aozora.gr.jp/guide/kijyunn.html)では、著作権が消滅した作品は複製・再配布・共有・形式変更が可能とされています。一方で、元資料や入力・校正者などの情報を残すよう求められています。そのためカタログと表示データの双方に作品カードURLを残します。

青空文庫は作品カードURLを安定した参照先として案内しており、テキストファイルURLの末尾の番号は更新される場合があります。[FAQ](https://www.aozora.gr.jp/guide/aozora_bunko_faq.html)の説明に従い、PRレビューでは `source_url` の作品カードを一次資料として確認してください。

## 関連ファイル

| ファイル | 役割 |
| --- | --- |
| `content/aozora-catalog.json` | 青空文庫の来歴と没年を含む、非公開の選定用カタログ |
| `scripts/import-aozora-catalog.mjs` | 初期カタログを青空文庫由来テキストから再作成する |
| `scripts/rotate-aozora-poems.mjs` | カタログから同数を選び、表示用データを総入れ替えする |
| `scripts/validate-poems.mjs` | 表示用データの全件形式を検証する |
| `scripts/check-public-domain.mjs` | 変更レコードのカタログ一致と没年を検証する |
| `.github/workflows/auto-replace-poems.yml` | 月次の総入れ替えPRを作成する |
| `.github/workflows/add-poem.yml` | PRの公開ドメイン検証と失敗時の再実行を行う |

## 必要なリポジトリ設定

- `GH_PAT`: 自動作成PRが `pull_request` ワークフローを起動し、失敗時に月次Actionを再実行するための Fine-grained PAT。対象リポジトリに `Contents: Read and write`、`Pull requests: Read and write`、`Actions: Read and write` を付与する。
- Actions の **Workflow permissions**: 書き込みを許可し、**Allow GitHub Actions to create and approve pull requests** を有効にする。
- ブランチ保護: `main` に `public-domain-check` と `validate` を必須チェックとして設定する。
