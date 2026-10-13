// 入力の厳密な解釈(サーバー側検証用。'use server' ファイルには非同期関数しか置けないため別ファイル)

export const INT4_MAX = 2147483647; // Postgres integer の上限(超えるとDBエラーになるため先に弾く)

// 数字だけの文字列を整数にする。`12abc` `1e3` ` -5` `''` は NaN(parseInt の緩さを避ける)
export function strictInt(raw: string): number {
  if (!/^\d+$/.test(raw)) return NaN;
  const v = Number(raw);
  return v <= INT4_MAX ? v : NaN;
}

// ILIKE の % _ \ をリテラルとして扱うためのエスケープ(Postgres の既定エスケープ文字は \)
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => '\\' + c);
}
