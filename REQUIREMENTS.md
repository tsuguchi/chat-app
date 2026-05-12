# チャットアプリ 要件定義書 v1.1

## 1. プロジェクト概要

| 項目         | 内容                                 |
| ------------ | ------------------------------------ |
| プロダクト名 | Slackライク社内チャットアプリ (仮)   |
| 目的         | 社内チームコミュニケーションの効率化 |
| 想定規模     | 〜50人 / 単一組織                    |
| 利用形態     | 社内利用 (ブラウザ)                  |
| 初版作成日   | 2026-05-11                           |
| 改訂日       | 2026-05-12 (v1.1: 実装状況を反映)    |

## 2. 実装状況サマリ

| 機能                                                                 | PR      |     状況      |
| -------------------------------------------------------------------- | ------- | :-----------: |
| 認証（マジックリンク）                                               | #4      |      ✅       |
| チャンネル作成・参加・ブラウズ                                       | #5 / #7 |      ✅       |
| メッセージ送受信 + Realtime                                          | #6      |      ✅       |
| DM（1対1 / グループ）                                                | #8      |      ✅       |
| スレッド + 返信 + 返信件数                                           | #9      |      ✅       |
| メンション（@user / @channel / @here）                               | #10     |      ✅       |
| 未読 + メンションバッジ（既読管理）                                  | #11     |      ✅       |
| 絵文字リアクション                                                   | #12     |      ✅       |
| ファイル添付（画像インライン / 任意 10MB）                           | #13     |      ✅       |
| メッセージ編集・自分削除                                             | #14     |      ✅       |
| プレゼンス（オンラインドット）                                       | #15     |      ✅       |
| プライベートチャンネル招待                                           | #16     |      ✅       |
| チャンネルミュート設定（all / mentions / none）                      | #17     |      ✅       |
| メッセージ検索（pg_trgm）                                            | #18     |      ✅       |
| 管理者による他人メッセージ削除                                       | #19     |      ✅       |
| キーワード通知 / おやすみモード                                      | –       |   ❌ 未着手   |
| 音声・ビデオ通話（LiveKit）                                          | –       |   ❌ 未着手   |
| ブラウザPush通知                                                     | –       |   ❌ 未着手   |
| カスタム絵文字 / マルチワークスペース / E2E暗号化 / ネイティブアプリ | –       | ❌ スコープ外 |

## 3. 機能スコープ

### 3.1 実装済み

**メッセージング**

- パブリック / プライベートチャンネル
- 1対1 DM / グループDM
- スレッド作成・返信（返信件数表示、専用パネルでの返信入力）
- メンション (`@user` / `@channel` / `@here`)
  - 入力時のオートコンプリート
  - 本文中の青チップ装飾
  - `message_mentions` への展開（@channel は全メンバー、@here はオンラインメンバーに展開）
- 標準絵文字リアクション（12種、Realtime 同期、楽観的更新）
- メッセージ編集（本人のみ）・ソフト削除（本人または admin）
  - 編集済み表示、削除済みプレースホルダ
- ファイル添付（複数可、1ファイル 10MB 上限、private Storage + signed URL）
- メッセージ検索（pg_trgm の GIN インデックス、2文字以上、ヒットハイライト）

**ユーザー**

- マジックリンク認証（パスワードレス、カスタム SMTP 経由）
- プロフィール（display_name, username, avatar_url, status_text）
- プレゼンス（Realtime Presence、UI は緑ドット）

**通知**

- アプリ内未読 / メンションバッジ（サイドバー）
- チャンネル単位のミュート設定（all / mentions / none）
- 自動既読（チャンネルを開いた時点で `last_read_message_id` 更新）

**管理**

- ワークスペース admin（`profiles.role`）/ 一般 member の2階層
- チャンネル owner（`channel_members.role`）/ channel admin / member
- private チャンネル招待は owner/admin/workspace admin
- 他人メッセージ削除は workspace admin（編集はあくまで本人のみ）

### 3.2 未実装

