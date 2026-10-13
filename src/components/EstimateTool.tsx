'use client';

import { useRef, useState, useTransition } from 'react';
import {
  type EstimateRow, type Query, type Scored, type DetectHit,
  rank, detect, buildDraft, savings, yen, unitOf, marginOf,
  TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES,
} from '@/lib/scoring';
import { saveEstimate, deleteEstimate, searchMemos, recordFinalAmount, type FormState } from '@/app/actions';
import type { ToolRecord } from '@/db/queries';

type Paper = { name: string; family: string };
type MemoRow = {
  id: number; code: string | null; name: string; rework: string | null; note: string | null;
  reason: string | null; source: string; amount: number; draftAmount: number | null;
};

// 用紙の既定(ISSUE-P-011): チラシ既定条件に合う一般的な用紙。辞書に無ければ先頭にフォールバック
const DEFAULT_PAPER = 'コート90';

const codeOf = (r: { code: string | null; id: number }) => r.code ?? `#${r.id}`;

// 「仮」の印(design-tokens §2.5)。色だけでなく字で示す
const Kari = () => <span className="kari">仮</span>;

// 結果メッセージ(記号+文字。成功は status、失敗は alert として読み上げられる)
function Msg({ m }: { m: FormState }) {
  if (!m) return null;
  return (
    <p className={`msg ${m.ok ? 'ok' : 'ng'}`} role={m.ok ? 'status' : 'alert'}>
      <span aria-hidden="true">{m.ok ? '✓' : '!'}</span>
      <span>{m.ok ? '' : 'エラー: '}{m.message}</span>
    </p>
  );
}

