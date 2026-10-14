'use server';

import { db } from '@/db';
import { estimates, papers, typeEnum, sizeEnum, colorEnum, dataStateEnum, reuseEnum } from '@/db/schema';
import { getEstimates } from '@/db/queries';
import { revalidatePath } from 'next/cache';
import { or, ilike, eq } from 'drizzle-orm';
import { strictInt, escapeLike, parseQty, INT4_MAX, QTY_ERROR, NAME_MAX, MEMO_MAX, REASON_MAX } from '@/lib/input';
import { FINS, rank, buildDraft, type Query } from '@/lib/scoring';

export type FormState = { ok: boolean; message: string } | null;

// 選択肢の判定(DBの ENUM の値そのものと照らす。合っていれば ENUM の型に絞り込まれるので `as` が要らない)
function oneOf<T extends string>(values: readonly T[], v: string): v is T {
  return values.some((x) => x === v);
}
const TYPE_VALUES = typeEnum.enumValues;
const SIZE_VALUES = sizeEnum.enumValues;
const COLOR_VALUES = colorEnum.enumValues;
const DATA_STATE_VALUES = dataStateEnum.enumValues;
const REUSE_VALUES = reuseEnum.enumValues;

type EstimateValues = {
  name: string;
  type: (typeof TYPE_VALUES)[number];
  size: (typeof SIZE_VALUES)[number];
  paper: string | null;
  color: (typeof COLOR_VALUES)[number];
  dataState: (typeof DATA_STATE_VALUES)[number];
  reuse: (typeof REUSE_VALUES)[number];
  qty: number; amount: number; cost: number;
  leadDays: number | null; note: string | null; rework: string | null; finishing: string[];
};

// 金額(1円以上の整数)。空・0・負・小数・桁あふれは null(F-04: 「必須」の金額が0円で通っていた)
function parseYen(raw: string): number | null {
  const v = strictInt(raw);
  return Number.isFinite(v) && v >= 1 ? v : null;
}

// ── フォーム値の取り出し＋サーバ側検証(クライアント入力は信用しない) ──
function parseForm(formData: FormData): { ok: true; v: EstimateValues } | { ok: false; message: string } {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };

  const name = str('name');
  const type = str('type');
  const size = str('size');
  const paper = str('paper') || null;
  const color = str('color');
  const dataState = str('data_state');
  const reuse = str('reuse');
  const qty = parseQty(str('qty'));
  const amount = parseYen(str('amount'));
  const cost = parseYen(str('cost'));
  const leadRaw = str('lead_days');
  const leadDays = leadRaw ? strictInt(leadRaw) : null;
  const note = str('note') || null;
  const rework = str('rework') || null;
  const finishing = formData.getAll('finishing').filter((v): v is string => typeof v === 'string' && FINS.includes(v));

  if (!name) return { ok: false, message: '案件名を入力してください' };
  if (name.length > NAME_MAX) return { ok: false, message: `案件名は${NAME_MAX}文字以内で入力してください` };
  if (!oneOf(TYPE_VALUES, type)) return { ok: false, message: '種類が不正です' };
  if (!oneOf(SIZE_VALUES, size)) return { ok: false, message: 'サイズが不正です' };
  if (!oneOf(COLOR_VALUES, color)) return { ok: false, message: '色が不正です' };
  if (!oneOf(DATA_STATE_VALUES, dataState)) return { ok: false, message: '支給データの状態が不正です' };
  if (!oneOf(REUSE_VALUES, reuse)) return { ok: false, message: '流用が不正です' };
  if (qty === null) return { ok: false, message: QTY_ERROR };
  if (amount === null) return { ok: false, message: '見積金額は1円以上の整数で入力してください' };
  if (cost === null) return { ok: false, message: '原価は1円以上の整数で入力してください' };
  if (leadDays !== null && !Number.isFinite(leadDays)) return { ok: false, message: '納期は0以上の整数(営業日)で入力してください' };
  if ((note?.length ?? 0) > MEMO_MAX) return { ok: false, message: `メモは${MEMO_MAX}文字以内で入力してください` };
  if ((rework?.length ?? 0) > MEMO_MAX) return { ok: false, message: `手戻り事由は${MEMO_MAX}文字以内で入力してください` };

  return { ok: true, v: { name, type, size, paper, color, dataState, reuse, qty, amount, cost, leadDays, note, rework, finishing } };
}