- キーワード通知（特定文字列を含むメッセージで通知）
- おやすみモード（時間帯指定で通知オフ）
- ブラウザ Push 通知（OS レベル通知）
- 音声・ビデオ通話（LiveKit 連携）

### 3.3 スコープ外

- Bot / Webhook / スラッシュコマンド
- カスタム絵文字
- マルチワークスペース
- E2E 暗号化
- ネイティブモバイルアプリ
- ゲストユーザー
- 多言語対応（日本語のみ）
- ダークモード
- メール通知

## 4. 権限マトリクス

| 操作                       | admin (workspace) | channel owner | channel admin |       member       |
| -------------------------- | :---------------: | :-----------: | :-----------: | :----------------: |
| ユーザー招待 / 削除 / 停止 |        ✅         |      ❌       |      ❌       |         ❌         |
| パブリックチャンネル作成   |        ✅         |       –       |       –       |         ✅         |
| プライベートチャンネル作成 |        ✅         |       –       |       –       |         ✅         |
| パブリックチャンネル参加   |        ✅         |       –       |       –       |  ✅（self-join）   |
| プライベートチャンネル招待 |        ✅         |      ✅       |      ✅       |         ❌         |
| チャンネル設定変更         |        ✅         |      ✅       |       –       |         ❌         |
| メッセージ投稿             |        ✅         |      ✅       |      ✅       | ✅（メンバーのみ） |
| 自分のメッセージ編集・削除 |        ✅         |      ✅       |      ✅       |         ✅         |
| 他人のメッセージ削除       |        ✅         |      ❌       |      ❌       |         ❌         |
| 他人のメッセージ編集       |        ❌         |      ❌       |      ❌       |         ❌         |
| @channel / @here の使用    |        ✅         |      ✅       |      ✅       |         ✅         |
| ミュート設定変更           |        ✅         |      ✅       |      ✅       |   ✅（自分のみ）   |

## 5. 非機能要件

| 項目           | 要件                             |         実装状況          |
| -------------- | -------------------------------- | :-----------------------: |
| 同時接続数     | 50ユーザー                       |        設計上対応         |
| メッセージ遅延 | 1秒以内                          |      Realtime で達成      |
| 可用性目標     | 業務時間内 99%                   |   Supabase Cloud に依存   |
| データ保持     | メッセージ・ファイルとも無期限   |           達成            |
| セキュリティ   | HTTPS / WSS、Supabase Auth + RLS |           達成            |
| 対応ブラウザ   | Chrome / Edge / Safari 最新版    |    Edge で動作確認済み    |
| 表示言語       | 日本語のみ                       |           達成            |
| デバイス       | PC優先、スマホブラウザ閲覧可     | Tailwind レスポンシブ未完 |

## 6. 技術スタック（最終確定）

| レイヤ         | 技術                                               |
| -------------- | -------------------------------------------------- |
| フロントエンド | Next.js 16 (App Router, Turbopack) + TypeScript    |
| UI             | Tailwind CSS v4                                    |
| 認証           | Supabase Auth (Magic Link, カスタム SMTP)          |
| データベース   | Supabase PostgreSQL                                |
| リアルタイム   | Supabase Realtime (postgres_changes + presence)    |
| ストレージ     | Supabase Storage (`attachments` バケット, private) |
| 検索           | pg_trgm + GIN インデックス                         |
| ホスティング   | Vercel（未デプロイ）                               |
| 通話           | LiveKit Cloud（未統合）                            |

> Next.js 16 は `middleware` → `proxy` の規約変更があります。`src/proxy.ts` を採用。

## 7. データモデル

### 7.1 ER図 (Mermaid)

