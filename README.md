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
| `dev` | 開発作業用。機能追加・修正はここで行う |

### 開発フロー

```
dev ブランチで開発
    ↓
動作確認（npm run dev）
    ↓
main へマージ
    ↓
GitHub Actions が自動でデプロイ
```

---

## デプロイ

`main` ブランチへのプッシュで GitHub Actions が自動起動し、GitHub Pages へデプロイされます。
設定ファイル: `.github/workflows/deploy.yml`

**本番URL**: https://junyoshida727.github.io/wastewater-wizard/

---

## 更新履歴

[CHANGELOG.md](./CHANGELOG.md) を参照してください。
