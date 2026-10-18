// 見積の叩き台(金額 → 判定の帯 → 内訳|記録 → 単価の出し方)。計算はしない。scoring.ts の buildDraft の値を表示するだけ
import { yen, unitOf } from '@/lib/scoring';
import { Kari, codeOf, WEAK_PCT } from './ui';
import { unit1, unit4, signedPct } from './format';
import JudgeBand from './JudgeBand';
import type { Result, Explain } from './types';

export default function DraftPanel({ res, ex, condItems, recordSlot }: {
  res: Result;
  ex: Explain;
  condItems: { value: string; changed: boolean }[]; // 叩き台を出した条件(初期値から変えた所は強調)
  recordSlot: React.ReactNode;                       // PC では内訳の右に記録欄を置く(スマホは null)
}) {
  const draft = res.draft;
  if (!draft) return null;
  const { topPct, best, bestGap, sameType, weak } = ex;
  const n = res.basis.length;
  const baseQtyText = `${Math.round(draft.baseQty).toLocaleString()}部`;
  const qtyText = `${res.q.qty.toLocaleString()}部`;
  const qtyNote = res.q.qty === draft.baseQty
    ? `根拠の数量の中央値 ${baseQtyText}と今回は同じ`
    : `根拠の数量の中央値 ${baseQtyText}より今回 ${qtyText}は${res.q.qty < draft.baseQty ? '少ない' : '多い'}`;
  const clampWord = draft.scalePct > 0 ? '上限' : '下限';

  return (
    <section className="pane" aria-labelledby="h-draft" id="sec-draft">
      <div className="pane-hd">
        <h2 id="h-draft" className="pane-title" tabIndex={-1}>見積の叩き台</h2>
        <p className="cond-line">
          {condItems.map((c, i) => (
            <span key={i}>{i > 0 && ' / '}{c.changed ? <b className="changed">{c.value}</b> : c.value}</span>
          ))}
        </p>
      </div>
      <div className="pane-bd">
        {weak && (
          <p className="weak" id="weak-note" data-v="weak"><b>▲ 根拠が弱い叩き台です。</b>
            {!sameType && '同じ種類の過去案件が無いため、別の種類の案件から出しています。'}
            {topPct < WEAK_PCT && `いちばん似た過去案件でも類似度 ${topPct}% です。`}
            金額は参考程度の目安です。条件の近い過去見積を登録すると、根拠が強くなります。</p>
        )}
        <p className="amount-row"><span className="amount" data-v="amount">{yen(draft.amount)}</span><span className="chip no">税抜・概算</span></p>

        <JudgeBand hits={res.detect} />

        <div className="draft-in">
          <div>
            <table className="bd-table">
              <caption>内訳</caption>
              <tbody>
                <tr><th scope="row">刷り代</th><td><span data-v="unit">{unit4(draft.unitEst)} 円/部</span> × {res.q.qty.toLocaleString()}部</td><td className="r v" data-v="suri">{yen(draft.suri)}</td></tr>
                <tr><th scope="row">組版</th>
                  <td>{draft.dtpH > 0 ? <>+{draft.dtpH.toFixed(1)}h(DTP・支給データ={res.q.dataState}) <Kari /></> : '+0h(完全データ)'}</td>
                  <td className="r v" data-v="kumihan">{yen(draft.kumihan)}</td></tr>
                <tr><th scope="row">型・版代</th><td>{draft.katagata}</td><td className="r">—</td></tr>
                <tr className="total"><th scope="row">合計</th><td></td><td className="r v">{yen(draft.amount)}</td></tr>
              </tbody>
            </table>
            <p className="mut">単価は小数4桁まで表示。刷り代は丸める前の単価 × 部数の円未満を四捨五入しています(部数が多いと、表示の単価 × 部数と数円ずれることがあります)。</p>
          </div>
          {recordSlot && <div className="draft-rec">{recordSlot}</div>}
        </div>

        <details className="fold howto">
          <summary><span className="tw" aria-hidden="true">▸</span>単価の出し方と参考(想定粗利率・推奨納期)</summary>
          <div>
            <p>{sameType ? '同じ種類の' : '別の種類の'}根拠 {n}件の単価 {res.basis.map((t) => unit1(unitOf(t.r))).join('・')} 円/部({unit1(draft.uMin)}〜{unit1(draft.uMax)})の<b>中央値 {unit1(draft.baseUnit)}円/部</b>(1件に引っ張られないように真ん中を使う)
              → 数量差の調整 <b>{signedPct(draft.scalePct, 2)}</b> <Kari />({qtyNote}。上下25%まで{draft.scaleClamped ? `で、今回は${clampWord}で止めています` : ''})
              → <b>{unit4(draft.unitEst)}円/部</b></p>
            {best && Math.abs(bestGap) >= 10 && (
              <p>いちばん似た {codeOf(best.r)}(類似度 {best.pct}%・{unit1(unitOf(best.r))}円/部)より {signedPct(bestGap)}。1件ではなく上位 {n}件の中央値を基準にし、数量差を調整しているため</p>
            )}
            <p>想定粗利率 {draft.marginEst !== null ? `${draft.marginEst.toFixed(0)}%` : '—'}(刷り代ベース・参考) ・ 推奨納期 約 {draft.leadEst} 営業日</p>
            <p className="mut">叩き台なので、特殊仕様・原価の変動・お客様の事情に合わせて金額を調整する前提です。</p>
          </div>
        </details>
      </div>
    </section>
  );
}
