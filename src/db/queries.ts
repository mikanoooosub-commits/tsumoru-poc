import { db } from './index';
import { estimates, papers } from './schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
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

// 確定金額の記録(source=tool・status=draft)。叩き台との差を後から見るための一覧。
export type ToolRecord = {
  id: number;
  code: string | null;
  draftAmount: number | null;
  amount: number;
  reason: string | null;
  createdAt: string; // ISO文字列(クライアントへ渡すため)
};

export async function getToolRecords(limit = 10): Promise<ToolRecord[]> {
  const rows = await db
    .select({
      id: estimates.id,
      code: estimates.code,
      draftAmount: estimates.draftAmount,
      amount: estimates.amount,
      reason: estimates.reason,
      createdAt: estimates.createdAt,
    })
    .from(estimates)
    .where(and(eq(estimates.source, 'tool'), eq(estimates.status, 'draft')))
    .orderBy(desc(estimates.createdAt), desc(estimates.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
