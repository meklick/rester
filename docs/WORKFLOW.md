# 詩コンテンツの運用フロー

Rester の詩データは、手動で1件追加する方法と、月替わりでコレクション全体を更新する方法で管理します。どちらも PR 作成後にパブリックドメイン確認と JSON 形式チェックを実行します。

```
手動で1件追加 ───────┐
                      ├──► PR ──► 形式・著作権確認 ──► マージ ──► Pages デプロイ
月次の総入れ替え ────┘
```

## 月次の総入れ替え

`.github/workflows/auto-replace-poems.yml` は、毎月1日 09:00 JST（UTC 00:00）に実行されます。現在のコレクションと**同じ件数**の新しい候補セットを生成し、`poems.json` を丸ごと置き換える PR を作成します。つまり、35件なら旧35件を削除して新35件だけをコミットするため、リポジトリと GitHub Pages の公開ファイルは増え続けません。

手動実行も可能です。GitHub Actions の **Monthly Poem Rotation** から実行しても、実行時点の件数を維持します。

### 処理内容

1. `scripts/replace-poems.mjs` が候補セットを生成する
   - プロジェクトの公開ドメイン基準を満たすことを事前確認した著者リストだけを使用する
   - 既存セットと同じ本文、または新しいセット内で重複する本文は採用しない
   - 本文・著者・ジャンル・出典が揃わない候補は再試行し、全件を揃えられなければ PR を作成しない
2. `scripts/validate-poems.mjs` が全作品の ID形式・本文・著者・年・ジャンル・出典・ID/本文重複を確認する
   - 検証に失敗した場合は、候補セット全体を破棄して最初から生成し直す
   - 最大3回失敗した場合は PR を作成せず、ワークフローを失敗として終了する
3. `auto/replace-poems-<UTCタイムスタンプ>` ブランチにコミットして PR を作成する
4. `add-poem.yml` が、ID が再利用されている場合も含めて新規・変更された全作品の没年を確認する
   - この検証に失敗した月次PRは閉じ、別の著者順で候補セット全体を作り直す
   - 最大3セットで打ち切り、最後の失敗PRは確認用に残す
5. `monthly-rotation` ラベル付き PR は、本文と出典を人が確認してからマージする。`deploy.yml` が GitHub Pages を更新する

生成モデルの出力は、作品本文・出典の正確さを完全には保証できません。マージ前に PR の本文と出典を確認してください。

## 手動で1件追加

`.github/workflows/auto-add-poem.yml` はスケジュール実行を持たず、GitHub Actions の **Auto Add Poem** からの手動実行専用です。`genre` を指定すると、俳句・短歌・詩に絞れます。

リポジトリを直接編集して PR を作る場合は、[CONTRIBUTING.md](../CONTRIBUTING.md) の入力ルールに従ってください。

## パブリックドメイン判定

日本の著作権法では、原則として著作者の死後70年が経過するまで著作権が存続し、期間は死亡年の翌年1月1日から数えます。したがって、年 `Y` に掲載できる目安は `死亡年 <= Y - 71` です。たとえば2026年は1955年以前に没した著者が対象です。[著作権法第51条・第57条](https://laws.e-gov.go.jp/law/345AC0000000048) に基づく運用です。

`scripts/check-public-domain.mjs` は実行年からこの境界年を計算します。著者の没年が不明、または境界年より新しい場合はチェックを失敗させます。

## 関連ファイル

| ファイル | 役割 |
| --- | --- |
| `.github/workflows/auto-replace-poems.yml` | 月次の総入れ替えを実行して PR を作成する |
| `.github/workflows/auto-add-poem.yml` | 手動の1件追加を実行して PR を作成する |
| `.github/workflows/add-poem.yml` | PR 内の新規・変更作品の公開ドメインを確認する |
| `.github/workflows/validate.yml` | PR 時の JSON 形式を検証する |
| `scripts/replace-poems.mjs` | 月次の候補セットを生成する |
| `scripts/suggest-poem.mjs` | 手動の1件候補を生成する |
| `scripts/check-public-domain.mjs` | 新規・変更作品の没年を確認する |

## 必要なリポジトリ設定

- `GH_PAT`: 自動作成 PR が `pull_request` ワークフローを起動し、失敗時に月次ワークフローを再実行するための Fine-grained PAT。対象リポジトリに `Contents: Read and write`、`Pull requests: Read and write`、`Actions: Read and write` を付与する。
- Actions の **Workflow permissions**: 書き込みを許可し、**Allow GitHub Actions to create and approve pull requests** を有効にする。
- ブランチ保護: `main` に `public-domain-check` と `validate` を必須チェックとして設定する。

GitHub Models API を使うワークフローには `models: read` 権限が必要です。
