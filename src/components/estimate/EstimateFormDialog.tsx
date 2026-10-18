// 過去見積の登録/編集ダイアログ。送信は EstimateTool の onSubmit(saveEstimate・Server Action)が行う。
// 送る項目名(name 属性)は変えていない。エラーはサーバーが返す1つの文を、ダイアログの上に出す
import { useState } from 'react';
import type { FormState } from '@/app/actions';
import { type EstimateRow, yen, TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES } from '@/lib/scoring';
import { QTY_MAX, NAME_MAX, MEMO_MAX } from '@/lib/input';
import { Msg, Kari, BusyLabel, codeOf, selectOnFocus } from './ui';
import type { Paper } from './types';

type Preview = { name: string; type: string; size: string; paper: string; color: string; qty: string; amount: string };

// 「アーカイブに入る形」の見本(入力を読んで表示するだけ。保存の処理とは関係しない)
function ArchivePreview({ pv }: { pv: Preview }) {
  const qty = Number(pv.qty);
  const amount = Number(pv.amount);
  const ok = /^\d+$/.test(pv.qty) && /^\d+$/.test(pv.amount) && qty > 0 && amount > 0;
  return (
    <section className="preview" aria-label="アーカイブに入る形(入力に合わせて変わります)">
      <p className="pv-hd">アーカイブに入る形 <span className="mut">入力に合わせて変わります</span></p>
      <p className="pv-name">{pv.name.trim() || '(案件名)'}</p>
      <p className="small">{pv.type} / {pv.size} / {pv.paper} / {pv.color} / {/^\d+$/.test(pv.qty) ? `${qty.toLocaleString()}部` : '(数量)'}
        {' ・ '}{ok ? <><b>{yen(amount)}</b>(単価 {(amount / qty).toFixed(1)}円/部)</> : '(見積金額)'}</p>
    </section>
  );
}

