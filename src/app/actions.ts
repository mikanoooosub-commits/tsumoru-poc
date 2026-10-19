'use server';

import { db } from '@/db';
import { estimates, papers, typeEnum, sizeEnum, colorEnum, dataStateEnum, reuseEnum } from '@/db/schema';
import { getEstimates, getSimilarities } from '@/db/queries';
import { revalidatePath } from 'next/cache';
import { or, ilike, eq } from 'drizzle-orm';
import { strictInt, escapeLike, parseQty, INT4_MAX, QTY_ERROR, NAME_MAX, MEMO_MAX, REASON_MAX, REQUEST_MAX, REQUEST_ERROR } from '@/lib/input';
import { FINS, rank, buildDraft, yen, type Query, type Similarities } from '@/lib/scoring';
import { embedTexts, caseText, voyageKey, EMBED_MODEL } from '@/lib/embedding';

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

  let rowId: number;
  try {
    if (id) {
      const updated = await db.update(estimates).set(values).where(eq(estimates.id, id)).returning({ id: estimates.id });
      if (updated.length === 0) return { ok: false, message: '更新できませんでした(対象が見つかりません。他の画面で削除された可能性があります)' };
      rowId = id;
    } else {
      // 採番: insert 後の serial id から code=E-{id} を付与(シードの id N ↔ E-00N と同じ規則)
      const [row] = await db
        .insert(estimates)
        .values({ ...values, status: 'confirmed', source: 'manual' })
        .returning({ id: estimates.id });
      await db.update(estimates).set({ code: `E-${String(row.id).padStart(3, '0')}` }).where(eq(estimates.id, row.id));
      rowId = row.id;
    }
  } catch (e) {
    console.error('saveEstimate failed', e); // 詳細はサーバログへ。画面には固定文言のみ
    return { ok: false, message: (id ? '更新' : '登録') + 'に失敗しました。入力した内容は残っているので、もう一度押せます' };
  }

  // 意味検索の埋め込みを付ける(WO-023)。失敗しても登録・更新は成功のまま(埋め込みは NULL。scripts/embed-backfill.ts で後から付く)
  const embedded = await refreshEmbedding(rowId, values);

  revalidatePath('/'); // 一覧・母集団を最新化
  const tail = embedded ? '' : '(意味検索の準備はあとで行います)';
  return { ok: true, message: `「${values.name}」を${id ? '更新' : '登録'}しました(次回の類似検索から使えます)${tail}` };
}

// 案件の埋め込みを作り直す。先に NULL に戻してから付ける(編集で中身が変わったのに古い埋め込みで引かれないように)。
// キーが無いときは NULL に戻すだけ(画面には何も足さない)。false=キーはあるのに付けられなかった
async function refreshEmbedding(rowId: number, v: EstimateValues): Promise<boolean> {
  try {
    await db.update(estimates).set({ embedding: null, embeddingModel: null }).where(eq(estimates.id, rowId));
    if (!voyageKey()) return true;
    const r = await embedTexts([caseText(v)], 'document');
    if (!r.ok) return false;
    await db.update(estimates).set({ embedding: r.vectors[0], embeddingModel: EMBED_MODEL }).where(eq(estimates.id, rowId));
    return true;
  } catch (e) {
    console.error('refreshEmbedding failed', e);
    return false;
  }
}

// ── 意味検索(WO-023・D88) ──
// 「特記・要望」の自由文を Voyage AI で埋め込み、母集団の各案件との文の意味の近さ(id → コサイン類似度)を返す。
// 失敗しても例外を投げない。画面は「条件の点だけ」で叩き台を出し、使えなかった理由を出す(止めない)
export type SemanticResult =
  | { ok: true; sims: Similarities }
  | { ok: false; reason: 'invalid' | 'nokey' | 'notready' | 'failed'; message: string };

// Postgres のエラーコード(Drizzle が包んだときは cause の中)。列が無い=42703・型や演算子が無い(pgvector 未導入)=42704・42883
function pgCode(e: unknown): string | null {
  let cur: unknown = e;
  for (let i = 0; i < 3 && typeof cur === 'object' && cur !== null; i++) {
    const m = new Map(Object.entries(cur));
    const code = m.get('code');
    if (typeof code === 'string') return code;
    cur = cur instanceof Error ? cur.cause : m.get('cause');
  }
  return null;
}

