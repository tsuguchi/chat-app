# chat-app

Slackライクな社内向けチャットアプリ。

本番URL: <https://chat-app-theta-seven-80.vercel.app>

## 概要

小規模チーム（〜50人）向けのリアルタイムチャットアプリ。
DM、チャンネル、スレッド、メンション、リアクション、ファイル共有、検索などをサポート。

## スクリーンショット

### ログイン / 新規登録

| ログイン | 新規登録 |
| --- | --- |
| ![ログイン](./docs/screenshots/01-login.png) | ![新規登録](./docs/screenshots/02-signup.png) |

ユーザー名 + パスワード方式。誰でも `/signup` からアカウントを作成可能（メール不要）。

### メインのチャット画面

![メインチャット](./docs/screenshots/04-main-channel.png)

サイドバーにチャンネル / DM、中央にタイムライン。各メッセージにマウスを乗せるとリアクション・返信・編集・削除のアクションが表示される。

### スレッド返信

![スレッドパネル](./docs/screenshots/05-thread.png)

メッセージから「返信」を押すと右側にスレッドパネルが開き、本チャンネルを汚さずに会話を分岐できる。

### メッセージ検索

![検索](./docs/screenshots/06-search.png)

PostgreSQL の pg_trgm GIN インデックスでサーバー側検索。本文のヒット箇所はハイライト表示。

### チャンネル作成 / 探す

| チャンネルを作成 | チャンネルを探す |
| --- | --- |
| ![チャンネル作成](./docs/screenshots/07-channel-new.png) | ![チャンネル一覧](./docs/screenshots/03-channel-browse.png) |

パブリック / プライベートを選んで作成。パブリックは「探す」から誰でも参加可能。

## 機能

- ユーザー名 + パスワード認証（メール不要 / 自由サインアップ）
- パブリック / プライベートチャンネル
- 1対1 DM / グループ DM
- スレッド返信
- メンション（`@user` / `@channel` / `@here`）
- 標準絵文字リアクション
- ファイル添付（複数 / 1ファイル 10MB / 画像インライン表示）
- メッセージ編集・削除
- ソフト削除（メッセージ） / カスケード削除（チャンネル）
- プレゼンス（オンラインドット）
- 未読 / メンションバッジ
- チャンネル単位のミュート設定（all / mentions / none）
- メッセージ検索（pg_trgm）
- ワークスペース管理者による他人メッセージ削除
- プライベートチャンネル招待

## 技術スタック

| レイヤ         | 技術                                               |
| -------------- | -------------------------------------------------- |
| フロントエンド | Next.js 16 (App Router, Turbopack) + TypeScript    |
| UI             | Tailwind CSS v4                                    |
| 認証           | Supabase Auth (Email+Password, 架空メールでラップ) |
| データベース   | Supabase PostgreSQL                                |
| リアルタイム   | Supabase Realtime (postgres_changes + presence)    |
| ストレージ     | Supabase Storage (`attachments` バケット, private) |
| 検索           | pg_trgm + GIN インデックス                         |
| ホスティング   | Vercel (`hnd1` リージョン / Supabase と同居)       |

## ドキュメント

- [要件定義書 (REQUIREMENTS.md)](./REQUIREMENTS.md)

## ローカル開発

```bash
# 依存関係をインストール
npm install

# .env.local を用意（Supabase の URL と anon key を設定）
cp .env.local.example .env.local
# → エディタで開いて値を埋める

# 開発サーバー起動
npm run dev
```

その後 <http://localhost:3000/signup> でアカウントを作って動作確認。

## デプロイ

main ブランチへの push で Vercel が自動デプロイ。リージョンは `vercel.json` で東京 (`hnd1`) に固定。

## ライセンス

未定
