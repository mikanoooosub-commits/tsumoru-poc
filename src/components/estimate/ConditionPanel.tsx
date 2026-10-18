// 引合いの条件(左の紺の面)。値と状態は EstimateTool が持ち、ここは表示と入力の受け渡しだけ
import { TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES } from '@/lib/scoring';
import { QTY_MAX } from '@/lib/input';
import { Kari, selectOnFocus, onEnter } from './ui';
import type { Paper } from './types';

export type ConditionValues = {
  type: string; size: string; paper: string; color: string; qty: string; ds: string; reuse: string;
};
export type ConditionSetters = {
  setType: (v: string) => void; setSize: (v: string) => void; setPaper: (v: string) => void;
  setColor: (v: string) => void; setQty: (v: string) => void; setDs: (v: string) => void; setReuse: (v: string) => void;
};

// 仕組みと出典の説明(PC は条件パネルの下、スマホは画面のいちばん下)
export function Mechanism({ light = false }: { light?: boolean }) {
  return (
    <details className={`fold mech${light ? ' light' : ''}`}>
      <summary><span className="tw" aria-hidden="true">▸</span>仕組みと出典について</summary>
      <p>引合いの特徴を過去見積と重み付きで突き合わせ(満点122点→100%に直す)、同じ種類の類似上位から単価の中央値×数量の調整で叩き台を出す、説明できる方式です。ネット印刷で自動で完結しない条件(人の確認・個別見積が入る)の判定は、各社公式の入稿ガイド・仕様・FAQ に基づきます。データは登録済みの過去見積から取得しています。</p>
    </details>
  );
}

// 欄の名前の右に「初期値」か「変更」の札(F-21: 初期値を自分で選んだと誤解しないように)
function Mark({ changed }: { changed: boolean }) {
  return changed ? <span className="chg">変更</span> : <span className="init">初期値</span>;
}

export default function ConditionPanel({
  values, defaults, set, papers, qtyErr, finRef, finView, onFinChange, onRun,
  collapsed, onExpand, hasResult, summary, showMechanism,
}: {
  values: ConditionValues;
  defaults: ConditionValues;
  set: ConditionSetters;
  papers: Paper[];
  qtyErr: string;
  finRef: React.RefObject<HTMLFieldSetElement | null>;
  finView: string[];
  onFinChange: () => void;
  onRun: () => void;
  collapsed: boolean;        // スマホで叩き台を作った後は、条件を1行の要約にたたむ
  onExpand: () => void;
  hasResult: boolean;
  summary: React.ReactNode;  // たたんだときの条件の要約(叩き台を出した条件)
  showMechanism: boolean;
}) {
  const { type, size, paper, color, qty, ds, reuse } = values;
  const changed = {
    type: type !== defaults.type, size: size !== defaults.size, paper: paper !== defaults.paper,
    color: color !== defaults.color, qty: qty.trim() !== defaults.qty, ds: ds !== defaults.ds,
    reuse: reuse !== defaults.reuse, fin: finView.length > 0,
  };
  const nChanged = Object.values(changed).filter(Boolean).length;
  const cls = (c: boolean) => `inp${c ? ' changed' : ''}`;

  return (
    <aside className={`side ink-zone${collapsed ? ' is-collapsed' : ''}`} aria-labelledby="h-input" id="sec-cond">
      {/* スマホ: 手順(ページ内の移動)と、架空データの表示 */}
      <nav className="steps sp-only" aria-label="手順">
        <a href="#sec-cond" aria-current={hasResult ? undefined : 'step'} onClick={onExpand}>1 条件</a>
        <a href="#sec-draft" aria-current={hasResult ? 'step' : undefined}>2 叩き台と根拠</a>
        <a href="#sec-rec">3 記録</a>
      </nav>
      <p className="on-ink-note sp-only"><Kari /> 合成データ・金額は例示</p>

      <div className="side-hd">
        <h2 id="h-input" className="sec">引合いの条件 {nChanged > 0 && <span className="chip on-ink">変更 {nChanged}</span>}</h2>
        <p className="sub">対象: チラシ・DM・名刺・ポスター等の商業印刷</p>
      </div>

      {/* スマホで叩き台を作った後: 条件の要約と「変える」 */}
      <div className="cond-summary">
        <p><span className="k">条件:</span> {summary}</p>
        <button type="button" className="btn ghost" onClick={onExpand} aria-controls="cond-form" aria-expanded={!collapsed}>変える</button>
      </div>

      {/* 入力欄。たたんでも消さずに隠すだけ(加工のチェックは画面の状態を読むため・D71) */}
      <div className="cond-form" id="cond-form">
        <div className="grid2">
          <label className="fld"><span className="lbl">種類 <Mark changed={changed.type} /></span>
            <select className={cls(changed.type)} value={type} onChange={(e) => set.setType(e.target.value)}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="fld"><span className="lbl">サイズ <Mark changed={changed.size} /></span>
            <select className={cls(changed.size)} value={size} onChange={(e) => set.setSize(e.target.value)}>{SIZES.map((v) => <option key={v}>{v}</option>)}</select></label>
        </div>
        <label className="fld"><span className="lbl">用紙(系統で比べます) <Mark changed={changed.paper} /></span>
          <select className={cls(changed.paper)} value={paper} onChange={(e) => set.setPaper(e.target.value)}>{papers.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.family}）</option>)}</select></label>
        <div className="grid2">
          <label className="fld"><span className="lbl">色 <Mark changed={changed.color} /></span>
            <select className={cls(changed.color)} value={color} onChange={(e) => set.setColor(e.target.value)}>{COLORS.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="fld"><span className="lbl">数量(部) <Mark changed={changed.qty} /></span>
            <input className={cls(changed.qty)} type="number" inputMode="numeric" value={qty} min={1} max={QTY_MAX} step={100}
              aria-invalid={qtyErr ? true : undefined} aria-describedby={qtyErr ? 'qty-err' : undefined}
              {...selectOnFocus} onChange={(e) => set.setQty(e.target.value)} onKeyDown={(e) => onEnter(e, onRun)} /></label>
        </div>
        {qtyErr && <p className="msg ng" id="qty-err" role="alert" data-v="qty-err"><span aria-hidden="true">!</span><span>エラー: {qtyErr}</span></p>}
        <fieldset ref={finRef} onChange={onFinChange}>
          <legend className="lbl">加工 <span className="init">あてはまるものだけ</span></legend>
          <div className="ck-grid">{FINS.map((v) => (
            <label className="ck" key={v}><input type="checkbox" name="finishing" value={v} />{v}</label>
          ))}</div>
        </fieldset>
        <label className="fld"><span className="lbl">支給データ <Mark changed={changed.ds} /></span>
          <select className={cls(changed.ds)} value={ds} onChange={(e) => set.setDs(e.target.value)}>{DATA_STATES.map((v) => <option key={v}>{v}</option>)}</select></label>
        <fieldset>
          <legend className="lbl">型・版・色の流用 <Mark changed={changed.reuse} /></legend>
          <div className="seg">{REUSES.map((v) => (
            <label key={v}><input type="radio" name="cond-reuse" value={v} checked={reuse === v} onChange={() => set.setReuse(v)} />{v}</label>
          ))}</div>
        </fieldset>
        <button type="button" className="btn primary block" onClick={onRun}>類似案件を検索して叩き台を作る</button>
      </div>

      {showMechanism && <Mechanism />}
    </aside>
  );
}
