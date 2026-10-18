// 表示用の整形だけ(計算はしない。値は scoring.ts が出したものをそのまま桁だけ整える)
import type { Why } from '@/lib/scoring';

// 叩き台の単価は小数4桁で出す(D86)。刷り代は丸める前の単価 × 部数を円未満で四捨五入しているため、
// 4桁あれば数千部までは「表示の単価 × 部数」と刷り代が一致する。部数が多いと数円ずれることがあり、注記で説明する
export const unit4 = (n: number) => n.toFixed(4);
// 根拠の案件の単価は今までどおり小数1桁
export const unit1 = (n: number) => n.toFixed(1);
// 符号つきの %(数量差の調整は小数2桁、叩き台との差は整数)
export const signedPct = (n: number, digits = 0) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}%`;

// 「一致しなかった項目」の文。why の 0 は不一致、0.5 は一部だけ一致(加工・数量帯)
export function mismatchText(why: Why[]): string {
  const ng = why.filter(([, v]) => v === 0).map(([k]) => k);
  const part = why.filter(([, v]) => v === 0.5).map(([k]) => k);
  const partText = part.length ? `(${part.join('・')}は一部)` : '';
  return `一致しなかった項目: ${ng.length ? ng.join('・') : 'なし'}${partText}`;
}