function EstimateForm({ editing, saveMsg, saving, papers, defaultPaper, onSubmit, onClose }: {
  editing: EstimateRow | null; saveMsg: FormState; saving: boolean; papers: Paper[]; defaultPaper: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onClose: () => void;
}) {
  const [pv, setPv] = useState<Preview>({
    name: editing?.name ?? '', type: editing?.type ?? TYPES[0], size: editing?.size ?? SIZES[0],
    paper: editing?.paper ?? defaultPaper, color: editing?.color ?? COLORS[0],
    qty: editing ? String(editing.qty) : '', amount: editing ? String(editing.amount) : '',
  });
  function readPreview(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? '').trim();
    setPv({ name: g('name'), type: g('type'), size: g('size'), paper: g('paper'), color: g('color'), qty: g('qty'), amount: g('amount') });
  }
  const reuseDefault = editing?.reuse ?? REUSES[0];

  return (
    <form className="dlg-form" onSubmit={onSubmit} onChange={readPreview} noValidate>
      <div className="dlg-hd ink-zone">
        <div className="dlg-row">
          <h2 id="h-form" className="dlg-title">{editing ? `過去見積を編集する(${codeOf(editing)})` : '過去見積を登録する'}</h2>
          <span className="on-ink-note"><Kari /> 合成データ</span>
          <span className="grow-sp" />
          <button type="button" className="btn ghost icon" aria-label="閉じる" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15" /></svg>
          </button>
        </div>
        <ArchivePreview pv={pv} />
      </div>
      <div className="dlg-scroll">
        {saveMsg && <div className="form-sec"><Msg m={saveMsg} /></div>}
        {editing && <input type="hidden" name="id" defaultValue={editing.id} />}

        <section className="form-sec" aria-labelledby="fs-spec">
          <h3 id="fs-spec" className="sec">仕様 <span className="opt">加工のほかは必須</span></h3>
          <label className="fld"><span className="lbl">案件名 <span className="req">必須</span></span>
            <span className="help" id="f-name-help">例: サンプル商店 B4折込チラシ</span>
            <input className="inp" type="text" name="name" defaultValue={editing?.name ?? ''} maxLength={NAME_MAX} required aria-describedby="f-name-help" /></label>
          <div className="grid2">
            <label className="fld"><span className="lbl">種類 <span className="req">必須</span></span><select className="inp" name="type" defaultValue={editing?.type ?? TYPES[0]}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className="fld"><span className="lbl">サイズ <span className="req">必須</span></span><select className="inp" name="size" defaultValue={editing?.size ?? SIZES[0]}>{SIZES.map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className="fld"><span className="lbl">用紙 <span className="req">必須</span></span><select className="inp" name="paper" defaultValue={editing?.paper ?? defaultPaper}>{papers.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.family}）</option>)}</select></label>
            <label className="fld"><span className="lbl">色 <span className="req">必須</span></span><select className="inp" name="color" defaultValue={editing?.color ?? COLORS[0]}>{COLORS.map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <label className="fld"><span className="lbl">支給データの状態 <span className="req">必須</span></span><select className="inp" name="data_state" defaultValue={editing?.dataState ?? DATA_STATES[0]}>{DATA_STATES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <fieldset>
            <legend className="lbl">型・版・色の流用 <span className="req">必須</span></legend>
            <div className="seg">{REUSES.map((v) => (
              <label key={v}><input type="radio" name="reuse" value={v} defaultChecked={reuseDefault === v} />{v}</label>
            ))}</div>
          </fieldset>
          <fieldset>
            <legend className="lbl">加工 <span className="opt">あてはまるものだけ</span></legend>
            <div className="ck-grid">{FINS.map((v) => (<label className="ck" key={v}><input type="checkbox" name="finishing" value={v} defaultChecked={editing?.finishing?.includes(v) ?? false} />{v}</label>))}</div>
          </fieldset>
        </section>

        <section className="form-sec" aria-labelledby="fs-money">
          <h3 id="fs-money" className="sec">数量と金額</h3>
          <div className="grid2">
            <label className="fld"><span className="lbl">数量 <span className="req">必須</span></span>
              <span className="help" id="f-qty-help">例: 1000</span>
              <input className="inp" type="number" inputMode="numeric" name="qty" min={1} max={QTY_MAX} defaultValue={editing?.qty ?? ''} aria-describedby="f-qty-help" {...selectOnFocus} /></label>
            <label className="fld"><span className="lbl">納期 <span className="opt">営業日</span></span>
              <span className="help" id="f-lead-help">例: 5</span>
              <input className="inp" type="number" inputMode="numeric" name="lead_days" min={0} defaultValue={editing?.leadDays ?? ''} aria-describedby="f-lead-help" {...selectOnFocus} /></label>
            <label className="fld"><span className="lbl">見積金額(税抜) <span className="req">必須</span></span>
              <span className="help" id="f-amount-help">例: 12000</span>
              <input className="inp" type="number" inputMode="numeric" name="amount" min={1} defaultValue={editing?.amount ?? ''} aria-describedby="f-amount-help" {...selectOnFocus} /></label>
            <label className="fld"><span className="lbl">原価 <span className="req">必須</span></span>
              <span className="help" id="f-cost-help">例: 8000</span>
              <input className="inp" type="number" inputMode="numeric" name="cost" min={1} defaultValue={editing?.cost ?? ''} aria-describedby="f-cost-help" {...selectOnFocus} /></label>
          </div>
        </section>

        <section className="form-sec" aria-labelledby="fs-memo">
          <h3 id="fs-memo" className="sec">メモ <span className="opt">メモ検索の対象</span></h3>
          <label className="fld"><span className="lbl">メモ</span>
            <span className="help" id="f-note-help">例: 毎週リピート</span>
            <input className="inp" type="text" name="note" maxLength={MEMO_MAX} defaultValue={editing?.note ?? ''} aria-describedby="f-note-help" /></label>
          <label className="fld"><span className="lbl">手戻り事由 <span className="opt">あれば</span></span>
            <span className="help" id="f-rework-help">例: 特色番号の指定漏れで刷り直し</span>
            <input className="inp" type="text" name="rework" maxLength={MEMO_MAX} defaultValue={editing?.rework ?? ''} aria-describedby="f-rework-help" /></label>
        </section>
      </div>
      <div className="dlg-foot">
        <button type="button" className="btn" onClick={onClose}>閉じる</button>
        <button type="submit" className="btn primary" disabled={saving}>
          <BusyLabel busy={saving} busyText={editing ? '更新中…' : '登録中…'} text={editing ? '更新する' : '登録する'} />
        </button>
      </div>
    </form>
  );
}

export default function EstimateFormDialog({ dialogRef, formKey, editing, saveMsg, saving, papers, defaultPaper, onSubmit, onClose }: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  formKey: string;
  editing: EstimateRow | null;
  saveMsg: FormState;
  saving: boolean;
  papers: Paper[];
  defaultPaper: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <dialog ref={dialogRef} className="dlg-form-wrap" aria-labelledby="h-form" onClose={onClose}>
      {/* key を変えると中の入力と見本が初期化される(新規登録の成功後・別の行の編集) */}
      <EstimateForm key={formKey} editing={editing} saveMsg={saveMsg} saving={saving} papers={papers}
        defaultPaper={defaultPaper} onSubmit={onSubmit} onClose={() => dialogRef.current?.close()} />
    </dialog>
  );
}
