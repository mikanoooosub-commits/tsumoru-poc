// 根拠にした過去案件と、その手戻りの注意。scoring.ts の rank の結果を表示するだけ
import { unitOf, type Scored } from '@/lib/scoring';
import { codeOf, fmtMargin } from './ui';

export function NotesBox({ rows }: { rows: Scored[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="notice" aria-labelledby="h-notes">
      <b className="label" id="h-notes">▲ この案件で注意すべき点(採用した同種の類似案件で発生した手戻り)</b>
      <ul>{rows.map((t) => <li key={t.r.id}>{codeOf(t.r)} {t.r.name} … {t.r.rework}</li>)}</ul>
      <div className="after">見積を出す前に、これらを先に確認すると、受注後の手戻りを防げます。</div>
    </section>
  );
}

export default function BasisList({ basis }: { basis: Scored[] }) {
  return (
    <section className="card" aria-labelledby="h-basis">
      <h2 id="h-basis">根拠にした過去案件</h2>
      {basis.length ? basis.map((t) => (
        <div className="match" key={t.r.id}>
          <div className="top"><span className="nm">{t.r.name} <span className="hint">({codeOf(t.r)})</span></span><span className="score">類似度 {t.pct}%</span></div>
          <div className="bar" aria-hidden="true"><i style={{ width: `${t.pct}%` }} /></div>
          <div className="specs">{t.r.type} / {t.r.size} / {t.r.paper ?? '-'} / {t.r.color} / {t.r.qty.toLocaleString()}部 / {t.r.finishing.length ? t.r.finishing.join('・') : '加工なし'} / {t.r.dataState} / {t.r.reuse} … 単価 <b>{unitOf(t.r).toFixed(1)}円</b>・粗利 {fmtMargin(t.r)}・納期{t.r.leadDays ?? '-'}日{t.r.rework ? <><br /><span className="rw">▲手戻り: {t.r.rework}</span></> : null}</div>
          <div className="chips">{t.why.map(([k, v], i) => <span key={i} className={`chip ${v ? 'good' : 'no'}`}>{v ? '✓' : '×'} {k}</span>)}</div>
        </div>
      )) : <div className="placeholder">同種の類似案件が見つかりませんでした。</div>}
    </section>
  );
}
