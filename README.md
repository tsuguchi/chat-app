# chat-app

Slackライクな社内向けチャットアプリ。

## 概要

小規模チーム（〜50人）向けのリアルタイムチャットアプリケーション。
DM、チャンネル、スレッド、メンション、ファイル共有、グループ音声/ビデオ通話などの機能を提供する。

## ドキュメント

- [要件定義書 (REQUIREMENTS.md)](./REQUIREMENTS.md)

## 技術スタック

| レイヤ         | 技術                              |
| -------------- | --------------------------------- |
| フロントエンド | Next.js (App Router) + TypeScript |
| UI             | Tailwind CSS + shadcn/ui          |
| 認証           | Supabase Auth (Magic Link)        |
| データベース   | Supabase PostgreSQL               |
| リアルタイム   | Supabase Realtime                 |
| ストレージ     | Supabase Storage                  |
| 通話           | LiveKit Cloud                     |
| ホスティング   | Vercel                            |

## セットアップ

> このプロジェクトはまだ実装フェーズに入っていません。Phase 1着手時に手順を追記します。

```bash
# 依存関係インストール (Phase 1で利用可能)
npm install

# 開発サーバー起動 (Phase 1で利用可能)
npm run dev
```

## 開発フェーズ

| フェーズ | 内容                                                        |
| -------- | ----------------------------------------------------------- |
| Phase 1  | Supabaseセットアップ + 認証 + チャンネル + メッセージ送受信 |
| Phase 2  | DM + スレッド + メンション + アプリ内通知                   |
| Phase 3  | リアクション + ファイル添付                                 |
| Phase 4  | プレゼンス + 既読管理 + 権限管理                            |
| Phase 5  | キーワード通知 + おやすみモード                             |
| Phase 6  | 音声・ビデオ通話 (LiveKit統合)                              |

## ライセンス

未定
