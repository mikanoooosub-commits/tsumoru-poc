// 見積の叩き台(金額・内訳・価格根拠の説明)。計算はしない。scoring.ts の buildDraft の値を表示するだけ
import { yen, unitOf } from '@/lib/scoring';
import { Kari, codeOf, WEAK_PCT } from './ui';
import type { Result, Explain } from './types';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;

export default function DraftPanel({ res, ex }: { res: Result; ex: Explain }) {
  const draft = res.draft;
  if (!draft) return null;
  const { topPct, best, bestGap, sameType, weak } = ex;
  return (
    <section className="draft" aria-labelledby="h-draft">
      <h2 id="h-draft">見積の叩き台</h2>
      {weak && (
        <p className="weak" id="weak-note"><b>▲ 根拠が弱い叩き台です。</b>
          {!sameType && '同じ種類の過去案件が無いため、別の種類の案件から出しています。'}
          {topPct < WEAK_PCT && `いちばん似た過去案件でも類似度 ${topPct}% です。`}
          金額は参考程度の目安です。条件の近い過去見積を登録すると、根拠が強くなります。</p>
      )}
      <div className="big">{yen(draft.amount)} <span className="chip">税抜・概算</span></div>
      <div className="uchiwake">
        {draft.dtpH > 0
          ? <>内訳: 刷り代 {yen(draft.suri)} ＋ 組版 {yen(draft.kumihan)}（DTP {draft.dtpH.toFixed(1)}h・<Kari />）</>
          : <>内訳: 刷り代のみ(支給データが完全なので組版は ¥0)</>}
      </div>
      <dl className="kv">
        <dt>推定単価(刷り代)</dt><dd>{draft.unitEst.toFixed(1)} 円/部 <span className="hint">(根拠の案件の単価 {draft.uMin.toFixed(1)}〜{draft.uMax.toFixed(1)} 円/部)</span></dd>
        <dt>数量</dt><dd>{res.q.qty.toLocaleString()} 部</dd>
        <dt>組版(DTP)</dt><dd>{draft.dtpH > 0 ? <>+{draft.dtpH.toFixed(1)}h = {yen(draft.kumihan)}（支給データ={res.q.dataState}・<Kari />ルール）</> : '+0h（完全データ）'}</dd>
        <dt>想定粗利率</dt><dd>{draft.marginEst !== null ? `${draft.marginEst.toFixed(0)} %` : '—'} <span className="hint">(刷り代ベース・参考)</span></dd>
        <dt>推奨納期</dt><dd>約 {draft.leadEst} 営業日</dd>
        <dt>型・版代</dt><dd>{draft.katagata}</dd>
      </dl>
      <div className="basis">
        <b>価格根拠</b>
        <ul>
          <li><b>基準の単価</b>: {sameType ? '同じ種類の' : '別の種類の'}類似上位 {res.basis.length} 件({draft.basisIds.join(', ')})の単価 {res.basis.map((t) => unitOf(t.r).toFixed(1)).join('・')} 円/部 の<b>中央値 {draft.baseUnit.toFixed(1)}円/部</b>。1件に合わせず真ん中の値を使い、高すぎる・安すぎる1件に引っ張られないようにしています。</li>
          <li><b>数量差の調整 {pct(draft.scalePct)}</b>(<Kari />ルール): 根拠の案件の数量(中央値 {Math.round(draft.baseQty).toLocaleString()}部)と今回の {res.q.qty.toLocaleString()}部 を比べ、部数が少ないほど1部あたりを高く、多いほど安くします。{draft.scaleClamped ? '調整は上下25%までで、今回は上限で止めています。' : '調整は上下25%までです。'}</li>
          {best && Math.abs(bestGap) >= 10 && (
            <li>いちばん似た {codeOf(best.r)}(類似度 {best.pct}%・単価 {unitOf(best.r).toFixed(1)}円/部)より、叩き台の単価は <b>{pct(bestGap)}</b> です。{codeOf(best.r)} の1件ではなく、上位 {res.basis.length} 件の中央値を基準にし、数量差を調整しているためです。</li>
          )}
        </ul>
        叩き台なので、特殊仕様・原価の変動・お客様の事情に合わせて金額を調整する前提です。
      </div>
    </section>
  );
}