```mermaid
erDiagram
    auth_users ||--|| profiles : "extends"
    profiles ||--o{ channels : "creates"
    profiles ||--o{ channel_members : "joins"
    channels ||--o{ channel_members : "has members"
    channels ||--o{ messages : "contains"
    profiles ||--o{ messages : "posts"
    messages ||--o{ messages : "thread reply"
    messages ||--o{ message_reactions : "receives"
    profiles ||--o{ message_reactions : "reacts"
    messages ||--o{ message_mentions : "has"
    profiles ||--o{ message_mentions : "mentioned"
    messages ||--o{ message_attachments : "has"
    profiles ||--|| user_presence : "has (optional, unused)"

    auth_users {
        uuid id PK
        text email
    }
    profiles {
        uuid id PK_FK
        text username UK
        text display_name
        text avatar_url
        text status_text
        text role "admin | member"
        timestamptz created_at
    }
    channels {
        uuid id PK
        text type "public | private | dm | group_dm"
        text name "null when dm/group_dm"
        text description
        uuid created_by FK
        boolean is_archived
        timestamptz created_at
    }
    channel_members {
        uuid channel_id PK_FK
        uuid user_id PK_FK
        text role "owner | admin | member"
        timestamptz joined_at
        uuid last_read_message_id
        text notification_setting "all | mentions | none"
    }
    messages {
        uuid id PK
        uuid channel_id FK
        uuid user_id FK
        uuid parent_message_id FK "self-ref for threads"
        text body
        boolean is_edited
        timestamptz edited_at
        timestamptz deleted_at "soft delete"
        timestamptz created_at
    }
    message_reactions {
        uuid message_id PK_FK
        uuid user_id PK_FK
        text emoji PK
        timestamptz created_at
    }
    message_mentions {
        uuid message_id PK_FK
        uuid mentioned_user_id PK_FK
        text mention_type PK "user | channel | here"
    }
    message_attachments {
        uuid id PK
        uuid message_id FK
        text storage_path
        text file_name
        text mime_type
        bigint size_bytes
        timestamptz created_at
    }
    user_presence {
        uuid user_id PK_FK
        text status "online | away | offline"
        timestamptz last_seen_at
    }
```

> プレゼンスは **Realtime Presence** で実装したため `user_presence` テーブルは現状未使用。将来「最終ログイン時刻」等のオフライン情報を残したくなれば活用予定。

### 7.2 設計上のポイント

- **DM とチャンネルを統一**：`channels.type` で `public` / `private` / `dm` / `group_dm` を区別。1on1 DM は2人の `dm`、グループ DM は3人以上の `group_dm`。
- **スレッドは自己参照**：`messages.parent_message_id` で表現。トップレベル取得時は `is null` フィルタ。
- **メッセージは論理削除**：`deleted_at` を NULL→now() に更新。リアクション・添付・返信件数は保持。
- **未読管理**：`channel_members.last_read_message_id`。SECURITY DEFINER RPC `get_unread_summary` で1コール／ユーザー。
- **複合主キー**：`channel_members` / `message_reactions` / `message_mentions` は重複防止。
- **インデックス**：`messages(channel_id, created_at desc)`、`messages(parent_message_id) WHERE parent_message_id IS NOT NULL`、`messages USING gin (body gin_trgm_ops) WHERE deleted_at IS NULL`。

## 8. ストレージ

`attachments` バケット（private、10MB 上限）

- パス規約：`<channel_id>/<uuid>/<filename>`
- RLS：`storage.objects` のポリシーで先頭セグメント（channel_id）から `channel_members` を逆引きしてアクセス制御
- 配信：常に signed URL（1時間）。サーバ側で初期一括生成、Realtime で来た新規行はクライアント側で都度生成。

## 9. RPC / 関数

| 名前                                           | 種別             | 用途                                                              |
| ---------------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `is_channel_member(_channel_id, _user_id)`     | SECURITY DEFINER | RLS 内の再帰防止                                                  |
| `is_admin(_user_id)`                           | SECURITY DEFINER | workspace admin 判定                                              |
| `channel_role(_channel_id, _user_id)`          | SECURITY DEFINER | チャンネル内ロール取得                                            |
| `can_self_join_channel(_channel_id, _user_id)` | SECURITY DEFINER | 自分が作成したチャンネルへの初回 self-join 用                     |
| `get_unread_summary(_user_id)`                 | SECURITY DEFINER | サイドバー向け未読 / メンション件数                               |
| `soft_delete_message(_message_id)`             | SECURITY DEFINER | 投稿者 or admin によるソフト削除一本化                            |
| `handle_new_user()`                            | Trigger          | `auth.users` 作成時に `profiles` を自動生成                       |
| `handle_new_channel()`                         | Trigger          | `channels` 作成時に作成者を `channel_members` に owner として登録 |

