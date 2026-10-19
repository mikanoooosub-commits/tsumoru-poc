// 文の埋め込み(Voyage AI)。意味検索(WO-023)のために、案件の文と「特記・要望」の自由文を数の並び(ベクトル)にする。
// ・サーバー側だけで使う(Server Action と scripts/ から呼ぶ)。キーは環境変数 VOYAGE_API_KEY(NEXT_PUBLIC_ を付けない=ブラウザに出ない)。
//   'server-only' の印は付けていない: scripts/embed-backfill.ts(Next.js の外の tsx)からも読むため。
// ・失敗しても例外を投げず { ok: false } を返す。呼ぶ側は「条件の点だけ」で続ける(止めない)。
// ・ログにキーと本文は出さない。
// 仕様の出典(2026-10-19 確認): https://docs.voyageai.com/docs/embeddings ・ https://docs.voyageai.com/reference/embeddings-api

export const EMBED_MODEL = 'voyage-4'; // 多言語の検索に最適化(公式)。$0.06/100万トークン・無料枠2億トークン(https://docs.voyageai.com/docs/pricing)
export const EMBED_DIM = 1024; // voyage-4 の既定の次元。DB の列 vector(1024) と合わせる
const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
export const EMBED_TIMEOUT_MS = 8000; // これを超えたら諦めて条件の点だけにする(画面を待たせすぎない)【仮】
const MAX_BATCH = 1000; // 1回に送れる件数の上限(公式)

export type EmbedFail = 'nokey' | 'timeout' | 'http' | 'network' | 'bad-response';
export type EmbedResult =
  | { ok: true; vectors: number[][]; tokens: number }
  | { ok: false; reason: EmbedFail; status?: number };

// キー。前後の空白・引用符は除く(DATABASE_URL と同じ扱い。ISSUE-P-003)。無ければ null
export function voyageKey(): string | null {
  const k = process.env.VOYAGE_API_KEY?.trim().replace(/^["']|["']$/g, '');
  return k ? k : null;
}

// 返ってきた JSON を1つずつ確かめる(外部の応答を `as` で信じない)
function parseResponse(body: unknown, expected: number): { vectors: number[][]; tokens: number } | null {
  if (typeof body !== 'object' || body === null) return null;
  const obj = new Map(Object.entries(body));
  const data = obj.get('data');
  if (!Array.isArray(data) || data.length !== expected) return null;
  const vectors: number[][] = new Array(expected);
  for (const item of data) {
    if (typeof item !== 'object' || item === null) return null;
    const it = new Map(Object.entries(item));
    const index = it.get('index');
    const emb = it.get('embedding');
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= expected) return null;
    if (!Array.isArray(emb) || emb.length !== EMBED_DIM || !emb.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
    vectors[index] = emb;
  }
  if (vectors.some((v) => !v)) return null;
  const usage = obj.get('usage');
  const tokensRaw = typeof usage === 'object' && usage !== null ? new Map(Object.entries(usage)).get('total_tokens') : undefined;
  return { vectors, tokens: typeof tokensRaw === 'number' ? tokensRaw : 0 };
}

// 文の並びを埋め込む。input_type は、過去案件=document、検索の自由文=query(公式の推奨。前置きの文を Voyage が付ける)
export async function embedTexts(texts: string[], inputType: 'query' | 'document'): Promise<EmbedResult> {
  const key = voyageKey();
  if (!key) return { ok: false, reason: 'nokey' };
  if (texts.length === 0) return { ok: true, vectors: [], tokens: 0 };
  if (texts.length > MAX_BATCH) return { ok: false, reason: 'bad-response' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ input: texts, model: EMBED_MODEL, input_type: inputType, output_dimension: EMBED_DIM }),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`voyage embeddings: HTTP ${res.status}`); // 本文・キーは出さない
      return { ok: false, reason: 'http', status: res.status };
    }
    const parsed = parseResponse(await res.json(), texts.length);
    if (!parsed) {
      console.error('voyage embeddings: 応答の形が想定と違う');
      return { ok: false, reason: 'bad-response' };
    }
    return { ok: true, ...parsed };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    console.error(`voyage embeddings: ${aborted ? '時間切れ' : '通信の失敗'}`);
    return { ok: false, reason: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

// 過去案件を1つの文にする(Voyage に送る中身)。金額・原価・納期・日付・顧客・ID・補正理由は入れない(docs/architecture.md「外に送るもの」)
export type CaseTextSource = {
  name: string; type: string; size: string; paper: string | null; color: string; qty: number;
  finishing: string[]; dataState: string; reuse: string; note: string | null; rework: string | null;
};
export function caseText(r: CaseTextSource): string {
  const spec = [
    r.type, r.size, r.paper ?? '用紙未指定', r.color, `${r.qty.toLocaleString('ja-JP')}部`,
    r.finishing.length ? `加工 ${r.finishing.join('・')}` : '加工なし', r.dataState, r.reuse,
  ].join(' / ');
  const parts = [`${r.name}。${spec}。`];
  if (r.note) parts.push(`メモ: ${r.note.replace(/。$/, '')}。`);
  if (r.rework) parts.push(`過去の手戻り: ${r.rework.replace(/。$/, '')}。`);
  return parts.join(' ');
}
