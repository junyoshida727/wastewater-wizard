# 排水処理ヒアリングシステム — Wastewater Wizard

排水処理設備の営業ヒアリングを効率化するウィザード型ヒアリングシートです。
シングルHTMLファイル構成で、外部サーバー不要・インストール不要で動作します。

---

## 機能概要

- **5ステップウィザード**：基本情報 / 水質情報 / 放流先・規制 / 既存設備 / 現場・施工条件
- **自動保存**：入力内容を localStorage に保存。再アクセス時に下書きを再開できる
- **フロー図生成**：ヒアリング内容に応じた SVG プロセスフロー図を自動生成
- **PDF出力**：ヒアリング結果をPDFとしてダウンロード
- **モバイル対応**：iOS Safari を含むスマートフォンで操作可能

---

## ローカル開発

### 必要環境
- Node.js 16 以上

### セットアップ

```bash
# 依存パッケージのインストール
npm install

# ローカルサーバー起動（http://localhost:3000 が自動で開きます）
npm run dev
```

---

## ブランチ運用

| ブランチ | 用途 |
|---|---|
| `main` | 本番（GitHub Pages への自動デプロイ対象） |
| `dev` | レビュー済み変更を集約する開発ブランチ |
| `feature/*` | 新機能開発 |
| `fix/*` | バグ修正 |
| `chore/*` | 開発環境・CI・依存関係などの整備 |
| `docs/*` | ドキュメントのみの変更 |
| `codex/*` | Codex主導の環境整備・保守作業 |

### 開発フロー

```
dev から作業ブランチを作成
    ↓
実装・動作確認・npm test
    ↓
Pull Request を作成してレビュー
    ↓
dev へマージ
    ↓
本番反映時に dev → main へマージ
    ↓
GitHub Actions が自動でデプロイ
```

詳しい運用ルールは [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) を参照してください。
Codex は [AGENTS.md](./AGENTS.md)、Claude Code は [CLAUDE.md](./CLAUDE.md) を共通ルールとして参照します。

---

## デプロイ

本番反映は `main` ブランチへの反映後に GitHub Pages で公開されます。
GitHub Actions を利用する場合は `.github/workflows/deploy.yml` を追加して運用します。

**本番URL**: https://junyoshida727.github.io/wastewater-wizard/

---

## 更新履歴

[CHANGELOG.md](./CHANGELOG.md) を参照してください。
