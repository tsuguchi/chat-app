# Supabase

このディレクトリには Supabase 関連のリソース（マイグレーション SQL など）を置く。

## マイグレーション

`supabase/migrations/` には PostgreSQL マイグレーションを `YYYYMMDDHHMMSS_<name>.sql` 形式で配置する。タイムスタンプの昇順で適用すること。

### 現時点のマイグレーション

| ファイル                            | 内容                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `20260511120000_initial_schema.sql` | テーブル / インデックス / ヘルパー関数 / 認証トリガー / Realtime publication |
| `20260511120001_rls_policies.sql`   | 全テーブルの RLS 有効化 + ポリシー定義                                       |

### 適用方法

Supabase CLI はまだ導入していないため、現時点では **Supabase Dashboard の SQL Editor で手動適用** する。

1. https://supabase.com/dashboard でプロジェクトを開く
2. 左サイドバーから **SQL Editor** を開く
3. **+ New query** で新規クエリを作成
4. `20260511120000_initial_schema.sql` の内容を貼り付け → **Run**
5. 同じ手順で `20260511120001_rls_policies.sql` を実行
6. 左サイドバー **Table Editor** で各テーブルが生成されていることを確認
7. **Authentication > Policies** で RLS が有効になり各ポリシーが登録されていることを確認

> **重要**: 順序は必ず timestamp 順。RLS は schema の後に適用する必要がある（参照するテーブルや関数が先に存在しなければならないため）。

### 検証クエリ

適用後、以下を SQL Editor で実行して期待どおりかチェックできる。

```sql
-- 全テーブルの一覧
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;

-- RLS が有効か
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
order by tablename;

-- ポリシー一覧
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Realtime publication の登録テーブル
select tablename from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
```

## 今後の予定

- Supabase CLI 導入 → `supabase db push` でマイグレーション自動適用
- `supabase gen types typescript` で TypeScript 型を `src/lib/database.types.ts` に生成
- Storage バケット `avatars` / `attachments` の作成（次PR以降）
