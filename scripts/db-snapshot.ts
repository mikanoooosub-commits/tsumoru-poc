// DBの控え取りと突き合わせ(読み取り専用。書き込み・削除はしない)
//   npx tsx scripts/db-snapshot.ts dump <出力JSON>   … customers/papers/estimates の全行を書き出す
//   npx tsx scripts/db-snapshot.ts diff <控えJSON>   … 現在のDBと控えを突き合わせる(差があれば終了コード1)
// 接続文字列は .env.local から読み、画面・ファイルには一切出さない。
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });

type Snapshot = {
  takenAt: string;
  counts: { customers: number; papers: number; estimates: number };
  customers: Record<string, unknown>[];
  papers: Record<string, unknown>[];
  estimates: Record<string, unknown>[];
};

async function takeSnapshot(): Promise<Snapshot> {
  const url = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '');
  if (!url) throw new Error('DATABASE_URL 未設定です(.env.local を確認)');
  const sql = neon(url);
  const customers = await sql`SELECT * FROM customers ORDER BY id`;
  const papers = await sql`SELECT * FROM papers ORDER BY name`;
  const estimates = await sql`SELECT * FROM estimates ORDER BY id`;
  return {
    takenAt: new Date().toISOString(),
    counts: { customers: customers.length, papers: papers.length, estimates: estimates.length },
    customers,
    papers,
    estimates,
  };
}

// 行を id(papers は name)で対応づけ、JSON文字列で比較する
function compareTable(name: string, key: string, before: Record<string, unknown>[], after: Record<string, unknown>[]) {
  const lines: string[] = [];
  const b = new Map(before.map((r) => [String(r[key]), JSON.stringify(r)]));
  const a = new Map(after.map((r) => [String(r[key]), JSON.stringify(r)]));
  for (const [k, v] of b) {
    if (!a.has(k)) lines.push(`${name}: ${key}=${k} が控えにあるが現在は無い`);
    else if (a.get(k) !== v) lines.push(`${name}: ${key}=${k} の内容が控えと違う`);
  }
  for (const k of a.keys()) if (!b.has(k)) lines.push(`${name}: ${key}=${k} が控えに無いが現在はある(試験データの消し残し)`);
  return lines;
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (!file || (mode !== 'dump' && mode !== 'diff')) {
    console.error('使い方: tsx scripts/db-snapshot.ts dump|diff <JSONファイル>');
    process.exit(2);
  }
  const now = await takeSnapshot();

  if (mode === 'dump') {
    writeFileSync(file, JSON.stringify(now, null, 2) + '\n', 'utf8');
    console.log(`控えを書き出しました: ${file}`);
    console.log('件数:', JSON.stringify(now.counts));
    return;
  }

  const saved = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
  console.log('控え件数:', JSON.stringify(saved.counts));
  console.log('現在件数:', JSON.stringify(now.counts));
  const diffs = [
    ...compareTable('customers', 'id', saved.customers, now.customers),
    ...compareTable('papers', 'name', saved.papers, now.papers),
    ...compareTable('estimates', 'id', saved.estimates, now.estimates),
  ];
  if (diffs.length === 0) {
    console.log('突き合わせ結果: 全行一致(差なし)');
    return;
  }
  console.log(`突き合わせ結果: 差あり ${diffs.length} 件`);
  diffs.forEach((d) => console.log(' - ' + d));
  process.exit(1);
}

main().catch((e) => {
  // 接続文字列を含み得るため、メッセージ全体は出さず種別だけ出す
  console.error('失敗:', e instanceof Error ? e.name : 'unknown');
  process.exit(1);
});
