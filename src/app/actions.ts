'use server';

import { db } from '@/db';
import { estimates, papers, type NewEstimate } from '@/db/schema';
import { getEstimates } from '@/db/queries';
import { revalidatePath } from 'next/cache';
import { or, ilike, eq } from 'drizzle-orm';
import { strictInt, escapeLike, INT4_MAX } from '@/lib/input';
import { TYPES, SIZES, COLORS, DATA_STATES, REUSES, FINS, rank, buildDraft, type Query } from '@/lib/scoring';

export type FormState = { ok: boolean; message: string } | null;

type Parsed = {
  name: string; type: string; size: string; paper: string | null; color: string;
  dataState: string; reuse: string; qty: number; amount: number; cost: number;
  leadDays: number | null; note: string | null; rework: string | null; finishing: string[];
};

// ── フォーム値の取り出し＋サーバ側検証(クライアント入力は信用しない) ──
function parseForm(formData: FormData): { ok: true; v: Parsed } | { ok: false; message: string } {
  const str = (k: string) => (formData.get(k) as string | null)?.trim() ?? '';
  const num = (k: string) => strictInt(str(k));

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
  const id = idRaw ? strictInt(idRaw) : null;
  if (id !== null && (!Number.isFinite(id) || id <= 0)) return { ok: false, message: 'IDが不正です' };

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
      const updated = await db.update(estimates).set(values).where(eq(estimates.id, id)).returning({ id: estimates.id });
      if (updated.length === 0) return { ok: false, message: '更新できませんでした(対象が見つかりません。他の画面で削除された可能性があります)' };
    } else {
      // 採番: insert 後の serial id から code=E-{id} を付与(シードの id N ↔ E-00N と同じ規則)
      const [row] = await db
        .insert(estimates)
        .values({ ...values, status: 'confirmed', source: 'manual' })
        .returning({ id: estimates.id });
      await db.update(estimates).set({ code: `E-${String(row.id).padStart(3, '0')}` }).where(eq(estimates.id, row.id));
    }
  } catch (e) {
    console.error('saveEstimate failed', e); // 詳細はサーバログへ。画面には固定文言のみ
    return { ok: false, message: (id ? '更新' : '登録') + 'に失敗しました。入力内容を確認し、もう一度お試しください' };
  }

  revalidatePath('/'); // 一覧・母集団を最新化
  return { ok: true, message: `「${v.name}」を${id ? '更新' : '登録'}しました(次回の類似検索から使えます)` };
}

// 過去見積の削除
export async function deleteEstimate(id: number): Promise<FormState> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'IDが不正です' };
  try {
    const deleted = await db.delete(estimates).where(eq(estimates.id, id)).returning({ id: estimates.id });
    if (deleted.length === 0) return { ok: false, message: '削除できませんでした(対象が見つかりません。すでに削除された可能性があります)' };
  } catch (e) {
    console.error('deleteEstimate failed', e);
    return { ok: false, message: '削除に失敗しました。もう一度お試しください' };
  }
  revalidatePath('/');
  return { ok: true, message: '削除しました' };
}

// メモ検索(DBの ILIKE。note / rework / reason を対象 = Phase1のLIKE検索)
export async function searchMemos(kw: string) {
  const q = kw.trim();
  if (!q) return [];
  const like = `%${escapeLike(q)}%`;
  const rows = await db
    .select({
      id: estimates.id,
      code: estimates.code,
      name: estimates.name,
      rework: estimates.rework,
      note: estimates.note,
      reason: estimates.reason,
      source: estimates.source,
      amount: estimates.amount,
      draftAmount: estimates.draftAmount,
    })
    .from(estimates)
    .where(or(ilike(estimates.note, like), ilike(estimates.rework, like), ilike(estimates.reason, like)))
    .limit(20);
  return rows;
}

