-- WO-023 0001 の予行演習。ふつうは `npx tsx scripts/migrate-rehearsal.ts drizzle/0001_semantic_search.sql`(同じ内容を1つの接続で流す)。
-- Neon の SQL Editor で流すときは、この全部を「まとめて1回」で貼って実行する。最後が ROLLBACK なので何も残らない
-- Postgres は DDL もトランザクションに入れられる(CREATE EXTENSION も取り消せる)
BEGIN;
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "embedding_model" text;
  -- 確かめ: 列が増え、既存の行は NULL のまま(38件・埋め込み 0件の見込み)
  SELECT count(*) AS rows, count(embedding) AS with_embedding FROM estimates;
  SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_name = 'estimates' AND column_name IN ('embedding', 'embedding_model');
  -- 確かめ: 列を指定しない今の INSERT が通る(下の行も ROLLBACK で消える)
  INSERT INTO estimates (name, type, size, color, qty, data_state, reuse, amount, cost)
  VALUES ('予行演習', 'チラシ', 'A4', '両面4C', 1, '完全データ', '新規', 1, 1) RETURNING id, embedding;
ROLLBACK;
-- ※ ROLLBACK しても serial の番号(estimates_id_seq)は1つ進む(欠番になる)。表示コード E-nnn が1つ飛ぶだけで害はない
