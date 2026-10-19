-- WO-023: 意味検索(pgvector)。append-only=列を足すだけ。どちらも NULL 許容(既存の INSERT は列を指定しないため)
-- 拡張は Drizzle が作らないので手で足した(Neon は pgvector をデータベースごとに有効にする)
-- 戻し: drizzle/rollback/0001_down.sql / 予行演習: drizzle/rollback/0001_rehearsal.sql
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "embedding_model" text;