// ── 確定金額の記録(ISSUE-P-005・WO-003) ──
// 引合い1回=新しい行を1つ insert する(既存行は触らない)。
//   status='draft'(類似検索の母集団=reference/confirmed に入らない)/ source='tool'
//   amount=確定金額 / draft_amount=叩き台(サーバーで再計算) / reason=補正理由
//   cost=0 は「原価未入力」を表す。粗利計算には使わない(母集団に入らない行のため)。
export type RecordInput = {
  type: string; size: string; paper: string; color: string; qty: number;
  finishing: string[]; dataState: string; reuse: string;
  amount: number; reason: string;
};

const REASON_MAX = 300;

export async function recordFinalAmount(input: unknown): Promise<FormState> {
  // クライアントから来た値は型も中身も信用せず、1つずつ確かめる
  if (typeof input !== 'object' || input === null) return { ok: false, message: '入力が不正です' };
  const raw = input as Record<string, unknown>;
  const text = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '');
  const wholeNumber = (k: string) => (typeof raw[k] === 'number' && Number.isInteger(raw[k]) ? (raw[k] as number) : NaN);

  const type = text('type');
  const size = text('size');
  const paper = text('paper');
  const color = text('color');
  const dataState = text('dataState');
  const reuse = text('reuse');
  const qty = wholeNumber('qty');
  const amount = wholeNumber('amount');
  const reason = text('reason');
  const finishing = Array.isArray(raw.finishing)
    ? raw.finishing.filter((v): v is string => typeof v === 'string' && FINS.includes(v))
    : [];

  if (!TYPES.includes(type)) return { ok: false, message: '種類が不正です' };
  if (!SIZES.includes(size)) return { ok: false, message: 'サイズが不正です' };
  if (!COLORS.includes(color)) return { ok: false, message: '色が不正です' };
  if (!DATA_STATES.includes(dataState)) return { ok: false, message: '支給データの状態が不正です' };
  if (!REUSES.includes(reuse)) return { ok: false, message: '流用が不正です' };
  if (!(qty > 0 && qty <= INT4_MAX)) return { ok: false, message: '数量が不正です' };
  if (!(amount > 0 && amount <= INT4_MAX)) return { ok: false, message: '確定金額は1円以上の整数で入力してください' };
  if (reason.length > REASON_MAX) return { ok: false, message: `補正理由は${REASON_MAX}文字以内で入力してください` };

  try {
    // 用紙は辞書にあるものだけ(family もここで確定する)
    const paperRows = await db.select().from(papers).where(eq(papers.name, paper));
    if (paperRows.length === 0) return { ok: false, message: '用紙が不正です' };

    // 叩き台はサーバーで再計算する(画面が送った叩き台は使わない=差分の根拠を改ざんさせない)
    const q: Query = { type, size, family: paperRows[0].family, color, qty, finishing, dataState, reuse };
    const { basis } = rank(q, await getEstimates());
    const draft = buildDraft(basis, q);
    if (!draft) return { ok: false, message: '類似案件がなく叩き台が出せないため、記録できません' };

    const [row] = await db
      .insert(estimates)
      .values({
        name: `【つもる記録】${type} ${size} ${color} ${qty.toLocaleString('ja-JP')}部`,
        status: 'draft',
        source: 'tool',
        type: type as NewEstimate['type'],
        size: size as NewEstimate['size'],
        paper,
        color: color as NewEstimate['color'],
        qty,
        finishing,
        dataState: dataState as NewEstimate['dataState'],
        reuse: reuse as NewEstimate['reuse'],
        amount,
        cost: 0,
        draftAmount: draft.amount,
        reason: reason || null,
      })
      .returning({ id: estimates.id });
    await db.update(estimates).set({ code: `E-${String(row.id).padStart(3, '0')}` }).where(eq(estimates.id, row.id));
  } catch (e) {
    console.error('recordFinalAmount failed', e);
    return { ok: false, message: '記録に失敗しました。もう一度お試しください' };
  }

  revalidatePath('/');
  return { ok: true, message: '確定金額を記録しました' };
}