## 10. Realtime 購読設計

- **チャンネル分割の方針**：1チャンネルに 3 を超える `postgres_changes` 購読を載せると配信が不安定になる事例があり、テーブル単位で分割。
  - `channel-<id>-messages`：messages の INSERT / UPDATE
  - `channel-<id>-side`：message_reactions の INSERT / DELETE、message_attachments の INSERT
  - `thread:<parentId>`：スレッドパネル開きのとき、parent_message_id 絞り込みで messages の INSERT / UPDATE と親自身の UPDATE
  - `presence:workspace`：ワークスペース横断のオンライン状態
- **認証**：subscribe 前に `supabase.realtime.setAuth(session.access_token)` を必ず呼ぶ（RLS 越しの postgres_changes 配信に必要）。

## 11. 主要マイグレーション履歴

| ファイル                                                | 内容                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `20260511120000_initial_schema.sql`                     | 8 テーブル / インデックス / ヘルパー関数 / 認証トリガ / Realtime publication                       |
| `20260511120001_rls_policies.sql`                       | 全テーブル RLS + ポリシー                                                                          |
| `20260512000000_channel_creator_owner.sql`              | `on_channel_created` トリガ                                                                        |
| `20260512120000_unread_summary.sql`                     | `get_unread_summary` RPC                                                                           |
| `20260512130000_attachments_bucket.sql`                 | Storage バケット + RLS、messages.body 制約緩和、`message_attachments` publication                  |
| `20260512140000_fix_private_channel_creator_member.sql` | （旧）private チャンネル創作者の self-join 暫定対応                                                |
| `20260512150000_fix_channel_creator_recursive_rls.sql`  | 上記の正しい対応：`can_self_join_channel` 関数 + channels SELECT に `created_by = auth.uid()` 追加 |
| `20260512160000_message_search_pg_bigm.sql`             | pg_trgm + GIN インデックス（pg_bigm は Supabase に未パッケージ、pg_trgm にフォールバック）         |
| `20260512170000_admin_soft_delete_rpc.sql`              | `soft_delete_message` RPC                                                                          |

## 12. 既知の課題 / 今後の予定

| 項目                                       | 内容                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| キーワード通知                             | 未実装。`profiles` に keyword 配列を持たせて Realtime クライアント側で検出予定 |
| おやすみモード                             | 未実装。`profiles` に `dnd_start` / `dnd_end` を追加して UI で抑制予定         |
| ブラウザ Push 通知                         | 未実装。Service Worker + Web Push が必要                                       |
| 音声・ビデオ通話                           | LiveKit Cloud + Edge Function で token 発行、`call/` ルート追加が必要          |
| メッセージへの直接アンカー                 | 検索ヒットからメッセージ位置へジャンプ未実装                                   |
| メッセージページング                       | 直近 200 件決め打ち。古い履歴を読みたい場合の無限スクロール未実装              |
| 添付プレビューの種類拡充                   | 現状は画像のみインライン。動画 / 音声 / PDF 等は未対応                         |
| Realtime CHANNEL_ERROR ハンドリング        | 現状 console.warn のみ、UI 表示なし                                            |
| メッセージ存在中の Chrome WebSocket 詰まり | 一部環境で発生（Chrome 拡張干渉等）。Edge 推奨                                 |

## 13. デプロイ

未デプロイ。Vercel + Supabase Cloud 構成で予定。  
本番化時には以下を追加で行う：

- Supabase Dashboard → Authentication → URL Configuration に本番 URL を追加
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を Vercel に登録
- カスタム SMTP の `From` を本番ドメインに合わせて変更
- カスタムドメインの DNS 設定（任意）