// 過去見積の登録 or 更新(hidden の id があれば更新)。id 付き=更新は status/source を変えない。
export async function saveEstimate(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(formData);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const values = parsed.v;

  const idField = formData.get('id');
  const idRaw = typeof idField === 'string' ? idField.trim() : '';
  const id = idRaw ? strictInt(idRaw) : null;
  if (id !== null && (!Number.isFinite(id) || id <= 0)) return { ok: false, message: 'IDが不正です' };

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
    return { ok: false, message: (id ? '更新' : '登録') + 'に失敗しました。入力した内容は残っているので、もう一度押せます' };
  }

  revalidatePath('/'); // 一覧・母集団を最新化
  return { ok: true, message: `「${values.name}」を${id ? '更新' : '登録'}しました(次回の類似検索から使えます)` };
}

// 過去見積の削除
export async function deleteEstimate(id: number): Promise<FormState> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'IDが不正です' };
  try {
    const deleted = await db.delete(estimates).where(eq(estimates.id, id)).returning({ id: estimates.id });
    if (deleted.length === 0) return { ok: false, message: '削除できませんでした(対象が見つかりません。すでに削除された可能性があります)' };
  } catch (e) {
    console.error('deleteEstimate failed', e);
    return { ok: false, message: '削除に失敗しました。時間をおいて、もう一度押せます' };
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

export async function recordFinalAmount(input: unknown): Promise<FormState> {
  // クライアントから来た値は型も中身も信用せず、1つずつ確かめる(typeof で絞り込み、`as` に頼らない)
  if (typeof input !== 'object' || input === null) return { ok: false, message: '入力が不正です' };
  const raw = new Map(Object.entries(input));
  const text = (k: string) => {
    const v = raw.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const wholeNumber = (k: string) => {
    const v = raw.get(k);
    return typeof v === 'number' && Number.isInteger(v) ? v : NaN;
  };

  const type = text('type');
  const size = text('size');
  const paper = text('paper');
  const color = text('color');
  const dataState = text('dataState');
  const reuse = text('reuse');
  const qty = wholeNumber('qty');
  const amount = wholeNumber('amount');
  const reason = text('reason');
  const finRaw = raw.get('finishing');
  const finishing = Array.isArray(finRaw)
    ? finRaw.filter((v): v is string => typeof v === 'string' && FINS.includes(v))
    : [];

  if (!oneOf(TYPE_VALUES, type)) return { ok: false, message: '種類が不正です' };
  if (!oneOf(SIZE_VALUES, size)) return { ok: false, message: 'サイズが不正です' };
  if (!oneOf(COLOR_VALUES, color)) return { ok: false, message: '色が不正です' };
  if (!oneOf(DATA_STATE_VALUES, dataState)) return { ok: false, message: '支給データの状態が不正です' };
  if (!oneOf(REUSE_VALUES, reuse)) return { ok: false, message: '流用が不正です' };
  if (parseQty(String(qty)) === null) return { ok: false, message: QTY_ERROR };
  if (!(amount >= 1 && amount <= INT4_MAX)) return { ok: false, message: '確定金額は1円以上の整数で入力してください' };
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
        type,
        size,
        paper,
        color,
        qty,
        finishing,
        dataState,
        reuse,
        amount,
        cost: 0,
        draftAmount: draft.amount,
        reason: reason || null,
      })
      .returning({ id: estimates.id });
    await db.update(estimates).set({ code: `E-${String(row.id).padStart(3, '0')}` }).where(eq(estimates.id, row.id));
  } catch (e) {
    console.error('recordFinalAmount failed', e);
    return { ok: false, message: '記録に失敗しました。入力した内容は残っているので、もう一度押せます' };
  }

  revalidatePath('/');
  return { ok: true, message: '確定金額を記録しました' };
}
