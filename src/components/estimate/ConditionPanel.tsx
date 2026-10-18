// 引合いの条件(入力)。値と状態は EstimateTool が持ち、ここは表示と入力の受け渡しだけ
import { TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES } from '@/lib/scoring';
import { QTY_MAX } from '@/lib/input';
import { selectOnFocus, onEnter } from './ui';
import type { Paper } from './types';

export type ConditionValues = {
  type: string; size: string; paper: string; color: string; qty: string; ds: string; reuse: string;
};
export type ConditionSetters = {
  setType: (v: string) => void; setSize: (v: string) => void; setPaper: (v: string) => void;
  setColor: (v: string) => void; setQty: (v: string) => void; setDs: (v: string) => void; setReuse: (v: string) => void;
};

export default function ConditionPanel({ values, set, papers, qtyErr, finRef, onRun, onOpenCreate, onOpenList }: {
  values: ConditionValues;
  set: ConditionSetters;
  papers: Paper[];
  qtyErr: string;
  finRef: React.RefObject<HTMLFieldSetElement | null>;
  onRun: () => void;
  onOpenCreate: () => void;
  onOpenList: () => void;
}) {
  const { type, size, paper, color, qty, ds, reuse } = values;
  return (
    <section className="card" aria-labelledby="h-input">
      <h2 id="h-input">引合いの条件</h2>
      <label className="field"><span className="lbl">種類</span>
        <select value={type} onChange={(e) => set.setType(e.target.value)}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="field"><span className="lbl">サイズ</span>
        <select value={size} onChange={(e) => set.setSize(e.target.value)}>{SIZES.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="field"><span className="lbl">用紙 <span className="hint">(系統でスコア)</span></span>
        <select value={paper} onChange={(e) => set.setPaper(e.target.value)}>{papers.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.family}）</option>)}</select></label>
      <label className="field"><span className="lbl">色</span>
        <select value={color} onChange={(e) => set.setColor(e.target.value)}>{COLORS.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="field"><span className="lbl">数量(部・枚)</span>
        <input type="number" inputMode="numeric" value={qty} min={1} max={QTY_MAX} step={100}
          aria-invalid={qtyErr ? true : undefined} aria-describedby={qtyErr ? 'qty-err' : undefined}
          {...selectOnFocus} onChange={(e) => set.setQty(e.target.value)} onKeyDown={(e) => onEnter(e, onRun)} /></label>
      {qtyErr && <p className="msg ng" id="qty-err" role="alert"><span aria-hidden="true">!</span><span>エラー: {qtyErr}</span></p>}
      <fieldset ref={finRef}>
        <legend>加工</legend>
        <div className="checks">{FINS.map((v) => (
          <label className="check" key={v}><input type="checkbox" name="finishing" value={v} />{v}</label>
        ))}</div>
      </fieldset>
      <label className="field"><span className="lbl">支給データの状態 <span className="hint">(データがそのまま使えるか)</span></span>
        <select value={ds} onChange={(e) => set.setDs(e.target.value)}>{DATA_STATES.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="field"><span className="lbl">型・版・色の流用 <span className="hint">(地場の自社資産)</span></span>
        <select value={reuse} onChange={(e) => set.setReuse(e.target.value)}>{REUSES.map((v) => <option key={v}>{v}</option>)}</select></label>
      <button type="button" className="btn primary block" onClick={onRun}>類似案件を検索して叩き台を作る</button>
      <div className="btn-row">
        <button type="button" className="btn secondary" onClick={onOpenCreate}>過去見積を登録する</button>
        <button type="button" className="btn secondary" onClick={onOpenList}>過去見積の一覧・編集</button>
      </div>
    </section>
  );
}
