// 意味検索(WO-023)の埋め込みを、母集団(reference/confirmed)の過去案件に付ける。
//   npx tsx scripts/embed-backfill.ts            … 予行(dry-run・既定)。対象の件数と送る文の長さを出すだけ。外に送らない・書かない
//   npx tsx scripts/embed-backfill.ts --show     … 予行で、送る文そのものも出す(何を外に送るかを目で確かめる用)
//   npx tsx scripts/embed-backfill.ts --write    … Voyage AI に送って埋め込みを作り、DB に書く(PM が代表の確認を取ってから)
// 対象: 埋め込みが無い行と、今のモデル(EMBED_MODEL)以外で作った行。記録の行(status=draft)は対象にしない(母集団に入らないため)。
// 接続文字列とキーは .env.local から読み、画面・ファイルには一切出さない。
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { caseText, embedTexts, voyageKey, EMBED_MODEL } from '../src/lib/embedding';

config({ path: '.env.local', quiet: true });

const BATCH = 100; // 1回に送る件数(公式の上限 1,000 件・32万トークンより十分小さく)

type Row = {
  id: number; code: string | null; name: string; type: string; size: string; paper: string | null; color: string; qty: number;
  finishing: string[]; data_state: string; reuse: string; note: string | null; rework: string | null;
};

function toRow(r: Record<string, unknown>): Row {
  const s = (k: string) => { const v = r[k]; return typeof v === 'string' ? v : null; };
  const fin = r.finishing;
  return {
    id: Number(r.id), code: s('code'), name: s('name') ?? '', type: s('type') ?? '', size: s('size') ?? '', paper: s('paper'),
    color: s('color') ?? '', qty: Number(r.qty), finishing: Array.isArray(fin) ? fin.filter((v): v is string => typeof v === 'string') : [],
    data_state: s('data_state') ?? '', reuse: s('reuse') ?? '', note: s('note'), rework: s('rework'),
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const show = args.has('--show');
  const url = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '');
  if (!url) throw new Error('DATABASE_URL 未設定です(.env.local を確認)');
  const sql = neon(url);

  // 列があるか(0001 を適用したか)
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'estimates' AND column_name IN ('embedding', 'embedding_model')`;
  const ready = cols.length === 2;
  if (!ready && write) {
    console.error('estimates に embedding の列がまだありません。先に drizzle/0001_semantic_search.sql を適用してください');
    process.exit(2);
  }

  const raw = ready
    ? await sql`SELECT id, code, name, type, size, paper, color, qty, finishing, data_state, reuse, note, rework FROM estimates
        WHERE status IN ('reference', 'confirmed') AND (embedding IS NULL OR embedding_model IS DISTINCT FROM ${EMBED_MODEL}) ORDER BY id`
    : await sql`SELECT id, code, name, type, size, paper, color, qty, finishing, data_state, reuse, note, rework FROM estimates
        WHERE status IN ('reference', 'confirmed') ORDER BY id`;
  const rows = raw.map(toRow);
  const texts = rows.map((r) => caseText({ ...r, dataState: r.data_state }));

  console.log(`モード: ${write ? '書き込み(--write)' : '予行(dry-run・外に送らない・書かない)'}`);
  if (!ready) console.log('※ embedding の列がまだ無いので、母集団の全件を対象として数えています(0001 未適用)');
  console.log(`モデル: ${EMBED_MODEL} / キー: ${voyageKey() ? 'あり' : 'なし'}`);
  console.log(`対象: ${rows.length}件 / 文の長さ 合計 ${texts.reduce((a, t) => a + t.length, 0)}文字・最長 ${Math.max(0, ...texts.map((t) => t.length))}文字`);
  rows.forEach((r, i) => console.log(` - ${r.code ?? `#${r.id}`} ${texts[i].length}文字${show ? `: ${texts[i]}` : ''}`));

  if (!write) return;
  if (!voyageKey()) {
    console.error('VOYAGE_API_KEY が未設定です(.env.local を確認)');
    process.exit(2);
  }
  let done = 0;
  let tokens = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH);
    const r = await embedTexts(texts.slice(i, i + BATCH), 'document');
    if (!r.ok) {
      console.error(`埋め込みに失敗しました(${r.reason}${r.status ? ` HTTP ${r.status}` : ''})。ここまでに書いたのは ${done}件。もう一度流すと、残りだけが対象になります`);
      process.exit(1);
    }
    tokens += r.tokens;
    for (let j = 0; j < part.length; j++) {
      const vec = `[${r.vectors[j].join(',')}]`;
      await sql`UPDATE estimates SET embedding = ${vec}::vector, embedding_model = ${EMBED_MODEL} WHERE id = ${part[j].id}`;
      done++;
    }
  }
  const after = await sql`SELECT count(*)::int AS rows, count(embedding)::int AS with_embedding FROM estimates WHERE status IN ('reference', 'confirmed')`;
  console.log(`書き込み: ${done}件 / 使ったトークン ${tokens} / 母集団 ${after[0].rows}件のうち埋め込みあり ${after[0].with_embedding}件`);
}

main().catch((e) => {
  console.error('失敗しました:', e instanceof Error ? e.name : 'unknown'); // 接続文字列を含み得るため、メッセージ全体は出さない(db-snapshot.ts と同じ)
  process.exit(1);
});
