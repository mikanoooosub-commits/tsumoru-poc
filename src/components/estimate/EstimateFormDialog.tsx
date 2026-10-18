// 過去見積の登録/編集ダイアログ。送信は EstimateTool の onSubmit(saveEstimate・Server Action)が行う
import type { FormState } from '@/app/actions';
import { type EstimateRow, TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES } from '@/lib/scoring';
import { QTY_MAX, NAME_MAX, MEMO_MAX } from '@/lib/input';
import { Msg, codeOf, selectOnFocus } from './ui';
import type { Paper } from './types';

export default function EstimateFormDialog({ dialogRef, formKey, editing, saveMsg, saving, papers, defaultPaper, onSubmit }: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  formKey: string;
  editing: EstimateRow | null;
  saveMsg: FormState;
  saving: boolean;
  papers: Paper[];
  defaultPaper: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <dialog ref={dialogRef} aria-labelledby="h-form">
      <form key={formKey} onSubmit={onSubmit} noValidate>
        <div className="dlg-body">
          <h2 id="h-form">{editing ? `過去見積を編集する（${codeOf(editing)}）` : '過去見積を登録する'}</h2>
          <Msg m={saveMsg} />
          {editing && <input type="hidden" name="id" defaultValue={editing.id} />}
          <label className="field"><span className="lbl">案件名 <span className="req">必須</span></span>
            <input type="text" name="name" defaultValue={editing?.name ?? ''} maxLength={NAME_MAX} placeholder="例: 〇〇スーパー B4折込チラシ" required /></label>
          <div className="row2">
            <label className="field"><span className="lbl">種類 <span className="req">必須</span></span><select name="type" defaultValue={editing?.type ?? TYPES[0]}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className="field"><span className="lbl">サイズ <span className="req">必須</span></span><select name="size" defaultValue={editing?.size ?? SIZES[0]}>{SIZES.map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <div className="row2">
            <label className="field"><span className="lbl">用紙 <span className="req">必須</span></span><select name="paper" defaultValue={editing?.paper ?? defaultPaper}>{papers.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.family}）</option>)}</select></label>
            <label className="field"><span className="lbl">色 <span className="req">必須</span></span><select name="color" defaultValue={editing?.color ?? COLORS[0]}>{COLORS.map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <div className="row2">
            <label className="field"><span className="lbl">数量 <span className="req">必須</span></span><input type="number" inputMode="numeric" name="qty" min={1} max={QTY_MAX} defaultValue={editing?.qty ?? ''} placeholder="例: 1000" {...selectOnFocus} /></label>
            <label className="field"><span className="lbl">納期(営業日)</span><input type="number" inputMode="numeric" name="lead_days" min={0} defaultValue={editing?.leadDays ?? ''} placeholder="例: 5" {...selectOnFocus} /></label>
          </div>
          <div className="row2">
            <label className="field"><span className="lbl">見積金額(税抜) <span className="req">必須</span></span><input type="number" inputMode="numeric" name="amount" min={1} defaultValue={editing?.amount ?? ''} placeholder="例: 12000" {...selectOnFocus} /></label>
            <label className="field"><span className="lbl">原価 <span className="req">必須</span></span><input type="number" inputMode="numeric" name="cost" min={1} defaultValue={editing?.cost ?? ''} placeholder="例: 8000" {...selectOnFocus} /></label>
          </div>
          <div className="row2">
            <label className="field"><span className="lbl">支給データの状態 <span className="req">必須</span></span><select name="data_state" defaultValue={editing?.dataState ?? DATA_STATES[0]}>{DATA_STATES.map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className="field"><span className="lbl">型・版・色の流用 <span className="req">必須</span></span><select name="reuse" defaultValue={editing?.reuse ?? REUSES[0]}>{REUSES.map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <fieldset>
            <legend>加工</legend>
            <div className="checks">{FINS.map((v) => (<label className="check" key={v}><input type="checkbox" name="finishing" value={v} defaultChecked={editing?.finishing?.includes(v) ?? false} />{v}</label>))}</div>
          </fieldset>
          <label className="field"><span className="lbl">メモ <span className="hint">(検索の対象)</span></span>
            <input type="text" name="note" maxLength={MEMO_MAX} defaultValue={editing?.note ?? ''} placeholder="毎週リピート 等" /></label>
          <label className="field"><span className="lbl">手戻り事由 <span className="hint">(あれば。検索の対象)</span></span>
            <input type="text" name="rework" maxLength={MEMO_MAX} defaultValue={editing?.rework ?? ''} placeholder="特色番号の指定漏れで刷り直し 等" /></label>
          <div className="dlg-foot">
            <button type="button" className="btn secondary" onClick={() => dialogRef.current?.close()}>閉じる</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? (editing ? '更新中…' : '登録中…') : (editing ? '更新する' : '登録する')}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
