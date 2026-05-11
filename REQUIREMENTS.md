# チャットアプリ 要件定義書 v1.0

## 1. プロジェクト概要

| 項目         | 内容                                 |
| ------------ | ------------------------------------ |
| プロダクト名 | Slackライク社内チャットアプリ (仮)   |
| 目的         | 社内チームコミュニケーションの効率化 |
| 想定規模     | 〜50人 / 単一組織                    |
| 利用形態     | 社内利用 (ブラウザ)                  |
| 作成日       | 2026-05-11                           |

## 2. 機能スコープ

### 2.1 MVPに含む

**メッセージング**

- パブリック / プライベートチャンネル
- 1対1 DM / グループDM (最大9人)
- スレッド作成・返信
- メンション (`@user` / `@channel` / `@here`)
- 絵文字リアクション (標準絵文字のみ)
- メッセージ編集・削除
- ファイル添付 (1ファイル最大10MB)

**通話 (LiveKit)**

- グループ音声通話
- グループビデオ通話
- 画面共有

**ユーザー**

- マジックリンク認証 (パスワードレス)
- プロフィール管理 (表示名・アイコン・ステータス)
- プレゼンス表示 (オンライン / 離席 / オフライン)

**通知**

- アプリ内通知 (バッジ・トースト)
- チャンネル単位のミュート設定
- キーワード通知
- おやすみモード (時間帯指定で通知オフ)

**管理**

- 管理者 (admin) / 一般メンバー (member) の2階層
- チャンネルオーナー (チャンネル単位の権限保持者)

### 2.2 スコープ外 (MVPに含まない)

- メッセージ検索 (Phase 7以降で追加検討)
- Bot / Webhook / スラッシュコマンド
- カスタム絵文字
- マルチワークスペース
- E2E暗号化
- ネイティブモバイルアプリ
- ゲストユーザー
- 多言語対応 (日本語のみ)
- ダークモード
- メール通知 / ブラウザPush通知

## 3. 権限マトリクス

| 操作                                   | admin | channel owner | member |
| -------------------------------------- | :---: | :-----------: | :----: |
| ユーザー招待                           |  ✅   |      ❌       |   ❌   |
| ユーザー削除・停止                     |  ✅   |      ❌       |   ❌   |
| パブリックチャンネル作成               |  ✅   |       -       |   ✅   |
| プライベートチャンネル作成             |  ✅   |       -       |   ✅   |
| チャンネルアーカイブ                   |  ✅   |      ✅       |   ❌   |
| プライベートチャンネルへのメンバー招待 |  ✅   |      ✅       |   ❌   |
| 自分のメッセージ削除                   |  ✅   |      ✅       |   ✅   |
| 他人のメッセージ削除                   |  ✅   |      ❌       |   ❌   |
| @channel / @here の使用                |  ✅   |      ✅       |   ✅   |

## 4. 非機能要件

| 項目           | 要件                                             |
| -------------- | ------------------------------------------------ |
| 同時接続数     | 50ユーザー                                       |
| メッセージ遅延 | 1秒以内                                          |
| 可用性目標     | 業務時間内 99%                                   |
| データ保持     | メッセージ・ファイルとも無期限保持               |
| セキュリティ   | HTTPS / WSS 必須、Supabase Auth + RLS による認可 |
| 対応ブラウザ   | Chrome / Edge / Safari の最新版                  |
| 表示言語       | 日本語のみ                                       |
| デバイス       | PC優先 (スマホブラウザでも閲覧可、レスポンシブ)  |

## 5. 技術スタック

| レイヤ         | 採用技術                          |
| -------------- | --------------------------------- |
| フロントエンド | Next.js (App Router) + TypeScript |
| UI             | Tailwind CSS + shadcn/ui          |
| 認証           | Supabase Auth (マジックリンク)    |
| データベース   | Supabase PostgreSQL               |
| リアルタイム   | Supabase Realtime                 |
| ストレージ     | Supabase Storage                  |
| 通話           | LiveKit Cloud                     |
| ホスティング   | Vercel                            |
| 開発言語       | TypeScript                        |

## 6. データモデル

