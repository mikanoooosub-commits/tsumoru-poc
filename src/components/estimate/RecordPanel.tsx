// 確定金額の記録と、保存済みの記録の一覧。保存は EstimateTool の record()(Server Action)が行う
import type { FormState } from '@/app/actions';
import type { ToolRecord } from '@/db/queries';
import { yen } from '@/lib/scoring';
import { REASON_MAX } from '@/lib/input';
import { Msg, DeleteConfirm, selectOnFocus, onEnter } from './ui';
import type { Result } from './types';

export default function RecordPanel({
  res, resPaper, canRecord, recAmount, setRecAmount, recReason, setRecReason, recording, onRecord, recMsg,
  records, deletingId, setDeletingId, deleting, onDelete,
}: {
  res: Result | null; resPaper: string; canRecord: boolean;
  recAmount: string; setRecAmount: (v: string) => void; recReason: string; setRecReason: (v: string) => void;
  recording: boolean; onRecord: () => void; recMsg: FormState;
  records: ToolRecord[]; deletingId: number | null; setDeletingId: (id: number | null) => void;
  deleting: boolean; onDelete: (id: number) => void;
}) {
  return (
    <section className="card" aria-labelledby="h-rec">
      <h2 id="h-rec">確定金額の記録</h2>
      {canRecord && res?.draft ? (
        <p className="rec-target">記録先: {res.q.type} / {res.q.size} / {resPaper} / {res.q.color} / {res.q.qty.toLocaleString()}部 ・ 叩き台 <b className="num">{yen(res.draft.amount)}</b></p>
      ) : (
        <p className="rec-note" id="rec-why">
          {res ? '類似案件がなく叩き台が出ていないため、記録できません。' : '条件を入れて「叩き台を作る」を押すと、確定金額を記録できます。'}
        </p>
      )}
      <div className="rec-form">
        <label className="field"><span className="lbl">確定金額(円)</span>
          <input type="number" inputMode="numeric" min={1} value={recAmount} disabled={!canRecord} aria-describedby={canRecord ? undefined : 'rec-why'} placeholder="31000" {...selectOnFocus} onChange={(e) => setRecAmount(e.target.value)} onKeyDown={(e) => onEnter(e, onRecord)} /></label>
        <label className="field"><span className="lbl">補正理由 <span className="hint">(自由記述)</span></span>
          <input type="text" value={recReason} maxLength={REASON_MAX} disabled={!canRecord} aria-describedby={canRecord ? undefined : 'rec-why'} placeholder="特殊紙の歩留まりを見て上げた 等" onChange={(e) => setRecReason(e.target.value)} /></label>
        <button type="button" className="btn secondary" onClick={onRecord} disabled={!canRecord || recording}>{recording ? '記録中…' : '確定金額を記録する'}</button>
      </div>
      <Msg m={recMsg} />
      <h3 className="hist-hd">保存済みの記録{records.length > 0 && <span className="hint"> (新しい順・直近{records.length}件)</span>}</h3>
      {records.length === 0 ? (
        <p className="hint">まだ記録がありません。確定金額を記録すると、叩き台との差がここに残ります。</p>
      ) : records.map((h) => {
        const diff = h.draftAmount ? ((h.amount - h.draftAmount) / h.draftAmount) * 100 : null;
        const label = h.code ?? `#${h.id}`;
        return (
          <div className="hrow" key={h.id}>
            <div>{label} ・ 叩き台 <span className="num">{h.draftAmount !== null ? yen(h.draftAmount) : '-'}</span> → 確定 <span className="amt num">{yen(h.amount)}</span>
              {diff !== null && <span className="num">（{diff >= 0 ? '+' : ''}{diff.toFixed(1)}%）</span>}</div>
            <div className="why">理由: {h.reason || '(理由なし)'}</div>
            <div className="hrow-acts">
              {deletingId === h.id
                ? <DeleteConfirm label={label} deleting={deleting} onConfirm={() => onDelete(h.id)} onCancel={() => setDeletingId(null)} />
                : <button type="button" className="btn text danger" onClick={() => setDeletingId(h.id)}>{label} を削除する</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
