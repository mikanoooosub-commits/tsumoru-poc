import { db } from './index';
import { estimates, papers } from './schema';
import { eq, inArray, desc } from 'drizzle-orm';
import type { EstimateRow } from '@/lib/scoring';

// 類似検索の母集団: status in (reference, confirmed)。family は papers を JOIN で取得。
export async function getEstimates(): Promise<EstimateRow[]> {
  const rows = await db
    .select({
      id: estimates.id,
      code: estimates.code,
      name: estimates.name,
      type: estimates.type,
      size: estimates.size,
      paper: estimates.paper,
      family: papers.family,
      color: estimates.color,
      qty: estimates.qty,
      finishing: estimates.finishing,
      dataState: estimates.dataState,
      reuse: estimates.reuse,
      amount: estimates.amount,
      cost: estimates.cost,
      rework: estimates.rework,
      note: estimates.note,
      leadDays: estimates.leadDays,
    })
    .from(estimates)
    .leftJoin(papers, eq(estimates.paper, papers.name))
    .where(inArray(estimates.status, ['reference', 'confirmed']))
    .orderBy(desc(estimates.createdAt));
  return rows as EstimateRow[];
}

export async function getPapers() {
  return db.select().from(papers).orderBy(papers.name);
}