const NOT_READY = '過去案件の意味検索の準備がまだのため';
async function similaritiesFor(text: string): Promise<SemanticResult> {
  if (!voyageKey()) return { ok: false, reason: 'nokey', message: '意味検索の設定がまだのため' };
  const emb = await embedTexts([text], 'query');
  if (!emb.ok) return { ok: false, reason: 'failed', message: '意味検索のサービス(Voyage AI)につながらなかったため' };
  try {
    const sims = await getSimilarities(emb.vectors[0]);
    if (Object.keys(sims).length === 0) return { ok: false, reason: 'notready', message: NOT_READY };
    return { ok: true, sims };
  } catch (e) {
    const code = pgCode(e);
    if (code === '42703' || code === '42704' || code === '42883') return { ok: false, reason: 'notready', message: NOT_READY };
    console.error('getSimilarities failed', e);
    return { ok: false, reason: 'failed', message: '意味検索の計算に失敗したため' };
  }
}

// 自由文の検証(サーバー側。文字列でなければ不正・前後の空白を除く・長さの上限 REQUEST_MAX)
function parseRequestText(v: unknown): { ok: true; text: string } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, text: '' };
  if (typeof v !== 'string') return { ok: false };
  const text = v.trim();
  return text.length <= REQUEST_MAX ? { ok: true, text } : { ok: false };
}

export async function semanticScores(input: unknown): Promise<SemanticResult> {
  const p = parseRequestText(input);
  if (!p.ok) return { ok: false, reason: 'invalid', message: REQUEST_ERROR };
  if (!p.text) return { ok: true, sims: {} }; // 空なら外に送らない(画面は空のとき呼ばない作りだが、念のため)
  return similaritiesFor(p.text);
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
//   note=「特記・要望」の自由文(WO-023。後の意味検索・語句検索の材料。PM 判断 2)。埋め込みは付けない(母集団に入らない行のため)。
//   叩き台は自由文も使い、画面と同じ手順(意味の近さ → rank → buildDraft)で再計算する(PM 判断 1)。
//   shownDraft=画面に出ていた叩き台。サーバーの再計算と違えば(そのとき意味検索が使えなかった等)、保存はサーバーの値でメッセージに書く。
export type RecordInput = {
  type: string; size: string; paper: string; color: string; qty: number;
  finishing: string[]; dataState: string; reuse: string;
  amount: number; reason: string; request: string; shownDraft: number;
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
  const req = parseRequestText(raw.get('request'));
  const shownDraft = wholeNumber('shownDraft');
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
  if (!req.ok) return { ok: false, message: REQUEST_ERROR };
  const request = req.text;

  let draftAmount = 0;
  let semFailed = false;
  try {
    // 用紙は辞書にあるものだけ(family もここで確定する)
    const paperRows = await db.select().from(papers).where(eq(papers.name, paper));
    if (paperRows.length === 0) return { ok: false, message: '用紙が不正です' };

    // 叩き台はサーバーで再計算する(画面が送った叩き台は使わない=差分の根拠を改ざんさせない)
    const q: Query = { type, size, family: paperRows[0].family, color, qty, finishing, dataState, reuse };
    const sem = request ? await similaritiesFor(request) : null;
    const { basis } = rank(q, await getEstimates(), sem?.ok ? sem.sims : null);
    const draft = buildDraft(basis, q);
    if (!draft) return { ok: false, message: '類似案件がなく叩き台が出せないため、記録できません' };
    draftAmount = draft.amount;
    semFailed = !!sem && !sem.ok;

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
        note: request || null,
      })
      .returning({ id: estimates.id });
    await db.update(estimates).set({ code: `E-${String(row.id).padStart(3, '0')}` }).where(eq(estimates.id, row.id));
  } catch (e) {
    console.error('recordFinalAmount failed', e);
    return { ok: false, message: '記録に失敗しました。入力した内容は残っているので、もう一度押せます' };
  }

  revalidatePath('/');
  if (Number.isFinite(shownDraft) && shownDraft !== draftAmount) {
    const why = semFailed ? '記録の時点で意味検索が使えず、条件の近さだけで出し直したため' : '叩き台を出した後に、過去見積や文の意味の近さが変わったため';
    return { ok: true, message: `確定金額を記録しました。ただし、保存した叩き台は画面と違う ${yen(draftAmount)} です(${why})` };
  }
  return { ok: true, message: '確定金額を記録しました' };
}