### 6.1 ER図 (Mermaid)

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
    profiles ||--|| user_presence : "has"

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
        text name
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
        uuid parent_message_id FK "スレッド親"
        text body
        boolean is_edited
        timestamptz edited_at
        timestamptz deleted_at
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

### 6.2 ER図 (テキスト版・補助)

```
auth.users (Supabase標準)
   └─[1:1]─ profiles
              │
              ├─[1:N]─ channels (created_by)
              │           │
              │           ├─[1:N]─ channel_members ─[N:1]─ profiles
              │           │
              │           └─[1:N]─ messages ─[N:1]─ profiles (user_id)
              │                       │
              │                       ├─[自己参照 1:N]─ messages (parent_message_id : スレッド)
              │                       ├─[1:N]─ message_reactions ─[N:1]─ profiles
              │                       ├─[1:N]─ message_mentions ─[N:1]─ profiles
              │                       └─[1:N]─ message_attachments
              │
              └─[1:1]─ user_presence
```

### 6.3 リレーション一覧

| 関係             | 親                  | 子                  | カーディナリティ | 説明                        |
| ---------------- | ------------------- | ------------------- | :--------------: | --------------------------- |
| 認証拡張         | auth.users          | profiles            |       1:1        | Supabase Authを拡張         |
| チャンネル作成   | profiles            | channels            |       1:N        | 作成者の記録                |
| チャンネル参加   | channels ⇔ profiles | channel_members     |       N:N        | 中間テーブル                |
| メッセージ投稿   | channels            | messages            |       1:N        | チャンネルに紐づく          |
| メッセージ投稿者 | profiles            | messages            |       1:N        | 投稿者の記録                |
| スレッド         | messages            | messages            |  1:N (自己参照)  | parent_message_idで親を指す |
| リアクション     | messages ⇔ profiles | message_reactions   |       N:N        | 絵文字単位で複合主キー      |
| メンション       | messages ⇔ profiles | message_mentions    |       N:N        | mention_typeも複合キー      |
| 添付ファイル     | messages            | message_attachments |       1:N        | 1メッセージに複数添付可     |
| プレゼンス       | profiles            | user_presence       |       1:1        | オンライン状態              |

### 6.4 設計上のポイント

- **DM と チャンネルを統一**: `channels.type` で `public` / `private` / `dm` / `group_dm` を区別
- **スレッドは自己参照**: 別テーブルにせず `parent_message_id` で表現
- **未読管理**: `channel_members.last_read_message_id` を更新する方式
- **論理削除**: `messages.deleted_at` で「このメッセージは削除されました」表示
- **複合主キー**: `channel_members` / `message_reactions` / `message_mentions` は重複防止のため複合主キー
- **インデックス**: `messages(channel_id, created_at desc)` でタイムライン取得を高速化

## 7. 開発フェーズ計画

| フェーズ | 内容                                                            | 目安     |
| -------- | --------------------------------------------------------------- | -------- |
| Phase 1  | Supabaseセットアップ + 認証 + 基本チャンネル + メッセージ送受信 | 2週間    |
| Phase 2  | DM + スレッド + メンション + アプリ内通知                       | 2週間    |
| Phase 3  | リアクション + ファイル添付                                     | 1週間    |
| Phase 4  | プレゼンス + 既読管理 + 権限管理 + ミュート設定                 | 1〜2週間 |
| Phase 5  | キーワード通知 + おやすみモード                                 | 1週間    |
| Phase 6  | 音声・ビデオ通話 (LiveKit統合)                                  | 2週間    |

**合計目安: 約9〜10週間**

## 8. リスク・留意点

| リスク                | 影響           | 対策                                               |
| --------------------- | -------------- | -------------------------------------------------- |
| Supabase Free枠の超過 | サービス停止   | 50人規模なら基本問題なし。容量監視を運用に組み込む |
| LiveKit Cloud 無料枠  | 通話時間制限   | 無料枠超過時のみ有料化、Phase 6で再確認            |
| 検索機能の後回し      | UXの低下       | Phase 7としてpg_bigm導入を予定に組み込む           |
| マジックリンクのUX    | メール環境依存 | 初期は単一方式、要望次第でGoogle OAuthを追加可能   |
