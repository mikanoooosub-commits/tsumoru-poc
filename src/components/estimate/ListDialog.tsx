// 過去見積の一覧・照会・削除のダイアログ。絞り込みは画面の側で全件を絞るだけ(DB には問い合わせない)
import type { FormState } from '@/app/actions';
import { type EstimateRow, yen } from '@/lib/scoring';
import { Msg, DeleteConfirm, codeOf } from './ui';

export default function ListDialog({
  listRef, estimates, filter, setFilter, listMsg, deletingId, setDeletingId, deleting, onDelete, onEdit, onOpenCreate,
}: {
  listRef: React.RefObject<HTMLDialogElement | null>;
  estimates: EstimateRow[];
  filter: string; setFilter: (v: string) => void;
  listMsg: FormState;
  deletingId: number | null; setDeletingId: (id: number | null) => void;
  deleting: boolean; onDelete: (id: number) => void;
  onEdit: (r: EstimateRow) => void;
  onOpenCreate: () => void;
}) {
  const filtered = estimates.filter((r) => {
    const q = filter.trim();
    if (!q) return true;
    return (`${r.name} ${r.type} ${r.size} ${codeOf(r)}`).includes(q);
  });
  return (
    <dialog ref={listRef} className="wide" aria-labelledby="h-list">
      <div className="dlg-body">
        <h2 id="h-list">過去見積の一覧・編集 <span className="hint">(全{estimates.length}件)</span></h2>
        <label className="field flush"><span className="lbl">絞り込み</span>
          <input type="text" value={filter} placeholder="案件名・種類・サイズ・番号" onChange={(e) => setFilter(e.target.value)} /></label>
        <Msg m={listMsg} />
        <div className="listwrap">
          {filtered.length ? filtered.map((r) => (
            <div className="lrow" key={r.id}>
              <div className="lmain">
                <b>{r.name}</b> <span className="hint">({codeOf(r)})</span>
                <div className="specs">{r.type} / {r.size} / {r.paper ?? '-'} / {r.color} / {r.qty.toLocaleString()}部 / {r.finishing.length ? r.finishing.join('・') : '加工なし'} … <span className="num">{yen(r.amount)}</span>{r.rework ? <span className="rw"> ／ ▲{r.rework}</span> : null}</div>
              </div>
              <div className="lact">
                {deletingId === r.id ? (
                  <DeleteConfirm label={codeOf(r)} deleting={deleting} onConfirm={() => onDelete(r.id)} onCancel={() => setDeletingId(null)} />
                ) : (
                  <>
                    <button type="button" className="btn text" onClick={() => onEdit(r)}>{codeOf(r)} を編集する</button>
                    <button type="button" className="btn text danger" onClick={() => setDeletingId(r.id)}>{codeOf(r)} を削除する</button>
                  </>
                )}
              </div>
            </div>
          )) : <p className="hint pad">「{filter}」に一致する案件はありません。番号(E-003 など)や種類でも絞り込めます。</p>}
        </div>
        <div className="dlg-foot between">
          <button type="button" className="btn secondary" onClick={onOpenCreate}>新規に登録する</button>
          <button type="button" className="btn secondary" onClick={() => listRef.current?.close()}>閉じる</button>
        </div>
      </div>
    </dialog>
  );
}