export default function EstimateTool({ estimates, papers, records }: { estimates: EstimateRow[]; papers: Paper[]; records: ToolRecord[] }) {
  const paperFamily = new Map(papers.map((p) => [p.name, p.family]));
  const paperNames = papers.map((p) => p.name);
  const defaultPaper = paperNames.includes(DEFAULT_PAPER) ? DEFAULT_PAPER : (paperNames[0] ?? '');

  // ── 入力 ──
  const [type, setType] = useState(TYPES[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [paper, setPaper] = useState(defaultPaper);
  const [color, setColor] = useState(COLORS[0]);
  const [qty, setQty] = useState('3000');
  const [fin, setFin] = useState<string[]>([]);
  const [ds, setDs] = useState(DATA_STATES[0]);
  const [reuse, setReuse] = useState(REUSES[0]);
  const toggleFin = (v: string) => setFin((f) => (f.includes(v) ? f.filter((x) => x !== v) : [...f, v]));

  const [resPaper, setResPaper] = useState(''); // 叩き台を出した時点の用紙名(記録時に送る)
  const [res, setRes] = useState<null | { q: Query; detect: DetectHit[]; basis: Scored[]; strong: Scored[]; draft: ReturnType<typeof buildDraft> }>(null);
  function run() {
    const q: Query = {
      type, size, family: paperFamily.get(paper) ?? '', color,
      qty: Math.max(1, parseInt(qty, 10) || 1), finishing: fin, dataState: ds, reuse,
    };
    const { basis, strong } = rank(q, estimates);
    setResPaper(paper);
    setRes({ q, detect: detect(q), basis, strong, draft: buildDraft(basis, q) });
  }

  // ── 登録/編集フォーム(Server Action・登録後も閉じずにメッセージ表示) ──
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<EstimateRow | null>(null); // null=新規登録 / row=編集
  const [saveMsg, setSaveMsg] = useState<FormState>(null);
  const [saving, startSave] = useTransition();
  const [newNonce, setNewNonce] = useState(0); // 新規フォームを初期化するための再マウントキー
  const formKey = editing ? `edit-${editing.id}` : `new-${newNonce}`;

  function openCreate() { setEditing(null); setSaveMsg(null); setNewNonce((n) => n + 1); dialogRef.current?.showModal(); }
  function openEdit(r: EstimateRow) { listRef.current?.close(); setEditing(r); setSaveMsg(null); dialogRef.current?.showModal(); }

  function onSaveSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const isEdit = !!editing;
    startSave(async () => {
      const r = await saveEstimate(null, fd);
      setSaveMsg(r);
      if (r?.ok && !isEdit) setNewNonce((n) => n + 1); // 新規登録が成功したら、次の入力用にフォームだけ初期化(画面は閉じない)
    });
  }

  // ── 一覧・照会・削除 ──
  const listRef = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, startDelete] = useTransition();
  const [listMsg, setListMsg] = useState<FormState>(null);
  const [recMsg, setRecMsg] = useState<FormState>(null);
  function openList() { setListMsg(null); setFilter(''); setDeletingId(null); listRef.current?.showModal(); }
  function doDelete(id: number, fromRecords = false) {
    startDelete(async () => {
      const r = await deleteEstimate(id);
      setDeletingId(null);
      if (fromRecords) setRecMsg(r); else setListMsg(r);
    });
  }
  const filtered = estimates.filter((r) => {
    const q = filter.trim();
    if (!q) return true;
    return (`${r.name} ${r.type} ${r.size} ${codeOf(r)}`).includes(q);
  });

  // 削除の確認(その場に出す。何を消すかを書き、動詞のボタンにする)
  const deleteConfirm = (id: number, label: string, fromRecords = false) => (
    <>
      <span className="confirm">{label} を削除しますか?</span>
      <button type="button" className="btn text danger" disabled={deleting} onClick={() => doDelete(id, fromRecords)}>{deleting ? '削除中…' : '削除する'}</button>
      <button type="button" className="btn text" onClick={() => setDeletingId(null)}>やめる</button>
    </>
  );

  // ── メモ検索(DBのILIKE) ──
  const [kw, setKw] = useState('');
  const [searchRes, setSearchRes] = useState<MemoRow[] | null>(null);
  const [isSearching, startSearch] = useTransition();
  const onSearch = () => startSearch(async () => setSearchRes(await searchMemos(kw)));

  // ── 確定金額の記録(DBに保存。ISSUE-P-005) ──
  // 送るのは検索時点の条件と確定金額・理由だけ。叩き台はサーバーが条件から再計算して保存する。
  const [recAmount, setRecAmount] = useState('');
  const [recReason, setRecReason] = useState('');
  const [recording, startRecord] = useTransition();
  const canRecord = !!res?.draft;
  function record() {
    if (!res || !res.draft) return;
    if (!/^\d+$/.test(recAmount.trim())) { setRecMsg({ ok: false, message: '確定金額は数字(円)で入力してください' }); return; }
    const amount = Number(recAmount.trim());
    startRecord(async () => {
      const r = await recordFinalAmount({
        type: res.q.type, size: res.q.size, paper: resPaper, color: res.q.color, qty: res.q.qty,
        finishing: res.q.finishing, dataState: res.q.dataState, reuse: res.q.reuse,
        amount, reason: recReason,
      });
      setRecMsg(r);
      if (r?.ok) { setRecAmount(''); setRecReason(''); }
    });
  }

  const sv = savings();
  const notesRows = res ? res.strong.filter((t) => t.r.rework) : [];

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2.6 L17 6.2 L10 9.8 L3 6.2 Z" />
              <path d="M3 10.2 L10 13.8 L17 10.2" />
              <path d="M3 13.9 L10 17.5 L17 13.9" />
            </svg>
          </span>
          <div>
            <h1>つもる</h1>
            <div className="tagline">過去案件から引く、見積の下書き</div>
          </div>
        </div>
        <div className="ctx">
          <span className="chip line"><Kari /> 合成データ・金額は例示</span>
          <span className="chip line">対象: チラシ・DM・名刺・ポスター等の定型</span>
          <span className="chip line">登録済み {estimates.length}件</span>
        </div>
      </header>

      <main className="grid">
        {/* 入力 */}
        <section className="card" aria-labelledby="h-input">
          <h2 id="h-input">引合いの条件</h2>
          <label className="field"><span className="lbl">種類</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="field"><span className="lbl">サイズ</span>
            <select value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="field"><span className="lbl">用紙 <span className="hint">(系統でスコア)</span></span>
            <select value={paper} onChange={(e) => setPaper(e.target.value)}>{papers.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.family}）</option>)}</select></label>
          <label className="field"><span className="lbl">色</span>
            <select value={color} onChange={(e) => setColor(e.target.value)}>{COLORS.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="field"><span className="lbl">数量(部・枚)</span>
            <input type="number" inputMode="numeric" value={qty} min={1} step={100} onChange={(e) => setQty(e.target.value)} /></label>
          <fieldset>
            <legend>加工</legend>
            <div className="checks">{FINS.map((v) => (
              <label className="check" key={v}><input type="checkbox" checked={fin.includes(v)} onChange={() => toggleFin(v)} />{v}</label>
            ))}</div>
          </fieldset>
          <label className="field"><span className="lbl">支給データの状態 <span className="hint">(データがそのまま使えるか)</span></span>
            <select value={ds} onChange={(e) => setDs(e.target.value)}>{DATA_STATES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="field"><span className="lbl">型・版・色の流用 <span className="hint">(地場の自社資産)</span></span>
            <select value={reuse} onChange={(e) => setReuse(e.target.value)}>{REUSES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <button type="button" className="btn primary block" onClick={run}>類似案件を検索して叩き台を作る</button>
          <div className="btn-row">
            <button type="button" className="btn secondary" onClick={openCreate}>過去見積を登録する</button>
            <button type="button" className="btn secondary" onClick={openList}>過去見積の一覧・編集</button>
          </div>
        </section>

        <div>
          {/* 結果 */}
          {!res ? (
            <div className="placeholder">左で条件を入れて「叩き台を作る」を押すと、判定・叩き台・類似案件がここに表示されます。</div>
          ) : (
            <div className="results">
              <div className="rescol">
                {/* 判定(対象外の5型に該当したときだけ表示。範囲内=定型は何も出さない) */}
                {res.detect.length > 0 && (
                  <section className="notice" aria-labelledby="h-detect">
                    <b className="label" id="h-detect">▲ この案件はネット印刷の自動見積の対象外に該当します</b>
                    <ul>{res.detect.map((h, i) => (
                      <li key={i}><b>{h.t}</b> … {h.d}<br />
                        <span className="src">{h.links.map(([label, url], j) => (
                          <span key={j}>{j > 0 ? ' ／ ' : ''}<a href={url} target="_blank" rel="noreferrer">{label}</a></span>
                        ))}</span>
                      </li>
                    ))}</ul>
                    <div className="after">価格表では出せない案件です。過去の案件から金額の目安を出せます。</div>
                  </section>
                )}

                {/* 叩き台 */}
                {res.draft && (
                  <section className="draft" aria-labelledby="h-draft">
                    <h2 id="h-draft">見積の叩き台</h2>
                    <div className="big">{yen(res.draft.amount)} <span className="chip">税抜・概算</span></div>
                    <div className="uchiwake">
                      {res.draft.dtpH > 0
                        ? <>刷り代 {yen(res.draft.suri)} ＋ 組版 {yen(res.draft.kumihan)}（DTP {res.draft.dtpH.toFixed(1)}h・<Kari />）＝ <b>{yen(res.draft.amount)}</b></>
                        : <>刷り代 {yen(res.draft.suri)}（組版 ¥0・支給データ完全）＝ <b>{yen(res.draft.amount)}</b></>}
                    </div>
                    <dl className="kv">
                      <dt>推定単価(刷り代)</dt><dd>{res.draft.unitEst.toFixed(1)} 円/部 <span className="hint">(同種の類似レンジ {res.draft.uMin.toFixed(1)}〜{res.draft.uMax.toFixed(1)} 円/部)</span></dd>
                      <dt>数量</dt><dd>{res.q.qty.toLocaleString()} 部</dd>
                      <dt>組版(DTP)</dt><dd>{res.draft.dtpH > 0 ? <>+{res.draft.dtpH.toFixed(1)}h = {yen(res.draft.kumihan)}（支給データ={res.q.dataState}・<Kari />ルール）</> : '+0h（完全データ）'}</dd>
                      <dt>想定粗利率</dt><dd>{res.draft.marginEst.toFixed(0)} % <span className="hint">(刷り代ベース・参考)</span></dd>
                      <dt>推奨納期</dt><dd>約 {res.draft.leadEst} 営業日</dd>
                      <dt>型・版代</dt><dd>{res.draft.katagata}</dd>
                    </dl>
                    <div className="basis"><b>価格根拠</b>: <b>同種</b>の類似上位 <b>{res.basis.length}</b> 件({res.draft.basisIds.join(', ')})の単価中央値 <b>{res.draft.baseUnit.toFixed(1)}円/部</b> を基準に、数量差で {res.draft.scalePct >= 0 ? '+' : ''}{res.draft.scalePct.toFixed(0)}% 調整(<Kari />ルール)。<br />叩き台です。特殊仕様・原価の変動・お客様の事情を見て、金額を調整してください。</div>
                  </section>
                )}

                {/* 手戻り注意 */}
                {notesRows.length > 0 && (
                  <section className="notice" aria-labelledby="h-notes">
                    <b className="label" id="h-notes">▲ この案件で注意すべき点(採用した同種の類似案件で発生した手戻り)</b>
                    <ul>{notesRows.map((t) => <li key={t.r.id}>{codeOf(t.r)} {t.r.name} … {t.r.rework}</li>)}</ul>
                    <div className="after">見積を出す前に、これらを先に確認すると、受注後の手戻りを防げます。</div>
                  </section>
                )}
              </div>

              <div className="rescol">
                {/* 類似案件 */}
                <section className="card" aria-labelledby="h-basis">
                  <h2 id="h-basis">根拠にした過去案件</h2>
                  {res.basis.length ? res.basis.map((t) => (
                    <div className="match" key={t.r.id}>
                      <div className="top"><span className="nm">{t.r.name} <span className="hint">({codeOf(t.r)})</span></span><span className="score">類似度 {t.pct}%</span></div>
                      <div className="bar" aria-hidden="true"><i style={{ width: `${t.pct}%` }} /></div>
                      <div className="specs">{t.r.type} / {t.r.size} / {t.r.paper ?? '-'} / {t.r.color} / {t.r.qty.toLocaleString()}部 / {t.r.finishing.length ? t.r.finishing.join('・') : '加工なし'} / {t.r.dataState} / {t.r.reuse} … 単価 <b>{unitOf(t.r).toFixed(1)}円</b>・粗利 {marginOf(t.r).toFixed(0)}%・納期{t.r.leadDays ?? '-'}日{t.r.rework ? <><br /><span className="rw">▲手戻り: {t.r.rework}</span></> : null}</div>
                      <div className="chips">{t.why.map(([k, v], i) => <span key={i} className={`chip ${v ? 'good' : 'no'}`}>{v ? '✓' : '×'} {k}</span>)}</div>
                    </div>
                  )) : <div className="placeholder">同種の類似案件が見つかりませんでした。</div>}
                </section>
              </div>
            </div>
          )}

          {/* 記録と検索(結果の有無に関わらず常に表示) */}
          <div className="band">
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
                  <input type="number" inputMode="numeric" min={1} value={recAmount} disabled={!canRecord} aria-describedby={canRecord ? undefined : 'rec-why'} placeholder="31000" onChange={(e) => setRecAmount(e.target.value)} /></label>
                <label className="field"><span className="lbl">補正理由 <span className="hint">(自由記述)</span></span>
                  <input type="text" value={recReason} disabled={!canRecord} aria-describedby={canRecord ? undefined : 'rec-why'} placeholder="特殊紙の歩留まりを見て上げた 等" onChange={(e) => setRecReason(e.target.value)} /></label>
                <button type="button" className="btn secondary" onClick={record} disabled={!canRecord || recording}>{recording ? '記録中…' : '確定金額を記録する'}</button>
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
                        ? deleteConfirm(h.id, label, true)
                        : <button type="button" className="btn text danger" onClick={() => setDeletingId(h.id)}>{label} を削除する</button>}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="card" aria-labelledby="h-memo">
              <h2 id="h-memo">過去のメモを検索</h2>
              <div className="inline">
                <label className="field grow"><span className="lbl">検索する語</span>
                  <input type="text" value={kw} placeholder="塗り足し / 色合わせ / 特色番号 / 型がずれた …" onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearch()} /></label>
                <button type="button" className="btn secondary" onClick={onSearch} disabled={isSearching}>{isSearching ? '検索中…' : 'メモを検索する'}</button>
              </div>
              {searchRes && (searchRes.length ? (
                <div>
                  {searchRes.map((r) => <div className="sres" key={r.id}><b>{codeOf(r)} {r.name}</b> … {r.source === 'tool'
                    ? <>確定 <span className="num">{yen(r.amount)}</span>{r.draftAmount !== null ? <>(叩き台 <span className="num">{yen(r.draftAmount)}</span>)</> : ''} … 補正理由: {r.reason} <span className="chip">つもる記録</span></>
                    : (r.rework || r.note || r.reason)}</div>)}
                  <p className="hint">属性が違っても、見積のときに確認すべき理由が近い案件を探せます(部分一致の検索)。</p>
                </div>
              ) : <p className="hint">「{kw}」に一致するメモ・手戻り事由は見つかりませんでした。</p>)}
            </section>
          </div>

          {/* 削減効果 */}
          {res && (
            <section className="card beforeafter after-band" aria-labelledby="h-save">
              <h2 id="h-save">削減効果</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th scope="col">項目</th><th scope="col">従来(ベテランの記憶＋手計算)</th><th scope="col">本ツール</th></tr>
                  </thead>
                  <tbody>
                    <tr><th scope="row">1件の見積作成</th><td>約{sv.before}分 <Kari /></td><td><b>約{sv.after}分</b> <Kari />(類似提示＋叩き台)</td></tr>
                    <tr><th scope="row">価格の根拠</th><td>担当者の頭の中(属人的)</td><td><b>過去案件で提示</b>(誰でも引ける)</td></tr>
                  </tbody>
                </table>
              </div>
              <p>削減 {sv.saveMin}分/件(=50%) を <code>年間コスト=削減時間×年間件数×時給2,631円</code> に当てると、年1,000件で約<b className="num">{sv.y1000.toLocaleString()}円</b>、2,000件で約<b className="num">{sv.y2000.toLocaleString()}円</b>、3,000件で約<b className="num">{sv.y3000.toLocaleString()}円</b>の削減です <Kari />。時給のみ一次データで、件数・時間は仮です。提案時に実測へ置き換えます。</p>
            </section>
          )}
        </div>
      </main>

      <div className="foot">
        仕組み: 引合いの特徴を過去見積と重み付きで突き合わせ(満点122点→100%正規化)、同種の類似上位から単価中央値×数量スケールで叩き台を出す、説明できる方式です。自動見積対象外の判定は各社公式の入稿ガイド・仕様・FAQ に基づきます。件数・所要時間は仮で、提案時に実測へ置き換えます。データは登録済みの過去見積から取得しています。
      </div>

      {/* 登録/編集ダイアログ(登録後も閉じずにメッセージ表示) */}
      <dialog ref={dialogRef} aria-labelledby="h-form">
        <form key={formKey} onSubmit={onSaveSubmit}>
          <div className="dlg-body">
            <h2 id="h-form">{editing ? `過去見積を編集する（${codeOf(editing)}）` : '過去見積を登録する'}</h2>
            {editing && <input type="hidden" name="id" defaultValue={editing.id} />}
            <label className="field"><span className="lbl">案件名 <span className="req">必須</span></span>
              <input type="text" name="name" defaultValue={editing?.name ?? ''} placeholder="例: 〇〇スーパー B4折込チラシ" required /></label>
            <div className="row2">
              <label className="field"><span className="lbl">種類 <span className="req">必須</span></span><select name="type" defaultValue={editing?.type ?? TYPES[0]}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
              <label className="field"><span className="lbl">サイズ <span className="req">必須</span></span><select name="size" defaultValue={editing?.size ?? SIZES[0]}>{SIZES.map((v) => <option key={v}>{v}</option>)}</select></label>
            </div>
            <div className="row2">
              <label className="field"><span className="lbl">用紙 <span className="req">必須</span></span><select name="paper" defaultValue={editing?.paper ?? defaultPaper}>{papers.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.family}）</option>)}</select></label>
              <label className="field"><span className="lbl">色 <span className="req">必須</span></span><select name="color" defaultValue={editing?.color ?? COLORS[0]}>{COLORS.map((v) => <option key={v}>{v}</option>)}</select></label>
            </div>
            <div className="row2">
              <label className="field"><span className="lbl">数量 <span className="req">必須</span></span><input type="number" inputMode="numeric" name="qty" min={1} defaultValue={editing?.qty ?? 1000} /></label>
              <label className="field"><span className="lbl">納期(営業日)</span><input type="number" inputMode="numeric" name="lead_days" min={0} defaultValue={editing?.leadDays ?? 5} /></label>
            </div>
            <div className="row2">
              <label className="field"><span className="lbl">見積金額(税抜) <span className="req">必須</span></span><input type="number" inputMode="numeric" name="amount" min={0} defaultValue={editing?.amount ?? 0} /></label>
              <label className="field"><span className="lbl">原価 <span className="req">必須</span></span><input type="number" inputMode="numeric" name="cost" min={0} defaultValue={editing?.cost ?? 0} /></label>
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
              <input type="text" name="note" defaultValue={editing?.note ?? ''} placeholder="毎週リピート 等" /></label>
            <label className="field"><span className="lbl">手戻り事由 <span className="hint">(あれば。検索の対象)</span></span>
              <input type="text" name="rework" defaultValue={editing?.rework ?? ''} placeholder="特色番号の指定漏れで刷り直し 等" /></label>
            <Msg m={saveMsg} />
            <div className="dlg-foot">
              <button type="button" className="btn secondary" onClick={() => dialogRef.current?.close()}>閉じる</button>
              <button type="submit" className="btn primary" disabled={saving}>{saving ? (editing ? '更新中…' : '登録中…') : (editing ? '更新する' : '登録する')}</button>
            </div>
          </div>
        </form>
      </dialog>

      {/* 一覧・照会・削除ダイアログ */}
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
                    deleteConfirm(r.id, codeOf(r))
                  ) : (
                    <>
                      <button type="button" className="btn text" onClick={() => openEdit(r)}>{codeOf(r)} を編集する</button>
                      <button type="button" className="btn text danger" onClick={() => setDeletingId(r.id)}>{codeOf(r)} を削除する</button>
                    </>
                  )}
                </div>
              </div>
            )) : <p className="hint pad">「{filter}」に一致する案件はありません。絞り込みの語を変えてください。</p>}
          </div>
          <div className="dlg-foot between">
            <button type="button" className="btn secondary" onClick={openCreate}>新規に登録する</button>
            <button type="button" className="btn secondary" onClick={() => listRef.current?.close()}>閉じる</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
