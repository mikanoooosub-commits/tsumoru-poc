// 根拠にした過去案件(たためる)と、その手戻りの注意。scoring.ts の rank の結果を表示するだけ。
// 件数は今の計算で最大4件(過去見積が増えても、ここに並ぶ件数は増えない)
// 意味検索(WO-023)を使えたときは、行ごとに「条件の近さ(%)」と「文の意味(+点)」を分けて出し、
// 条件の点だけでは上位4件に入らなかった案件に「文で選ばれた」の札を付ける(どちらで引かれたかを説明できるように)
import { unitOf, MEANING_MAX, type Scored } from '@/lib/scoring';
import { codeOf, fmtMargin } from './ui';
import { unit1, mismatchText } from './format';
import type { SemanticState } from './types';

export default function BasisList({ basis, notesRows, total, sameType, bestId, open, onToggle, openRows, onToggleRow, sem }: {
  basis: Scored[];
  sem: SemanticState;            // 意味検索を使えたか(ok のときだけ「文の意味」を出す)
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
  const useSem = sem.kind === 'ok';
  const nByText = basis.filter((t) => t.byText).length;

  return (
    <details className={`pane fold basis${useSem ? ' sem-on' : ''}`} open={open} onToggle={(e) => onToggle(e.currentTarget.open)} id="sec-basis">
      <summary>
        <span className="tw small" aria-hidden="true">▸</span>
        <b className="small">根拠</b>
        <span className="small">{useSem
          ? <>過去見積 {total}件から、条件の近さと文の意味の近さ(AI の埋め込み・Voyage AI)で選んだ {basis.length}件</>
          : <>過去見積 {total}件から条件の近い {basis.length}件</>}{sameType ? '' : '(同じ種類が無いため別の種類)'}</span>
        <span className="chips">
          {basis.map((t) => <span key={t.r.id} className="chip ink">{codeOf(t.r)} {t.pct}%</span>)}
          {useSem && nByText > 0 && <span className="chip sem">文で選ばれた {nByText}件</span>}
          {notesRows.length > 0 && <span className="chip warn">▲ 手戻り {notesRows.length}件</span>}
        </span>
        <span className="tog" aria-hidden="true">{open ? 'たたむ' : '開く'}</span>
      </summary>
      <div>
        <div className="brow brow-hd" aria-hidden="true"><span className="nm">案件</span><span className="sim">{useSem ? '条件・文の意味' : '類似度'}</span><span className="up r">単価</span><span className="gm r">粗利・納期</span><span className="op" /></div>
        <ul>
          {basis.map((t) => {
            const rowOpen = openRows.has(t.r.id);
            const detailId = `basis-${t.r.id}`;
            return (
              <li key={t.r.id} className={`brow${t.r.id === bestId ? ' best' : ''}`} data-v="basis-row" data-code={codeOf(t.r)} data-pct={t.pct}>
                <p className="nm"><b className="code">{codeOf(t.r)}</b> <b className="name">{t.r.name}</b> {t.r.rework && <span className="chip warn">▲ 手戻り</span>}
                  {useSem && t.byText && <span className="chip sem">文で選ばれた</span>}
                  {t.r.id === bestId && <span className="vh">(いちばん似た案件)</span>}</p>
                <div className="sim">{useSem && <span className="sim-k">条件</span>}<b className="val">{t.pct}%</b><div className="meter" aria-hidden="true"><i style={{ width: `${t.pct}%` }} /></div>
                  {useSem && <span className="sem-pt" data-v="sem-pt" data-m={t.m}><span className="sim-k">文の意味</span> <b className="val">+{t.m}点</b><span className="vh">(最大{MEANING_MAX}点)</span></span>}<span className="sp-only">・ <b className="val">{unit1(unitOf(t.r))}</b> 円/部</span></div>
                <b className="up r val">{unit1(unitOf(t.r))}<span className="unit-s"> 円/部</span></b>
                <span className="gm r small">{gm(t)}</span>
                <button type="button" className="btn op" aria-expanded={rowOpen} aria-controls={detailId} onClick={() => onToggleRow(t.r.id)}>{rowOpen ? '閉じる' : '開く'}</button>
                <div className="sp" id={detailId}>
                  <p className="small">{spec(t)}<span className="sp-only"> ・ 粗利 {fmtMargin(t.r)} ・ 納期 {t.r.leadDays ?? '-'}日</span>{rowOpen ? '' : ` ・ ${mismatchText(t.why)}`}</p>
                  {rowOpen && (
                    <p className="chips">{t.why.map(([k, v], i) => (
                      <span key={i} className={`chip ${v === 1 ? 'ok' : 'why-ng'}`}>{v === 1 ? '✓' : v > 0 ? '△' : '×'} {k}</span>
                    ))}{useSem && <span className="chip sem">文の意味 +{t.m}点/{MEANING_MAX}点{t.sim !== null ? `(近さ ${t.sim.toFixed(2)}${sem.kind === 'ok' && sem.base !== null ? `・この文の基準 ${sem.base.toFixed(2)}` : ''})` : '(埋め込みなし)'}</span>}</p>
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
