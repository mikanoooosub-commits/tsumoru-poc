// 過去のメモの検索(searchMemos・DB の部分一致)。検索は EstimateTool の onSearch() が行う
import { yen } from '@/lib/scoring';
import { codeOf, onEnter } from './ui';
import type { MemoRow } from './types';

export default function MemoSearch({ kw, setKw, onSearch, isSearching, searchRes, searchedKw, kwTried }: {
  kw: string; setKw: (v: string) => void; onSearch: () => void; isSearching: boolean;
  searchRes: MemoRow[] | null; searchedKw: string; kwTried: boolean;
}) {
  return (
    <section className="card" aria-labelledby="h-memo">
      <h2 id="h-memo">過去のメモを検索</h2>
      <div className="inline">
        <label className="field grow"><span className="lbl">検索する語</span>
          <input type="text" value={kw} placeholder="塗り足し / 色合わせ / 特色番号 / 型がずれた …" onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => onEnter(e, onSearch)} /></label>
        <button type="button" className="btn secondary" onClick={onSearch} disabled={isSearching}>{isSearching ? '検索中…' : 'メモを検索する'}</button>
      </div>
      {searchRes === null && searchedKw === '' && kwTried && <p className="hint">検索する語を入れると、メモ・手戻り事由・補正理由から探せます。</p>}
      {searchRes && (searchRes.length ? (
        <div>
          {searchRes.map((r) => <div className="sres" key={r.id}><b>{codeOf(r)} {r.name}</b> … {r.source === 'tool'
            ? <>確定 <span className="num">{yen(r.amount)}</span>{r.draftAmount !== null ? <>(叩き台 <span className="num">{yen(r.draftAmount)}</span>)</> : ''} … 補正理由: {r.reason} <span className="chip">つもる記録</span></>
            : (r.rework || r.note || r.reason)}</div>)}
          <p className="hint">属性が違っても、見積のときに確認すべき理由が近い案件を探せます(部分一致の検索)。</p>
        </div>
      ) : <p className="hint">「{searchedKw}」に一致するメモ・手戻り事由は見つかりませんでした。</p>)}
    </section>
  );
}
