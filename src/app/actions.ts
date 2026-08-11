'use server';

import { db } from '@/db';
import { estimates, type NewEstimate } from '@/db/schema';
import { revalidatePath } from 'next/cache';
import { or, ilike, eq } from 'drizzle-orm';
import { TYPES, SIZES, COLORS, DATA_STATES, REUSES, FINS } from '@/lib/scoring';

export type FormState = { ok: boolean; message: string } | null;

type Parsed = {
  name: string; type: string; size: string; paper: string | null; color: string;
  dataState: string; reuse: string; qty: number; amount: number; cost: number;
  leadDays: number | null; note: string | null; rework: string | null; finishing: string[];
};

// ── フォーム値の取り出し＋サーバ側検証(クライアント入力は信用しない) ──
function parseForm(formData: FormData): { ok: true; v: Parsed } | { ok: false; message: string } {
  const str = (k: string) => (formData.get(k) as string | null)?.trim() ?? '';
  const num = (k: string) => {
    const v = parseInt(str(k), 10);
    return Number.isFinite(v) ? v : NaN;
  };

  const name = str('name');
  const type = str('type');
  const size = str('size');
  const paper = str('paper') || null;
  const color = str('color');
  const dataState = str('data_state');
  const reuse = str('reuse');
  const qty = num('qty');
  const amount = num('amount');
  const cost = num('cost');
  const leadDays = str('lead_days') ? num('lead_days') : null;
  const note = str('note') || null;
  const rework = str('rework') || null;
  const finishing = formData.getAll('finishing').map(String).filter((v) => FINS.includes(v));

  if (!name) return { ok: false, message: '案件名を入力してください' };
  if (!TYPES.includes(type)) return { ok: false, message: '種類が不正です' };
  if (!SIZES.includes(size)) return { ok: false, message: 'サイズが不正です' };
  if (!COLORS.includes(color)) return { ok: false, message: '色が不正です' };
  if (!DATA_STATES.includes(dataState)) return { ok: false, message: '支給データの状態が不正です' };
  if (!REUSES.includes(reuse)) return { ok: false, message: '流用が不正です' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, message: '数量は正の整数で入力してください' };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: '見積金額が不正です' };
  if (!Number.isFinite(cost) || cost < 0) return { ok: false, message: '原価が不正です' };
  if (leadDays !== null && (!Number.isFinite(leadDays) || leadDays < 0)) return { ok: false, message: '納期が不正です' };

  return { ok: true, v: { name, type, size, paper, color, dataState, reuse, qty, amount, cost, leadDays, note, rework, finishing } };
}

// 過去見積の登録 or 更新(hidden の id があれば更新)。id 付き=更新は status/source を変えない。
export async function saveEstimate(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(formData);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const v = parsed.v;

  const idRaw = (formData.get('id') as string | null)?.trim() ?? '';
  const id = idRaw ? parseInt(idRaw, 10) : null;

  const values = {
    name: v.name,
    type: v.type as NewEstimate['type'],
    size: v.size as NewEstimate['size'],
    paper: v.paper,
    color: v.color as NewEstimate['color'],
    qty: v.qty,
    finishing: v.finishing,
    dataState: v.dataState as NewEstimate['dataState'],
    reuse: v.reuse as NewEstimate['reuse'],
    amount: v.amount,
    cost: v.cost,
    leadDays: v.leadDays,
    note: v.note,
    rework: v.rework,
  };

  try {
    if (id) {
      await db.update(estimates).set(values).where(eq(estimates.id, id));
    } else {
      // 採番: insert 後の serial id から code=E-{id} を付与(シードの id N ↔ E-00N と同じ規則)
      const [row] = await db
        .insert(estimates)
        .values({ ...values, status: 'confirmed', source: 'manual' })
        .returning({ id: estimates.id });
      await db.update(estimates).set({ code: `E-${String(row.id).padStart(3, '0')}` }).where(eq(estimates.id, row.id));
    }
  } catch (e) {
    return { ok: false, message: (id ? '更新' : '登録') + 'に失敗しました: ' + (e as Error).message };
  }

  revalidatePath('/'); // 一覧・母集団を最新化
  return { ok: true, message: `「${v.name}」を${id ? '更新' : '登録'}しました(次回の類似検索から使えます)` };
}

// 過去見積の削除
export async function deleteEstimate(id: number): Promise<FormState> {
  if (!Number.isFinite(id)) return { ok: false, message: 'IDが不正です' };
  try {
    await db.delete(estimates).where(eq(estimates.id, id));
  } catch (e) {
    return { ok: false, message: '削除に失敗しました: ' + (e as Error).message };
  }
  revalidatePath('/');
  return { ok: true, message: '削除しました' };
}

// メモ検索(DBの ILIKE。note / rework / reason を対象 = Phase1のLIKE検索)
export async function searchMemos(kw: string) {
  const q = kw.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const rows = await db
    .select({
      id: estimates.id,
      code: estimates.code,
      name: estimates.name,
      rework: estimates.rework,
      note: estimates.note,
    })
    .from(estimates)
    .where(or(ilike(estimates.note, like), ilike(estimates.rework, like), ilike(estimates.reason, like)))
    .limit(20);
  return rows;
}
