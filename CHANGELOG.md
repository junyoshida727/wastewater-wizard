# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0] - 2026-03-08

### Added
- 5ステップウィザード型ヒアリングシート（基本情報 / 水質情報 / 放流先・規制 / 既存設備 / 現場・施工条件）
- フォーム初期化ボタン（確認モーダル付き）
- localStorage 自動保存 / 下書き再開バナー
- SVGベースのプロセスフロー図（凝集沈殿・フッ素除去・ろ過など条件付き表示）
- PDF出力機能（html2pdf.js）
- モバイル最適化（iOS Safari 対応 / ステップナビ sticky 表示 / タップ領域 44px 以上）
- GitHub Actions による `main` ブランチ → GitHub Pages 自動デプロイ
- `npm run dev` による live-server ローカル開発環境

### Fixed
- iOS Safari のフォーム入力時の自動ズーム（font-size 14px → 16px）
- モバイルでのナビボタンがホームインジケーターに隠れる問題（safe-area-inset 対応）

---

[v1.0.0]: https://github.com/junyoshida727/wastewater-wizard/releases/tag/v1.0.0
