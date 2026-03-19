# 詩追加ワークフロー

このドキュメントは、Rester に詩を追加する際の自動化ワークフローを説明します。

## 概要

詩の追加は**手動**（プルリクエスト）と**自動**（スケジュール実行）の2通りあります。どちらの場合もマージ前にパブリックドメイン検証が自動で実行されます。

```
手動PR  ──┐
           ├──► add-poem.yml（パブリックドメイン確認）──► 自動マージ
自動選択 ──┘
```

---

## 全自動フロー

### トリガー

- **スケジュール**: 毎週月曜 09:00 UTC
- **手動**: GitHub Actions UI から `workflow_dispatch` で実行（`genre` 入力で絞り込み可能: 俳句 / 短歌 / 詩 / any）

### 処理の流れ

```
auto-add-poem.yml
  1. リポジトリをチェックアウト
  2. scripts/suggest-poem.mjs を実行
       - app/src/data/poems.json を読み込む
       - Claude Sonnet (claude-sonnet-4-6) に詩を提案させる
           - プロンプト: まだコレクションにない パブリックドメインの詩を提案
           - 著者は 1956年以前に没している必要がある
       - 重複チェック（最大3回リトライ）
       - 新しい詩を poems.json に追記
  3. 詩が追加された場合:
       - ブランチ作成: auto/add-poem-<タイムスタンプ>
       - コミット: feat: <著者>「<本文の先頭8文字>」を追加
       - プッシュして PR を作成（ラベル: auto-generated）
  4. 追加されなかった場合:
       - 理由を出力して正常終了

  ↓ main ブランチへの PR が作成される

add-poem.yml  （PR 作成に反応して起動）
  1. scripts/check-public-domain.mjs を実行
       - poems.json のベース SHA とヘッド SHA を比較
       - 新規追加された詩ごとに Claude Haiku (claude-haiku-4-5-20251001) を呼び出す
           - 質問: <著者> は何年に亡くなりましたか？
       - 判定: 2026 - 没年 >= 70
  2. PR にコメントで結果テーブルを投稿:
       | 著者 | 没年 | ステータス |
  3. すべての詩がパスした場合:
       - ラベル追加: public-domain-verified
       - 自動マージ実行: gh pr merge --squash --auto
  4. 1件でも失敗した場合:
       - ワークフローを失敗させてマージをブロック
```

---

## 手動フロー

`app/src/data/poems.json` を直接編集して PR を作成します。自動フローと同様に `add-poem.yml` による検証が走ります。

詩のスキーマや本文の書き方は [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `.github/workflows/auto-add-poem.yml` | スケジュール実行による詩の選択と PR 作成 |
| `.github/workflows/add-poem.yml` | パブリックドメイン検証と自動マージ |
| `.github/workflows/validate.yml` | PR 時の JSON スキーマ検証 |
| `scripts/suggest-poem.mjs` | Claude Sonnet を使って新しい詩を選択 |
| `scripts/check-public-domain.mjs` | Claude Haiku を使って著者の没年を確認 |
| `app/src/data/poems.json` | 詩データ |

---

## 事前設定

| 項目 | 内容 |
|------|------|
| `ANTHROPIC_API_KEY` | GitHub リポジトリの Secrets に登録（両スクリプトで必須） |
| ブランチ保護ルール | `main` に「ステータスチェック必須」を設定すると `--auto` マージが有効になる |

### ブランチ保護ルールの設定手順

#### 1. 設定画面を開く

```
リポジトリ → Settings → Branches → Add branch ruleset
```

（古い UI の場合は「Add rule」）

#### 2. 対象ブランチを指定

- **Branch name pattern**: `main`

#### 3. 以下の項目を有効にする

| 設定項目 | 目的 |
|----------|------|
| **Require a pull request before merging** | 直接プッシュを防ぐ（推奨） |
| **Require status checks to pass before merging** | `--auto` マージに必須 |
| └ **Require branches to be up to date before merging** | 合わせて有効化を推奨 |

#### 4. ステータスチェックの追加

「Require status checks」を有効にしたら、検索ボックスで以下を追加:

- `public-domain-check`（`add-poem.yml` のジョブ名）
- `validate`（`validate.yml` のジョブ名）

> **注意**: ステータスチェックは一度でもそのワークフローが実行されないと候補に表示されません。最初の PR を手動でマージした後に設定するのが確実です。

#### 5. 保存

**Create** または **Save changes** をクリック。

### `--auto` マージの仕組み

```
gh pr merge --squash --auto
    ↓
「保留中」状態でマージ待機
    ↓
required status checks が全部グリーンになったら
    ↓
GitHub が自動でマージ実行
```

ブランチ保護ルールなしだと `--auto` は即時マージになってしまうため、パブリックドメイン検証が完了する前にマージされる可能性があります。

---

## パブリックドメインの判定基準

日本の著作権法では、著作者の没後 **70年以上** 経過した作品がパブリックドメインとなります。

```
2026 - 没年 >= 70  →  没年 <= 1955
```

没年が不明な場合は `⚠️ 不明` と表示され、マージがブロックされます。
