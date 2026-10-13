// 見積支援の計算ロジック(フレームワーク非依存)。現行 Poc.html から移植。
// DBの estimates(status=reference/confirmed)を母集団に、引合い条件との類似度で叩き台を作る。

export type EstimateRow = {
  id: number;
  code: string | null;
  name: string;
  type: string;
  size: string;
  paper: string | null;
  family: string | null; // papers.family を JOIN で取得
  color: string;
  qty: number;
  finishing: string[];
  dataState: string;
  reuse: string;
  amount: number;
  cost: number;
  rework: string | null;
  note: string | null;
  leadDays: number | null;
};

export type Query = {
  type: string;
  size: string;
  family: string;
  color: string;
  qty: number;
  finishing: string[];
  dataState: string;
  reuse: string;
};

export const MAXSCORE = 122; // 40+16+12+12+10+10+12+10
export const HOURLY = 2631; // 円/時(全印工連 令和6年度 一次)
const DTP: Record<string, number> = { '完全データ': 0, 'ラフ・要組版': 1.0, '手書き・要デザイン': 3.0 };

export const yen = (n: number) => '¥' + Math.round(n).toLocaleString();
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const jac = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 1;
};
export const unitOf = (r: EstimateRow) => r.amount / r.qty;
export const marginOf = (r: EstimateRow) => ((r.amount - r.cost) / r.amount) * 100;

export type Why = [string, number];
export type Scored = { r: EstimateRow; s: number; pct: number; why: Why[] };

export function score(q: Query, r: EstimateRow): { s: number; why: Why[] } {
  let s = 0;
  const why: Why[] = [];
  const eq = (k: string, cond: boolean, pts: number) => {
    if (cond) { s += pts; why.push([k, 1]); } else { why.push([k, 0]); }
  };
  eq('種類', q.type === r.type, 40);
  eq('サイズ', q.size === r.size, 12);
  eq('用紙系統', q.family === r.family, 10);
  eq('色', q.color === r.color, 10);
  const j = jac(q.finishing, r.finishing);
  s += 16 * j;
  why.push(['加工', j >= 0.999 ? 1 : j > 0 ? 0.5 : 0]);
  const qd = Math.abs(Math.log10(q.qty) - Math.log10(r.qty));
  const qp = Math.max(0, 1 - qd / 1.0);
  s += 12 * qp;
  why.push(['数量帯', qp >= 0.85 ? 1 : qp > 0 ? 0.5 : 0]);
  eq('支給データ', q.dataState === r.dataState, 12);
  eq('流用', q.reuse === r.reuse, 10);
  return { s: Math.round(s), why };
}

export function rank(q: Query, rows: EstimateRow[]): { top: Scored[]; basis: Scored[]; strong: Scored[] } {
  const ranked = rows
    .map((r) => {
      const sc = score(q, r);
      return { r, s: sc.s, why: sc.why, pct: Math.round((sc.s / MAXSCORE) * 100) };
    })
    .sort((a, b) => b.s - a.s);
  const top = ranked.slice(0, 4);
  const strong = top.filter((t) => t.s >= 45 && t.r.type === q.type); // 種類一致を必須に
  const basis = strong.length ? strong : top.slice(0, 3);
  return { top, basis, strong };
}

