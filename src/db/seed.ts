import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { customers, papers, estimates } from './schema';
import type { NewEstimate } from './schema';

const here = dirname(fileURLToPath(import.meta.url));

type Row = {
  id: string; name: string; type: string; size: string; paper: string;
  paper_family: string; color: string; qty: number; amount: number; cost: number;
  lead_days: number; finishing: string[]; data_state: string; reuse: string;
  rework: string; note: string; date: string;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未設定です(.env.local に Neon の接続文字列を入れてください)');
  const db = drizzle(neon(url));

  const data = JSON.parse(readFileSync(join(here, 'seed-data.json'), 'utf-8')) as { records: Row[] };
  const rows = data.records;

  // papers(用紙辞書): paper→family を重複排除
  const paperMap = new Map<string, string>();
  for (const r of rows) paperMap.set(r.paper, r.paper_family);
  const paperRows = [...paperMap].map(([name, family]) => ({ name, family }));

  // 冪等化: FK順に削除してから投入(estimates→papers→customers)
  await db.delete(estimates);
  await db.delete(papers);
  await db.delete(customers);

  await db.insert(papers).values(paperRows);
  await db.insert(customers).values({ name: 'サンプル商店', note: 'デモ用の顧客' });

  // ※ enum 列は Postgres 側でも検証される(不正値は insert 時に弾かれる)ため、型キャストは DB 制約が担保
  const estimateRows = rows.map((r) => ({
    code: r.id,
    name: r.name,
    status: 'reference',
    source: 'seed',
    type: r.type,
    size: r.size,
    paper: r.paper,
    color: r.color,
    qty: r.qty,
    finishing: r.finishing,
    dataState: r.data_state,
    reuse: r.reuse,
    amount: r.amount,
    cost: r.cost,
    rework: r.rework || null,
    note: r.note || null,
    leadDays: r.lead_days,
    date: r.date || null,
  })) as unknown as NewEstimate[];

  await db.insert(estimates).values(estimateRows);

  console.log(`seeded: customers=1, papers=${paperRows.length}, estimates=${rows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
