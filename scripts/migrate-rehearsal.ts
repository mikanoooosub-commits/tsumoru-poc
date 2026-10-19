// マイグレーションの予行演習(BEGIN → マイグレーションの SQL → 確かめ → ROLLBACK)。何も残さない。
//   npx tsx scripts/migrate-rehearsal.ts drizzle/0001_semantic_search.sql
// ・1つの接続(WebSocket の Pool)で流すので、BEGIN と ROLLBACK が同じトランザクションになる(HTTP の neon() は1文ずつ別になるため使わない)。
// ・確かめ: 列が増えたか・既存の行の埋め込みは NULL か・列を指定しない今までの INSERT が通るか(INSERT も ROLLBACK で消える)。
// ・ROLLBACK しても serial の番号(estimates_id_seq)は1つ進む(表示コードが1つ飛ぶだけで害はない)。
// ・接続文字列は .env.local から読み、画面・ファイルには出さない。WO-023 の段で作った(db-change: 本番の前に予行演習)。
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('使い方: tsx scripts/migrate-rehearsal.ts <マイグレーションの SQL ファイル>');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '');
  if (!url) throw new Error('DATABASE_URL 未設定です(.env.local を確認)');
  const statements = readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim())
    .filter((s) => s.length > 0);

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const st of statements) {
      console.log('実行:', st.replace(/\s+/g, ' ').slice(0, 100));
      await client.query(st);
    }
    const counts = await client.query('SELECT count(*)::int AS rows, count(embedding)::int AS with_embedding FROM estimates');
    console.log('確かめ 行数・埋め込みあり:', JSON.stringify(counts.rows[0]));
    const cols = await client.query(`SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'estimates' AND column_name IN ('embedding', 'embedding_model') ORDER BY column_name`);
    console.log('確かめ 列:', JSON.stringify(cols.rows));
    const ins = await client.query(`INSERT INTO estimates (name, type, size, color, qty, data_state, reuse, amount, cost)
      VALUES ('予行演習', 'チラシ', 'A4', '両面4C', 1, '完全データ', '新規', 1, 1) RETURNING id, embedding`);
    console.log('確かめ 列を指定しない INSERT:', JSON.stringify(ins.rows[0]), '(ROLLBACK で消える)');
  } finally {
    await client.query('ROLLBACK');
    console.log('ROLLBACK しました(何も残っていません)');
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  // 接続文字列を含み得るので全文は出さず、種別と Postgres のエラーコードだけを出す
  const code = typeof e === 'object' && e !== null ? new Map(Object.entries(e)).get('code') : undefined;
  console.error('失敗しました:', e instanceof Error ? e.name : 'unknown', typeof code === 'string' ? `code=${code}` : '', '(ROLLBACK 済み。DB は変わっていません)');
  process.exit(1);
});
