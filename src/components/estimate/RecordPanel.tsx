// 確定金額の記録と、保存済みの記録の一覧。保存は EstimateTool の record()(Server Action)が行う。
// 叩き台を作る前も欄を出し、無効にして理由を書く(記録欄の常時表示・D60)
import type { FormState } from '@/app/actions';
import type { ToolRecord } from '@/db/queries';
import { yen } from '@/lib/scoring';
import { REASON_MAX } from '@/lib/input';
import { Msg, DeleteConfirm, BusyLabel, selectOnFocus, onEnter } from './ui';
import type { Result } from './types';

export default function RecordPanel({
  res, canRecord, recorded, standalone, showButton,
  recAmount, setRecAmount, recReason, setRecReason, recording, onRecord, recMsg, amountRef,
  records, histOpen, setHistOpen, deletingId, setDeletingId, deleting, onDelete,
}: {
  res: Result | null; canRecord: boolean;
  recorded: boolean;        // いまの叩き台を記録したか(札の表示)
  standalone: boolean;      // 叩き台の外に単独で置くか(スマホ・叩き台が無いとき)
  showButton: boolean;      // 欄の中に「記録する」ボタンを出すか(スマホで叩き台があるときは下の操作バーに出す)
  recAmount: string; setRecAmount: (v: string) => void; recReason: string; setRecReason: (v: string) => void;
  recording: boolean; onRecord: () => void; recMsg: FormState;
  amountRef: React.RefObject<HTMLInputElement | null>;
  records: ToolRecord[]; histOpen: boolean; setHistOpen: (v: boolean) => void;
  deletingId: number | null; setDeletingId: (id: number | null) => void;
  deleting: boolean; onDelete: (id: number) => void;
}) {
  const why = res ? '類似案件がなく叩き台が出ていないため、記録できません。' : '条件を入れて「叩き台を作る」を押すと、確定金額を記録できます。';
  const describe = (hintId: string) => (canRecord ? hintId : `rec-why ${hintId}`);

  return (
    <section className={`rec${standalone ? ' blk' : ''}`} aria-labelledby="h-rec" id="sec-rec">
      <div className="rec-hd">
        <h2 id="h-rec" className="rec-title">確定金額の記録</h2>
        {canRecord && (recorded
          ? <span className="chip ok">✓ 記録済み</span>
          : <span className="chip no">○ 未記録</span>)}
      </div>
      {!canRecord && <p className="rec-note" id="rec-why">{why}</p>}
      {canRecord && !showButton && <p className="mut">叩き台との差と理由を残します(下の「確定金額を記録する」で保存)</p>}

      <label className="fld"><span className="lbl">確定金額(円・税抜)</span>
        <span className="help" id="rec-amt-help">確定した金額を入れます。例: 13500</span>
        <input ref={amountRef} className="inp" type="number" inputMode="numeric" min={1} value={recAmount} disabled={!canRecord}
          aria-describedby={describe('rec-amt-help')} {...selectOnFocus}
          onChange={(e) => setRecAmount(e.target.value)} onKeyDown={(e) => onEnter(e, onRecord)} /></label>
      <label className="fld"><span className="lbl">補正理由 <span className="lbl-sub">自由記述</span></span>
        <span className="help" id="rec-reason-help">例: 特殊紙の歩留まりを見て上げた</span>
        <input className="inp" type="text" value={recReason} maxLength={REASON_MAX} disabled={!canRecord}
          aria-describedby={describe('rec-reason-help')} onChange={(e) => setRecReason(e.target.value)} /></label>
      {showButton && (
        <button type="button" className="btn outline block" onClick={onRecord} disabled={!canRecord || recording}>
          <BusyLabel busy={recording} busyText="記録中…" text="確定金額を記録する" />
        </button>
      )}
      <Msg m={recMsg} />

      {records.length === 0 ? (
        <p className="mut">保存済みの記録: まだありません。記録すると叩き台との差と理由が残ります。</p>
      ) : (
        <details className="fold hist" open={histOpen} onToggle={(e) => setHistOpen(e.currentTarget.open)}>
          <summary><span className="tw" aria-hidden="true">▸</span>保存済みの記録 {records.length}件<span className="mut">(新しい順・直近{records.length}件まで)</span></summary>
          {records.map((h) => {
            const diff = h.draftAmount ? ((h.amount - h.draftAmount) / h.draftAmount) * 100 : null;
            const label = h.code ?? `#${h.id}`;
            return (
              <div className="hrow" key={h.id}>
                <p>{label} ・ 叩き台 <span className="num">{h.draftAmount !== null ? yen(h.draftAmount) : '-'}</span> → 確定 <span className="amt num">{yen(h.amount)}</span>
                  {diff !== null && <span className="num">({diff >= 0 ? '+' : ''}{diff.toFixed(1)}%)</span>}</p>
                <p className="mut">理由: {h.reason || '(理由なし)'}</p>
                <div className="acts">
                  {deletingId === h.id
                    ? <DeleteConfirm label={label} deleting={deleting} onConfirm={() => onDelete(h.id)} onCancel={() => setDeletingId(null)} />
                    : <button type="button" className="btn text danger" onClick={() => setDeletingId(h.id)}>{label} を削除する</button>}
                </div>
              </div>
            );
          })}
        </details>
      )}
    </section>
  );
}
