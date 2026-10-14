// 入力の厳密な解釈(サーバー側検証用。'use server' ファイルには非同期関数しか置けないため別ファイル)
// 画面(EstimateTool)とサーバー(actions)で同じ上限・同じ判定を使うため、ここに集める。

export const INT4_MAX = 2147483647; // Postgres integer の上限(超えるとDBエラーになるため先に弾く)

// 数量の上限(F-03)。チラシの大口でも数十万部のため、桁の打ち間違い(99999999999 など)を叩き台に通さない
export const QTY_MAX = 1_000_000;

// 文字数の上限(F-11)。既存データは案件名15文字・メモ30文字程度。長い文字で画面幅が広がるのを防ぐ
export const NAME_MAX = 100;
export const MEMO_MAX = 200; // メモ・手戻り事由
export const REASON_MAX = 300; // 確定金額の補正理由

// 数字だけの文字列を整数にする。`12abc` `1e3` ` -5` `''` `1.5` は NaN(parseInt の緩さを避ける)
export function strictInt(raw: string): number {
  if (!/^\d+$/.test(raw)) return NaN;
  const v = Number(raw);
  return v <= INT4_MAX ? v : NaN;
}

// 数量(1〜QTY_MAX の整数)。画面の叩き台・登録・記録で共通に使う
export const QTY_ERROR = `数量は1〜${QTY_MAX.toLocaleString('ja-JP')}の整数で入力してください`;
export function parseQty(raw: string): number | null {
  const v = strictInt(raw.trim());
  return Number.isFinite(v) && v >= 1 && v <= QTY_MAX ? v : null;
}

// ILIKE の % _ \ をリテラルとして扱うためのエスケープ(Postgres の既定エスケープ文字は \)
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => '\\' + c);
}
