// 根拠にした過去案件(たためる)と、その手戻りの注意。scoring.ts の rank の結果を表示するだけ。
// 件数は今の計算で最大4件(過去見積が増えても、ここに並ぶ件数は増えない)
import { unitOf, type Scored } from '@/lib/scoring';
import { codeOf, fmtMargin } from './ui';
import { unit1, mismatchText } from './format';

export default function BasisList({ basis, notesRows, total, sameType, bestId, open, onToggle, openRows, onToggleRow }: {
  basis: Scored[];
  notesRows: Scored[];
  total: number;                 // 登録済みの過去見積の件数
  sameType: boolean;
  bestId: number | null;         // いちばん似た案件(印を付け、最初は開いておく)
  open: boolean;                 // 根拠の欄を開いているか(PC は最初から開く・スマホはたたむ)
  onToggle: (open: boolean) => void;
  openRows: Set<number>;         // 行ごとに開いている案件
  onToggleRow: (id: number) => void;
}) {
  if (basis.length === 0) {
    return <p className="pane empty">同種の類似案件が見つかりませんでした。</p>;
  }
  const spec = (t: Scored) => `${t.r.type} / ${t.r.size} / ${t.r.paper ?? '-'} / ${t.r.color} / ${t.r.qty.toLocaleString()}部 / ${t.r.finishing.length ? t.r.finishing.join('・') : '加工なし'} / ${t.r.dataState} / ${t.r.reuse}`;
  const gm = (t: Scored) => `${fmtMargin(t.r)} ・ ${t.r.leadDays ?? '-'}日`;

  return (
    <details className="pane fold basis" open={open} onToggle={(e) => onToggle(e.currentTarget.open)} id="sec-basis">
      <summary>
        <span className="tw small" aria-hidden="true">▸</span>
        <b className="small">根拠</b>
        <span className="small">過去見積 {total}件から条件の近い {basis.length}件{sameType ? '' : '(同じ種類が無いため別の種類)'}</span>
        <span className="chips">
          {basis.map((t) => <span key={t.r.id} className="chip ink">{codeOf(t.r)} {t.pct}%</span>)}
          {notesRows.length > 0 && <span className="chip warn">▲ 手戻り {notesRows.length}件</span>}
        </span>
        <span className="tog" aria-hidden="true">{open ? 'たたむ' : '開く'}</span>
      </summary>
      <div>
        <div className="brow brow-hd" aria-hidden="true"><span className="nm">案件</span><span className="sim">類似度</span><span className="up r">単価</span><span className="gm r">粗利・納期</span><span className="op" /></div>
        <ul>
          {basis.map((t) => {
            const rowOpen = openRows.has(t.r.id);
            const detailId = `basis-${t.r.id}`;
            return (
              <li key={t.r.id} className={`brow${t.r.id === bestId ? ' best' : ''}`} data-v="basis-row" data-code={codeOf(t.r)} data-pct={t.pct}>
                <p className="nm"><b className="code">{codeOf(t.r)}</b> <b className="name">{t.r.name}</b> {t.r.rework && <span className="chip warn">▲ 手戻り</span>}
                  {t.r.id === bestId && <span className="vh">(いちばん似た案件)</span>}</p>
                <div className="sim"><b className="val">{t.pct}%</b><div className="meter" aria-hidden="true"><i style={{ width: `${t.pct}%` }} /></div><span className="sp-only">・ <b className="val">{unit1(unitOf(t.r))}</b> 円/部</span></div>
                <b className="up r val">{unit1(unitOf(t.r))}<span className="unit-s"> 円/部</span></b>
                <span className="gm r small">{gm(t)}</span>
                <button type="button" className="btn op" aria-expanded={rowOpen} aria-controls={detailId} onClick={() => onToggleRow(t.r.id)}>{rowOpen ? '閉じる' : '開く'}</button>
                <div className="sp" id={detailId}>
                  <p className="small">{spec(t)}<span className="sp-only"> ・ 粗利 {fmtMargin(t.r)} ・ 納期 {t.r.leadDays ?? '-'}日</span>{rowOpen ? '' : ` ・ ${mismatchText(t.why)}`}</p>
                  {rowOpen && (
                    <p className="chips">{t.why.map(([k, v], i) => (
                      <span key={i} className={`chip ${v === 1 ? 'ok' : 'why-ng'}`}>{v === 1 ? '✓' : v > 0 ? '△' : '×'} {k}</span>
                    ))}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {notesRows.length > 0 && (
          <div className="notice">
            <h3>▲ この案件で注意すべき点(採用した同種の類似案件で発生した手戻り)</h3>
            <ul>{notesRows.map((t) => <li key={t.r.id} data-v="note-row" data-code={codeOf(t.r)}>{codeOf(t.r)} {t.r.name} … {t.r.rework}</li>)}</ul>
            <p>見積を出す前に、これらを先に確認すると、受注後の手戻りを防げます。</p>
          </div>
        )}
      </div>
    </details>
  );
}
