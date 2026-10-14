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
export const HOURLY = 2610; // 円/時(全印工連 令和7年度 全国集計編: 4,967千円÷1,901時間17分=2,612円を10円単位に丸め)
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
// 粗利率(%)。金額0円の行は割り算ができないので null(画面では「—」。F-04 の「NaN %」を防ぐ)
export const marginOf = (r: EstimateRow): number | null => (r.amount > 0 ? ((r.amount - r.cost) / r.amount) * 100 : null);

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

// ── ネット印刷で自動で完結しない条件の判定(5型・出典は sources.C2-b.md の各社公式一次) ──
// 文言は出典どおりの強さにする(WO-017・D71)。特色・型抜きは注文でき価格も出るので「対象外」とは書かない
export type DetectHit = { t: string; d: string; note?: string; links: [string, string][] };
export function detect(q: Query): DetectHit[] {
  const hits: DetectHit[] = [];
  if (['特色1C', '特色2C', '前回色合わせ'].includes(q.color))
    hits.push({
      t: '① 特色指定',
      d: '注文はでき、価格も出ます。ただし自動入稿(ダイレクト/PDF/スマートチェック)には対応しておらず、スタッフの目視チェックで入稿します。片面2色まで／45kg用紙は不可／追加納期+2日／特色番号を別途指定',
      links: [
        ['グラフィック公式FAQ', 'https://www.graphic.jp/customer/faq/answer/101585'],
        ['グラフィック公式 特色', 'https://www.graphic.jp/options/print_ink/trait_ink'],
      ],
    });
  // 箔押しは入れない: 箔押し名刺はネット印刷の料金表から注文できる(D59・BLIND-FC BF-13)。型抜きだけを判定する
  // 型抜きは料金表から注文できる。事前見積と明記されているのは折り加工との併用だけなので、折りも選ばれたときだけ note で示す
  if (q.finishing.includes('型抜き')) {
    const withFold = q.finishing.includes('折り');
    hits.push({
      t: withFold ? '② 特殊加工(型抜き+折り)' : '② 特殊加工(型抜き)',
      d: '料金表から注文できますが、入稿はスタッフのチェックだけです。用紙(110kg以上)・寸法(A7〜B2)・形状(鋭角・小さい孔などは不可)・納期(最短2日〜)に制限があります。折り加工と併用すると、事前見積で形状を確かめます',
      note: withFold ? '今回は折りも選ばれているので、事前見積になります。' : undefined,
      links: [['グラフィック公式 トムソン', 'https://www.graphic.jp/options/special/thomson']],
    });
  }
  if (q.size === 'その他')
    hits.push({
      t: '③ 変形サイズ・規格外',
      d: '対応する商品なら追加料金なしで注文できますが、加工にトムソン/自由カットの候補が出ない商品は対応していません',
      links: [['グラフィック公式FAQ', 'https://www.graphic.jp/customer/faq/answer/100612']],
    });
  if (q.type === 'POP/販促')
    hits.push({
      t: '④ サイト掲載外の特注品',
      d: 'サイトに無い仕様は自動見積の対象外です。「特注品・見積もりサービス」で認定パートナーを紹介し、個別に見積ります',
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
  marginEst: number | null;
  leadEst: number;
  baseUnit: number;
  baseQty: number; // 根拠にした案件の数量の中央値(数量差の調整の基準。画面の説明用)
  scaleClamped: boolean; // 数量差の調整が上限・下限(±25%)で止まったか(画面の説明用)
  basisIds: string[];
  katagata: string;
};
export function buildDraft(basis: Scored[], q: Query): Draft | null {
  if (!basis.length) return null;
  const units = basis.map((t) => unitOf(t.r));
  const baseUnit = median(units);
  const baseQty = median(basis.map((t) => t.r.qty));
  const scaleRaw = Math.pow(baseQty / q.qty, 0.15);
  const scale = Math.min(1.25, Math.max(0.75, scaleRaw));
  const unitEst = baseUnit * scale;
  const suri = Math.round(unitEst * q.qty);
  const dtpH = DTP[q.dataState] ?? 0;
  const kumihan = Math.round(dtpH * HOURLY);
  const amount = suri + kumihan;
  const margins = basis.map((t) => marginOf(t.r)).filter((m): m is number => m !== null);
  return {
    amount,
    suri,
    kumihan,
    dtpH,
    unitEst,
    uMin: Math.min(...units),
    uMax: Math.max(...units),
    scalePct: (scale - 1) * 100,
    marginEst: margins.length ? median(margins) : null,
    leadEst: median(basis.map((t) => t.r.leadDays ?? 0)),
    baseUnit,
    baseQty,
    scaleClamped: scale !== scaleRaw,
    basisIds: basis.map((t) => t.r.code ?? String(t.r.id)),
    katagata: q.reuse === '前回流用可' ? '¥0（既存型・版を流用）' : '別途（叩き台には含みません）',
  };
}

// 選択肢(ENUMと一致)
export const TYPES = ['チラシ', 'リーフレット/パンフ', 'ポスター', '名刺', '封筒', '冊子/カタログ', 'パッケージ/紙器', 'シール/ラベル', 'DM', 'POP/販促'];
export const SIZES = ['A4', 'A3', 'A5', 'B4', 'B5', 'B2', '名刺', '長3', '角2', 'ハガキ', 'その他'];
export const COLORS = ['両面4C', '片面4C', '2C', '両面1C', '片面1C', '特色1C', '特色2C', '前回色合わせ'];
export const FINS = ['折り', '中綴じ', '無線綴じ', '型抜き', '箔押し', 'PP加工'];
export const DATA_STATES = ['完全データ', 'ラフ・要組版', '手書き・要デザイン'];
export const REUSES = ['新規', '前回流用可'];
