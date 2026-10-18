// 過去見積の一覧・照会・削除のダイアログ(画面の中央)。絞り込み・種類のボタンは画面の側で全件を絞るだけ(DB には問い合わせない)
import type { FormState } from '@/app/actions';
import { type EstimateRow, yen, unitOf } from '@/lib/scoring';
import { Msg, Kari, DeleteConfirm, codeOf } from './ui';
import { unit1 } from './format';

const ALL = '';

export default function ListDialog({
  listRef, filterRef, estimates, filter, setFilter, typeFilter, setTypeFilter, listMsg,
  deletingId, setDeletingId, deleting, onDelete, onEdit, onOpenCreate, onClose,
}: {
  listRef: React.RefObject<HTMLDialogElement | null>;
  filterRef: React.RefObject<HTMLInputElement | null>;
  estimates: EstimateRow[];
  filter: string; setFilter: (v: string) => void;
  typeFilter: string; setTypeFilter: (v: string) => void;
  listMsg: FormState;
  deletingId: number | null; setDeletingId: (id: number | null) => void;
  deleting: boolean; onDelete: (id: number) => void;
  onEdit: (r: EstimateRow) => void;
  onOpenCreate: () => void;
  onClose: () => void;
}) {
  // 種類ごとの件数(多い順。同数は登録の新しい順に出てきた順)
  const counts = new Map<string, number>();
  for (const r of estimates) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  const types = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const filtered = estimates.filter((r) => {
    if (typeFilter !== ALL && r.type !== typeFilter) return false;
    const q = filter.trim();
    if (!q) return true;
    return (`${r.name} ${r.type} ${r.size} ${codeOf(r)}`).includes(q);
  });
  const spec = (r: EstimateRow) => `${r.type} / ${r.size} / ${r.paper ?? '-'} / ${r.color} / ${r.qty.toLocaleString()}部 / ${r.finishing.length ? r.finishing.join('・') : '加工なし'} / ${r.dataState} / ${r.reuse}`;

  return (
    <dialog ref={listRef} className="dlg-list" aria-labelledby="h-list" onClose={onClose}>
      <div className="dlg-hd">
        <div className="dlg-row">
          <h2 id="h-list" className="dlg-title">過去見積の一覧・編集</h2>
          <span className="small"><Kari /> 合成データ・金額は例示</span>
          <span className="grow-sp" />
          <button type="button" className="btn primary" onClick={onOpenCreate}>＋ 過去見積を登録する</button>
          <button type="button" className="btn icon" aria-label="一覧を閉じる" onClick={() => listRef.current?.close()}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15" /></svg>
          </button>
        </div>
        <div className="dlg-row">
          <label className="fld grow-sp"><span className="lbl">絞り込み</span>
            <input ref={filterRef} className="inp" type="search" value={filter} placeholder="案件名・種類・サイズ・番号(E-003 など)" onChange={(e) => setFilter(e.target.value)} /></label>
          <p className="small" role="status"><b>{filtered.length}件</b> / 全{estimates.length}件 ・ 登録の新しい順 ・ ▲ は手戻りがあった案件</p>
        </div>
        <div className="flts" role="group" aria-label="種類で絞る">
          <button type="button" className="flt" aria-pressed={typeFilter === ALL} onClick={() => setTypeFilter(ALL)}>すべて<span className="n">{estimates.length}</span></button>
          {types.map(([t, n]) => (
            <button key={t} type="button" className="flt" aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>{t}<span className="n">{n}</span></button>
          ))}
        </div>
        <Msg m={listMsg} />
      </div>
      <div className="lrow lrow-hd" aria-hidden="true"><span className="no">番号</span><span className="nm">案件名・仕様</span><span className="amt r">見積金額</span><span className="up r">単価</span><span className="dl r">納期</span><span className="op" /></div>
      <div className="dlg-scroll">
        {filtered.length ? (
          <ul>
            {filtered.map((r) => (
              <li key={r.id} className={`lrow${deletingId === r.id ? ' del' : ''}`}>
                <b className="no">{codeOf(r)}</b>
                <div className="nm">
                  <p><span className="name">{r.name}</span> {r.rework && <span className="chip warn">▲ 手戻り</span>}</p>
                  <p className="small">{spec(r)}</p>
                  {r.rework && <p className="small rw">▲ {r.rework}</p>}
                </div>
                <b className="amt r num">{yen(r.amount)}</b>
                <span className="up r small">{unit1(unitOf(r))}円/部</span>
                <span className="dl r small">{r.leadDays ?? '-'}日</span>
                <span className="op">
                  {deletingId === r.id ? (
                    <DeleteConfirm label={codeOf(r)} deleting={deleting} onConfirm={() => onDelete(r.id)} onCancel={() => setDeletingId(null)} />
                  ) : (
                    <>
                      <button type="button" className="btn text" aria-label={`${codeOf(r)} を編集する`} onClick={() => onEdit(r)}>編集する</button>
                      <button type="button" className="btn text danger" aria-label={`${codeOf(r)} を削除する`} onClick={() => setDeletingId(r.id)}>削除する</button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mut list-empty">{filter.trim()
            ? `「${filter.trim()}」に一致する案件はありません。番号(E-003 など)や種類でも絞り込めます。`
            : 'この種類の案件はありません。'}</p>
        )}
      </div>
    </dialog>
  );
}
