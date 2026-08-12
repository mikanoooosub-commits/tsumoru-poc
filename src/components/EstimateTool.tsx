'use client';

import { useRef, useState, useTransition } from 'react';
import {
  type EstimateRow, type Query, type Scored, type DetectHit,
  rank, detect, buildDraft, savings, yen, unitOf, marginOf,
  TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES,
} from '@/lib/scoring';
import { saveEstimate, deleteEstimate, searchMemos, type FormState } from '@/app/actions';

type Paper = { name: string; family: string };
type MemoRow = { id: number; code: string | null; name: string; rework: string | null; note: string | null };

const codeOf = (r: { code: string | null; id: number }) => r.code ?? `#${r.id}`;

export default function EstimateTool({ estimates, papers }: { estimates: EstimateRow[]; papers: Paper[] }) {
  const paperFamily = new Map(papers.map((p) => [p.name, p.family]));
  const paperNames = papers.map((p) => p.name);

  // ── 入力 ──
  const [type, setType] = useState(TYPES[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [paper, setPaper] = useState(paperNames[0] ?? '');
  const [color, setColor] = useState(COLORS[0]);
  const [qty, setQty] = useState('3000');
  const [fin, setFin] = useState<string[]>([]);
  const [ds, setDs] = useState(DATA_STATES[0]);
  const [reuse, setReuse] = useState(REUSES[0]);
  const toggleFin = (v: string) => setFin((f) => (f.includes(v) ? f.filter((x) => x !== v) : [...f, v]));

  const [res, setRes] = useState<null | { q: Query; detect: DetectHit[]; basis: Scored[]; strong: Scored[]; draft: ReturnType<typeof buildDraft> }>(null);
  function run() {
    const q: Query = {
      type, size, family: paperFamily.get(paper) ?? '', color,
      qty: Math.max(1, parseInt(qty, 10) || 1), finishing: fin, dataState: ds, reuse,
    };
    const { basis, strong } = rank(q, estimates);
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
  function openList() { setListMsg(null); setFilter(''); setDeletingId(null); listRef.current?.showModal(); }
  function doDelete(id: number) {
    startDelete(async () => {
      const r = await deleteEstimate(id);
      setDeletingId(null);
      setListMsg(r);
    });
  }
  const filtered = estimates.filter((r) => {
    const q = filter.trim();
    if (!q) return true;
    return (`${r.name} ${r.type} ${r.size} ${codeOf(r)}`).includes(q);
  });

  // ── メモ検索(DBのILIKE) ──
  const [kw, setKw] = useState('');
  const [searchRes, setSearchRes] = useState<MemoRow[] | null>(null);
  const [isSearching, startSearch] = useTransition();
  const onSearch = () => startSearch(async () => setSearchRes(await searchMemos(kw)));

  // ── 確定記録(この画面内のみ・永続化しない) ──
  const [recAmount, setRecAmount] = useState('');
  const [recReason, setRecReason] = useState('');
  const [recHist, setRecHist] = useState<{ draft: number; amt: number; diff: number; reason: string }[]>([]);
  function record() {
    const amt = parseInt(recAmount, 10) || 0;
    const draftAmt = res?.draft?.amount ?? 0;
    if (!amt || !draftAmt) return;
    setRecHist((h) => [{ draft: draftAmt, amt, diff: ((amt - draftAmt) / draftAmt) * 100, reason: recReason.trim() || '(理由なし)' }, ...h]);
    setRecAmount(''); setRecReason('');
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
            <div className="brandname">つもる</div>
            <div className="tagline">過去案件から引く、見積の下書き</div>
          </div>
        </div>
        <div className="ctx">
          <span className="pill warn">⚠ 合成(仮)データ・金額は例示</span>
          <span className="pill">対象: チラシ・DM・名刺・ポスター等の定型</span>
          <span className="pill">Neon 全{estimates.length}件</span>
        </div>
      </header>

      <div className="grid">
        {/* 入力 */}
        <div className="card">
          <h2>引合いの条件</h2>
          <label>種類</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select>
          <label>サイズ</label>
          <select value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map((v) => <option key={v}>{v}</option>)}</select>
          <label>用紙 <span className="muted">(系統でスコア)</span></label>
          <select value={paper} onChange={(e) => setPaper(e.target.value)}>{papers.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.family}）</option>)}</select>
          <label>色</label>
          <select value={color} onChange={(e) => setColor(e.target.value)}>{COLORS.map((v) => <option key={v}>{v}</option>)}</select>
          <label>数量(部・枚)</label>
          <input type="number" value={qty} min={1} step={100} onChange={(e) => setQty(e.target.value)} />
          <label>加工</label>
          <div className="fin">{FINS.map((v) => (
            <label key={v}><input type="checkbox" checked={fin.includes(v)} onChange={() => toggleFin(v)} />{v}</label>
          ))}</div>
          <label>支給データの状態 <span className="muted">(データがそのまま使えるか)</span></label>
          <select value={ds} onChange={(e) => setDs(e.target.value)}>{DATA_STATES.map((v) => <option key={v}>{v}</option>)}</select>
          <label>型・版・色の流用 <span className="muted">(地場の自社資産)</span></label>
          <select value={reuse} onChange={(e) => setReuse(e.target.value)}>{REUSES.map((v) => <option key={v}>{v}</option>)}</select>
          <button onClick={run}>類似案件を検索して叩き台を作る</button>
          <div style={{ marginTop: 12, textAlign: 'center' }} className="toolbar">
            <button className="linkbtn" onClick={openCreate}>＋ 過去見積を登録する</button>
            <span className="muted"> ・ </span>
            <button className="linkbtn" onClick={openList}>📋 過去見積の一覧・編集</button>
          </div>
        </div>

        {/* 結果 */}
        <div>
          {!res ? (
            <div className="placeholder">左で条件を入れて「叩き台を作る」を押すと、判定・叩き台・類似案件がここに表示されます。</div>
          ) : (
            <div className="results">
              <div className="rescol">
              {/* 判定(対象外の5型に該当したときだけ表示。範囲内=定型は何も出さない) */}
              {res.detect.length > 0 && (
                <div className="detect ng">
                  <b>▲ この案件はネット印刷の自動見積の対象外に該当します</b>
                  <ul>{res.detect.map((h, i) => (
                    <li key={i}><b>{h.t}</b> … {h.d}<br />
                      <span className="src">{h.links.map(([label, url], j) => (
                        <span key={j}>{j > 0 ? ' ／ ' : ''}<a href={url} target="_blank" rel="noreferrer">{label}</a></span>
                      ))}</span>
                    </li>
                  ))}</ul>
                  <div className="muted">→ 価格表では引けない案件。だから過去案件から引く価値がある。</div>
                </div>
              )}

              {/* 叩き台 */}
              {res.draft && (
                <div className="draft">
                  <h2>見積の叩き台(自動生成・要確認)</h2>
                  <div className="big">{yen(res.draft.amount)} <span className="pill">税抜・概算</span></div>
                  <div className="uchiwake">
                    {res.draft.dtpH > 0
                      ? <>刷り代 {yen(res.draft.suri)} ＋ 組版 {yen(res.draft.kumihan)}（DTP {res.draft.dtpH.toFixed(1)}h・仮）＝ <b>{yen(res.draft.amount)}</b></>
                      : <>刷り代 {yen(res.draft.suri)}（組版 ¥0・支給データ完全）＝ <b>{yen(res.draft.amount)}</b></>}
                  </div>
                  <dl className="kv">
                    <dt>推定単価(刷り代)</dt><dd>{res.draft.unitEst.toFixed(1)} 円/部 <span className="muted">(同種の類似レンジ {res.draft.uMin.toFixed(1)}〜{res.draft.uMax.toFixed(1)} 円/部)</span></dd>
                    <dt>数量</dt><dd>{res.q.qty.toLocaleString()} 部</dd>
                    <dt>組版(DTP)</dt><dd>{res.draft.dtpH > 0 ? `+${res.draft.dtpH.toFixed(1)}h = ${yen(res.draft.kumihan)}（支給データ=${res.q.dataState}・仮ルール）` : '+0h（完全データ）'}</dd>
                    <dt>想定粗利率</dt><dd>{res.draft.marginEst.toFixed(0)} % <span className="muted">(刷り代ベース・参考)</span></dd>
                    <dt>推奨納期</dt><dd>約 {res.draft.leadEst} 営業日</dd>
                    <dt>型・版代</dt><dd>{res.draft.katagata}</dd>
                  </dl>
                  <div className="basis"><b>価格根拠</b>: <b>同種</b>の類似上位 <b>{res.basis.length}</b> 件({res.draft.basisIds.join(', ')})の単価中央値 <b>{res.draft.baseUnit.toFixed(1)}円/部</b> を基準に、数量差で {res.draft.scalePct >= 0 ? '+' : ''}{res.draft.scalePct.toFixed(0)}% 調整(仮ルール)。<br /><span className="muted">※叩き台です。特殊仕様・原価変動・客先事情は担当者が最終調整してください。</span></div>
                </div>
              )}

              {/* 手戻り注意 */}
              {notesRows.length > 0 && (
                <div className="notes"><b>▲ この案件で注意すべき点(採用した同種の類似案件で発生した手戻り)</b>
                  <ul>{notesRows.map((t) => <li key={t.r.id}>{codeOf(t.r)} {t.r.name} … {t.r.rework}</li>)}</ul>
                  <div className="muted">→ 見積提示時にこれらを先に確認する(発注後の手戻りを防ぐ)。過去案件データがあって初めて出せる出力。</div>
                </div>
              )}
              </div>

              <div className="rescol">
              {/* 類似案件 */}
              <div className="card">
                <h2>根拠にした過去案件</h2>
                {res.basis.length ? res.basis.map((t) => (
                  <div className="match" key={t.r.id}>
                    <div className="top"><span className="nm">{t.r.name} <span className="muted">({codeOf(t.r)})</span></span><span className="score">類似度 {t.pct}%</span></div>
                    <div className="bar"><i style={{ width: `${t.pct}%` }} /></div>
                    <div className="specs">{t.r.type} / {t.r.size} / {t.r.paper ?? '-'} / {t.r.color} / {t.r.qty.toLocaleString()}部 / {t.r.finishing.length ? t.r.finishing.join('・') : '加工なし'} / {t.r.dataState} / {t.r.reuse} … 単価 <b>{unitOf(t.r).toFixed(1)}円</b>・粗利 {marginOf(t.r).toFixed(0)}%・納期{t.r.leadDays ?? '-'}日{t.r.rework ? <><br /><span className="rw">▲手戻り: {t.r.rework}</span></> : null}</div>
                    <div className="chips">{t.why.map(([k, v], i) => <span key={i} className={`chip ${v ? '' : 'no'}`}>{v ? '✓' : '×'} {k}</span>)}</div>
                  </div>
                )) : <div className="placeholder">同種の類似案件が見つかりませんでした。</div>}
              </div>

              {/* 詳しく見る: 検索・記録 */}
              <details className="more">
                <summary>▸ 詳しく見る(記録と検索)</summary>
                <div className="card">
                  <h2>過去のメモを検索</h2>
                  <div className="inline">
                    <input type="text" value={kw} placeholder="塗り足し / 色合わせ / 特色番号 / 型がずれた …" onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearch()} />
                    <button onClick={onSearch} disabled={isSearching}>{isSearching ? '検索中…' : '🔍 検索'}</button>
                  </div>
                  {searchRes && (searchRes.length ? (
                    <div style={{ marginTop: 8 }}>
                      {searchRes.map((r) => <div className="sres" key={r.id}>▸ <b>{codeOf(r)} {r.name}</b> … {r.rework || r.note}</div>)}
                      <div className="muted" style={{ marginTop: 6 }}>※属性は違っても「見積時に確認すべき理由」が近い案件を拾える(DBの部分一致検索)。</div>
                    </div>
                  ) : <p className="muted" style={{ marginTop: 8 }}>「{kw}」に一致するメモ・手戻り事由は見つかりませんでした。</p>)}
                </div>
                <div className="card">
                  <h2>確定金額を記録する <span className="muted">(この画面内のみ)</span></h2>
                  <div className="inline">
                    <div><label style={{ margin: '0 0 .2em' }}>確定金額(円)</label><input type="number" value={recAmount} style={{ width: 140 }} placeholder="31000" onChange={(e) => setRecAmount(e.target.value)} /></div>
                    <div style={{ flex: 1, minWidth: 180 }}><label style={{ margin: '0 0 .2em' }}>補正理由(自由記述)</label><input type="text" value={recReason} placeholder="特殊紙の歩留まりを見て上げた 等" onChange={(e) => setRecReason(e.target.value)} /></div>
                    <button onClick={record}>記録</button>
                  </div>
                  {recHist.length > 0 && (
                    <div><div className="hist-hd">── 記録 ──</div>
                      {recHist.map((h, i) => <div className="hrow" key={i}>叩き台 {yen(h.draft)} → 確定 <b>{yen(h.amt)}</b>（{h.diff >= 0 ? '+' : ''}{h.diff.toFixed(1)}%） 理由: {h.reason}</div>)}
                    </div>
                  )}
                </div>
              </details>

              {/* 削減効果 */}
              <div className="card beforeafter">
                <h2>削減効果</h2>
                <table>
                  <tbody>
                    <tr><th></th><th>従来(ベテランの記憶＋手計算)</th><th>本ツール</th></tr>
                    <tr><td>1件の見積作成</td><td>約{sv.before}分(仮・§6基準ケース)</td><td><b>約{sv.after}分</b>(類似提示＋叩き台)</td></tr>
                    <tr><td>価格の根拠</td><td>担当者の頭の中(属人的)</td><td><b>過去案件で提示</b>(誰でも引ける)</td></tr>
                  </tbody>
                </table>
                <p className="muted">削減 {sv.saveMin}分/件(=50%) を <code>年間コスト=削減時間×年間件数×時給2,631円</code> に当てると ― 年1,000件で約<b>{sv.y1000.toLocaleString()}円</b>、2,000件で約<b>{sv.y2000.toLocaleString()}円</b>、3,000件で約<b>{sv.y3000.toLocaleString()}円</b>の削減(仮)。時給のみ一次、件数・時間は仮=提案時に実測へ置換。</p>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="foot">
        仕組み: 引合いの特徴を過去見積と重み付きで突き合わせ(満点122点→100%正規化)、同種の類似上位から単価中央値×数量スケールで叩き台を出す説明可能な方式。自動見積対象外の判定は各社公式の入稿ガイド/仕様/FAQ。件数・所要時間は仮=提案時に実測。データは Neon の Postgres から取得。
      </div>

      {/* 登録/編集ダイアログ(登録後も閉じずにメッセージ表示) */}
      <dialog ref={dialogRef}>
        <form key={formKey} onSubmit={onSaveSubmit}>
          <div className="dlg-body">
            <h2>{editing ? `過去見積を編集する（${codeOf(editing)}）` : '過去見積を登録する'}</h2>
            {editing && <input type="hidden" name="id" defaultValue={editing.id} />}
            <label>案件名 *</label>
            <input type="text" name="name" defaultValue={editing?.name ?? ''} placeholder="例: 〇〇スーパー B4折込チラシ" required />
            <div className="row2">
              <div><label>種類 *</label><select name="type" defaultValue={editing?.type ?? TYPES[0]}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select></div>
              <div><label>サイズ *</label><select name="size" defaultValue={editing?.size ?? SIZES[0]}>{SIZES.map((v) => <option key={v}>{v}</option>)}</select></div>
            </div>
            <div className="row2">
              <div><label>用紙 *</label><select name="paper" defaultValue={editing?.paper ?? paperNames[0] ?? ''}>{papers.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.family}）</option>)}</select></div>
              <div><label>色 *</label><select name="color" defaultValue={editing?.color ?? COLORS[0]}>{COLORS.map((v) => <option key={v}>{v}</option>)}</select></div>
            </div>
            <div className="row2">
              <div><label>数量 *</label><input type="number" name="qty" min={1} defaultValue={editing?.qty ?? 1000} /></div>
              <div><label>納期(営業日)</label><input type="number" name="lead_days" min={0} defaultValue={editing?.leadDays ?? 5} /></div>
            </div>
            <div className="row2">
              <div><label>見積金額(税抜) *</label><input type="number" name="amount" min={0} defaultValue={editing?.amount ?? 0} /></div>
              <div><label>原価 *</label><input type="number" name="cost" min={0} defaultValue={editing?.cost ?? 0} /></div>
            </div>
            <div className="row2">
              <div><label>支給データの状態 *</label><select name="data_state" defaultValue={editing?.dataState ?? DATA_STATES[0]}>{DATA_STATES.map((v) => <option key={v}>{v}</option>)}</select></div>
              <div><label>型・版・色の流用 *</label><select name="reuse" defaultValue={editing?.reuse ?? REUSES[0]}>{REUSES.map((v) => <option key={v}>{v}</option>)}</select></div>
            </div>
            <label>加工</label>
            <div className="fin">{FINS.map((v) => (<label key={v}><input type="checkbox" name="finishing" value={v} defaultChecked={editing?.finishing?.includes(v) ?? false} />{v}</label>))}</div>
            <label>メモ(検索対象)</label>
            <input type="text" name="note" defaultValue={editing?.note ?? ''} placeholder="毎週リピート 等" />
            <label>手戻り事由(あれば・検索対象)</label>
            <input type="text" name="rework" defaultValue={editing?.rework ?? ''} placeholder="特色番号の指定漏れで刷り直し 等" />
            {saveMsg && <div className={saveMsg.ok ? 'msg-ok' : 'msg-ng'}>{saveMsg.message}</div>}
            <div className="inline" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
              <button type="button" className="linkbtn" onClick={() => dialogRef.current?.close()}>閉じる</button>
              <button type="submit" disabled={saving} style={{ width: 'auto', margin: 0, padding: '9px 18px' }}>{saving ? (editing ? '更新中…' : '登録中…') : (editing ? '更新する' : '登録する')}</button>
            </div>
          </div>
        </form>
      </dialog>

      {/* 一覧・照会・削除ダイアログ */}
      <dialog ref={listRef} className="wide">
        <div className="dlg-body">
          <h2>過去見積の一覧・編集 <span className="muted">(全{estimates.length}件)</span></h2>
          <div className="inline">
            <input type="text" value={filter} placeholder="案件名・種類・サイズ・番号で絞り込み" onChange={(e) => setFilter(e.target.value)} />
          </div>
          {listMsg && <div className={listMsg.ok ? 'msg-ok' : 'msg-ng'} style={{ marginTop: 8 }}>{listMsg.message}</div>}
          <div className="listwrap">
            {filtered.length ? filtered.map((r) => (
              <div className="lrow" key={r.id}>
                <div className="lmain">
                  <b>{r.name}</b> <span className="muted">({codeOf(r)})</span>
                  <div className="specs">{r.type} / {r.size} / {r.paper ?? '-'} / {r.color} / {r.qty.toLocaleString()}部 / {r.finishing.length ? r.finishing.join('・') : '加工なし'} … {yen(r.amount)}{r.rework ? <span className="rw"> ／ ▲{r.rework}</span> : null}</div>
                </div>
                <div className="lact">
                  <button className="linkbtn" onClick={() => openEdit(r)}>編集</button>
                  {deletingId === r.id ? (
                    <span className="muted">削除?
                      <button className="linkbtn danger" style={{ marginLeft: 6 }} disabled={deleting} onClick={() => doDelete(r.id)}>はい</button>
                      <button className="linkbtn" style={{ marginLeft: 6 }} onClick={() => setDeletingId(null)}>やめる</button>
                    </span>
                  ) : (
                    <button className="linkbtn danger" onClick={() => setDeletingId(r.id)}>削除</button>
                  )}
                </div>
              </div>
            )) : <p className="muted" style={{ marginTop: 10 }}>「{filter}」に一致する案件はありません。</p>}
          </div>
          <div className="inline" style={{ marginTop: 14, justifyContent: 'space-between' }}>
            <button type="button" className="linkbtn" onClick={openCreate}>＋ 新規に登録する</button>
            <button type="button" className="linkbtn" onClick={() => listRef.current?.close()}>閉じる</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
