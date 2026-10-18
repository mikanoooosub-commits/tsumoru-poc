// 過去のメモの検索(searchMemos・DB の部分一致=語句の一致)。最初はたたんでおく
import { yen } from '@/lib/scoring';
import { codeOf, onEnter, BusyLabel } from './ui';
import type { MemoRow } from './types';

export default function MemoSearch({ kw, setKw, onSearch, isSearching, searchRes, searchedKw, kwTried }: {
  kw: string; setKw: (v: string) => void; onSearch: () => void; isSearching: boolean;
  searchRes: MemoRow[] | null; searchedKw: string; kwTried: boolean;
}) {
  return (
    <details className="pane fold memo">
      <summary><span className="tw small" aria-hidden="true">▸</span><b className="small" id="h-memo">過去のメモを検索</b><span className="mut">メモ・手戻り事由・補正理由から、語句の一致で探します</span></summary>
      <div className="memo-bd">
        <div className="memo-form">
          <label className="fld"><span className="lbl">検索する語</span>
            <input className="inp" type="search" value={kw} placeholder="塗り足し / 色合わせ / 特色番号 …" onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => onEnter(e, onSearch)} /></label>
          <button type="button" className="btn outline" onClick={onSearch} disabled={isSearching}><BusyLabel busy={isSearching} busyText="検索中…" text="メモを検索する" /></button>
        </div>
        {searchRes === null && searchedKw === '' && kwTried && <p className="mut">検索する語を入れると、メモ・手戻り事由・補正理由から探せます。</p>}
        {searchRes && (searchRes.length ? (
          <div role="status">
            <p className="small"><b>「{searchedKw}」</b>に一致: {searchRes.length}件(メモ・手戻り事由・補正理由の部分一致)</p>
            {searchRes.map((r) => <p className="sres" key={r.id}><b>{codeOf(r)} {r.name}</b> … {r.source === 'tool'
              ? <>確定 <span className="num">{yen(r.amount)}</span>{r.draftAmount !== null ? <>(叩き台 <span className="num">{yen(r.draftAmount)}</span>)</> : ''} … 補正理由: {r.reason} <span className="chip">つもる記録</span></>
              : (r.rework || r.note || r.reason)}</p>)}
            <p className="mut">属性が違っても、見積のときに確認すべき理由が近い案件を探せます。</p>
          </div>
        ) : <p className="mut" role="status">「{searchedKw}」に一致するメモ・手戻り事由は見つかりませんでした。</p>)}
      </div>
    </details>
  );
}