// ── 自動見積の対象外判定(5型・出典は sources.C2-b.md の各社公式一次) ──
export type DetectHit = { t: string; d: string; links: [string, string][] };
export function detect(q: Query): DetectHit[] {
  const hits: DetectHit[] = [];
  if (['特色1C', '特色2C', '前回色合わせ'].includes(q.color))
    hits.push({
      t: '① 特色指定',
      d: '自動入稿(ダイレクト/PDF/スマートチェック)非対応・スタッフ目視チェックのみ。片面2色まで／45kg用紙は不可／追加納期+2日／特色番号を別途指定',
      links: [
        ['グラフィック公式FAQ', 'https://www.graphic.jp/customer/faq/answer/101585'],
        ['グラフィック公式 特色', 'https://www.graphic.jp/options/print_ink/trait_ink'],
      ],
    });
  if (q.finishing.includes('型抜き') || q.finishing.includes('箔押し'))
    hits.push({
      t: '② 特殊加工(型抜き/箔押し)',
      d: '用紙厚/寸法制限・鋭角/小孔は製造不可・折加工併用は事前見積で形状確認',
      links: [['グラフィック公式 トムソン', 'https://www.graphic.jp/options/special/thomson']],
    });
  if (q.size === 'その他')
    hits.push({
      t: '③ 変形サイズ・規格外',
      d: '加工にトムソン/自由カットの候補が出ない商品は対応不可',
      links: [['グラフィック公式FAQ', 'https://www.graphic.jp/customer/faq/answer/100612']],
    });
  if (q.type === 'POP/販促')
    hits.push({
      t: '④ サイト掲載外の特注品',
      d: '自動見積の対象外→認定パートナーを紹介して個別見積',
      links: [['ラクスル公式 特注見積', 'https://raksul.com/contact/estimate/']],
    });
  if (q.dataState === 'ラフ・要組版' || q.dataState === '手書き・要デザイン')
    hits.push({
      t: '⑤ 入稿データ不備リスク',
      d: '塗り足し/フォント/RGB/形式不一致で再入稿・納期再計算(納期保証不可)',
      links: [['印刷会社公式 入稿注意', 'https://www.tcpc.co.jp/links/makeInfo']],
    });
  return hits;
}

// ── 見積の叩き台 ──
export type Draft = {
  amount: number;
  suri: number;
  kumihan: number;
  dtpH: number;
  unitEst: number;
  uMin: number;
  uMax: number;
  scalePct: number;
  marginEst: number;
  leadEst: number;
  baseUnit: number;
  basisIds: string[];
  katagata: string;
};
export function buildDraft(basis: Scored[], q: Query): Draft | null {
  if (!basis.length) return null;
  const units = basis.map((t) => unitOf(t.r));
  const baseUnit = median(units);
  const baseQty = median(basis.map((t) => t.r.qty));
  let scale = Math.pow(baseQty / q.qty, 0.15);
  scale = Math.min(1.25, Math.max(0.75, scale));
  const unitEst = baseUnit * scale;
  const suri = Math.round(unitEst * q.qty);
  const dtpH = DTP[q.dataState] ?? 0;
  const kumihan = Math.round(dtpH * HOURLY);
  const amount = suri + kumihan;
  return {
    amount,
    suri,
    kumihan,
    dtpH,
    unitEst,
    uMin: Math.min(...units),
    uMax: Math.max(...units),
    scalePct: (scale - 1) * 100,
    marginEst: median(basis.map((t) => marginOf(t.r))),
    leadEst: median(basis.map((t) => t.r.leadDays ?? 0)),
    baseUnit,
    basisIds: basis.map((t) => t.r.code ?? String(t.r.id)),
    katagata: q.reuse === '前回流用可' ? '¥0（既存型・版を流用）' : '別途（叩き台には含みません）',
  };
}

// ── 削減効果(仮) ──
export function savings() {
  const before = 30, after = 15;
  const saveMin = before - after;
  const perYear = (n: number) => Math.round((saveMin / 60) * HOURLY * n);
  return { before, after, saveMin, y1000: perYear(1000), y2000: perYear(2000), y3000: perYear(3000) };
}

// 選択肢(ENUMと一致)
export const TYPES = ['チラシ', 'リーフレット/パンフ', 'ポスター', '名刺', '封筒', '冊子/カタログ', 'パッケージ/紙器', 'シール/ラベル', 'DM', 'POP/販促'];
export const SIZES = ['A4', 'A3', 'A5', 'B4', 'B5', 'B2', '名刺', '長3', '角2', 'ハガキ', 'その他'];
export const COLORS = ['両面4C', '片面4C', '2C', '両面1C', '片面1C', '特色1C', '特色2C', '前回色合わせ'];
export const FINS = ['折り', '中綴じ', '無線綴じ', '型抜き', '箔押し', 'PP加工'];
export const DATA_STATES = ['完全データ', 'ラフ・要組版', '手書き・要デザイン'];
export const REUSES = ['新規', '前回流用可'];
