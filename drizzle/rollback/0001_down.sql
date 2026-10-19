-- WO-023 0001 の戻し(down)。適用前の状態に戻す。流す前に scripts/db-snapshot.ts dump で控えを取る
-- 先に、意味検索を使うコード(WO-023 の commit)を本番から戻しておく(列を消すと、そのコードの SELECT が失敗するため。失敗しても条件の点だけで動く作りだが、順番は コード → DB)
BEGIN;
  ALTER TABLE "estimates" DROP COLUMN IF EXISTS "embedding_model";
  ALTER TABLE "estimates" DROP COLUMN IF EXISTS "embedding";
  -- 拡張は他に vector 型を使う列が無ければ外す(このDBでは estimates.embedding だけ)
  DROP EXTENSION IF EXISTS vector;
  -- Drizzle の履歴から 0001 を外す(残すと、次の db:migrate で 0001 が流れない)。0000 は id=1 で記録済み(2026-10-19 に読み取りで確認)
  DELETE FROM drizzle.__drizzle_migrations WHERE created_at = '1792421523809';  -- drizzle/meta/_journal.json の 0001 の "when"
COMMIT;
