'use client';

import { useRef, useState, useTransition } from 'react';
import {
  type EstimateRow, type Query, type Scored, type DetectHit,
  rank, detect, buildDraft, yen, unitOf, marginOf,
  TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES,
} from '@/lib/scoring';
import { parseQty, QTY_ERROR, QTY_MAX, NAME_MAX, MEMO_MAX, REASON_MAX } from '@/lib/input';
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

// 粗利率の表示。金額0円の行は割れないので「—」(F-04: 以前は「NaN %」と出た)
const fmtMargin = (r: EstimateRow) => {
  const m = marginOf(r);
  return m === null ? '—' : `${m.toFixed(0)}%`;
};

// 根拠が弱いとみなす類似度(%)の境目(F-10)。上位の類似度がこれ未満なら注意を出す
const WEAK_PCT = 50;

// 数値欄に入ったら中身を全選択する(F-04: 既存の値に打った数字が連結されないように)。
// クリックで入ったときは、ボタンを離した瞬間に選択が解けるので、その1回だけ解除を止める
// (すでに入力中の欄をクリックしたときは止めない=カーソル位置を選べる)。
const selectOnFocus = {
  onMouseDown: (e: React.MouseEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) e.currentTarget.dataset.selectOnUp = '1';
  },
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
  onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => {
    if (e.currentTarget.dataset.selectOnUp) { e.preventDefault(); delete e.currentTarget.dataset.selectOnUp; }
  },
};

// Enter で実行する(日本語入力の変換確定の Enter では動かさない)
function onEnter(e: React.KeyboardEvent<HTMLInputElement>, fn: () => void) {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); fn(); }
}

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
  const [qtyErr, setQtyErr] = useState('');
  const [ds, setDs] = useState(DATA_STATES[0]);
  const [reuse, setReuse] = useState(REUSES[0]);
  // 加工のチェックは画面の状態(DOM)をそのまま読む。React の状態に写すと、チェックの付け方によっては
  // 画面にはチェックが見えるのに叩き台に渡らないことがあった(WO-016・対象外の表示の件)
  const finRef = useRef<HTMLFieldSetElement>(null);
  const readFin = () => FINS.filter((v) => finRef.current?.querySelector<HTMLInputElement>(`input[value="${v}"]`)?.checked);

  const [resPaper, setResPaper] = useState(''); // 叩き台を出した時点の用紙名(記録時に送る)
  const [res, setRes] = useState<null | { q: Query; detect: DetectHit[]; basis: Scored[]; strong: Scored[]; draft: ReturnType<typeof buildDraft> }>(null);
  function run() {
    // 数量は黙って直さない(F-02・F-03)。不正なら叩き台を出さず、前の結果も消して入力と結果が食い違わないようにする
    const q1 = parseQty(qty);
    if (q1 === null) { setQtyErr(QTY_ERROR); setRes(null); return; }
    setQtyErr('');
    const q: Query = {
      type, size, family: paperFamily.get(paper) ?? '', color,
      qty: q1, finishing: readFin(), dataState: ds, reuse,
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
      dialogRef.current?.scrollTo({ top: 0 }); // 結果の文はダイアログの上に出すので、上まで戻して見せる(F-12)
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
  const [searchedKw, setSearchedKw] = useState('');
  const [kwTried, setKwTried] = useState(false); // 一度でも検索ボタンを押したか(空欄のときの案内を出すため) // 検索した時点の語(結果の文に使う。入力中の語ではなく)
  const [searchRes, setSearchRes] = useState<MemoRow[] | null>(null);
  const [isSearching, startSearch] = useTransition();
  const onSearch = () => {
    const q = kw.trim();
    setSearchedKw(q);
    setKwTried(true);
    if (!q) { setSearchRes(null); return; } // 空欄は検索しない(F-22: 0件と区別する)
    startSearch(async () => setSearchRes(await searchMemos(q)));
  };

  // ── 確定金額の記録(DBに保存。ISSUE-P-005) ──
  // 送るのは検索時点の条件と確定金額・理由だけ。叩き台はサーバーが条件から再計算して保存する。
  const [recAmount, setRecAmount] = useState('');
  const [recReason, setRecReason] = useState('');
  const [recording, startRecord] = useTransition();
  const canRecord = !!res?.draft;
  function record() {
    if (!res || !res.draft) return;
    const amount = /^\d+$/.test(recAmount.trim()) ? Number(recAmount.trim()) : 0;
    if (amount < 1) { setRecMsg({ ok: false, message: '確定金額は1円以上の整数で入力してください(例: 31000)' }); return; }
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

  const notesRows = res ? res.strong.filter((t) => t.r.rework) : [];

  // ── 根拠の説明(F-09・F-10)。計算式は変えず、scoring.ts が出した値を言葉にするだけ ──
  const topPct = res?.basis.length ? Math.max(...res.basis.map((t) => t.pct)) : 0;
  const best = res?.basis.length ? res.basis.reduce((a, b) => (b.pct > a.pct ? b : a)) : null; // いちばん似た案件
  const bestGap = best && res?.draft ? (res.draft.unitEst / unitOf(best.r) - 1) * 100 : 0; // 叩き台の単価との差(%)
  const sameType = !!res && res.strong.length > 0; // 根拠が同じ種類の案件か(無ければ別の種類で代用している)
  const weak = !!res?.draft && (!sameType || topPct < WEAK_PCT);
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;

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
          <span className="chip line">対象: チラシ・DM・名刺・ポスター等の商業印刷</span>
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
            <input type="number" inputMode="numeric" value={qty} min={1} max={QTY_MAX} step={100}
              aria-invalid={qtyErr ? true : undefined} aria-describedby={qtyErr ? 'qty-err' : undefined}
              {...selectOnFocus} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => onEnter(e, run)} /></label>
          {qtyErr && <p className="msg ng" id="qty-err" role="alert"><span aria-hidden="true">!</span><span>エラー: {qtyErr}</span></p>}
          <fieldset ref={finRef}>
            <legend>加工</legend>
            <div className="checks">{FINS.map((v) => (
              <label className="check" key={v}><input type="checkbox" name="finishing" value={v} />{v}</label>
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
              {/* 叩き台を出した条件(画面の入力と結果が食い違っていないかを、その場で確かめられるように) */}
              <p className="cond">この条件で出しました: {res.q.type} / {res.q.size} / {resPaper} / {res.q.color} / {res.q.qty.toLocaleString()}部 / 加工: {res.q.finishing.length ? res.q.finishing.join('・') : 'なし'} / {res.q.dataState} / {res.q.reuse}</p>

              {/* 判定(ネット印刷で自動で完結しない条件に該当したときだけ、結果のいちばん上に全幅で出す。該当なしは何も出さない) */}
              {res.detect.length > 0 && (
                <section className="judge" aria-labelledby="h-detect">
                  <h2 id="h-detect"><span className="judge-tag">▲ 自動で完結しない条件</span> ネット印刷でも、人の確認や個別の見積が入る条件があります(該当 {res.detect.length}件)</h2>
                  <ul>{res.detect.map((h, i) => (
                    <li key={i}><b>{h.t}</b> … {h.d}{h.note && <>。<b>{h.note}</b></>}<br />
                      <span className="src">{h.links.map(([label, url], j) => (
                        <span key={j}>{j > 0 ? ' ／ ' : ''}<a href={url} target="_blank" rel="noreferrer">{label}</a></span>
                      ))}</span>
                    </li>
                  ))}</ul>
                  <div className="after">下の叩き台では、過去の似た案件から金額の目安を出しています。</div>
                </section>
              )}

              <div className="rescol">
                {/* 叩き台 */}
                {res.draft && (
                  <section className="draft" aria-labelledby="h-draft">
                    <h2 id="h-draft">見積の叩き台</h2>
                    {weak && (
                      <p className="weak" id="weak-note"><b>▲ 根拠が弱い叩き台です。</b>
                        {!sameType && '同じ種類の過去案件が無いため、別の種類の案件から出しています。'}
                        {topPct < WEAK_PCT && `いちばん似た過去案件でも類似度 ${topPct}% です。`}
                        金額は参考程度の目安です。条件の近い過去見積を登録すると、根拠が強くなります。</p>
                    )}
                    <div className="big">{yen(res.draft.amount)} <span className="chip">税抜・概算</span></div>
                    <div className="uchiwake">
                      {res.draft.dtpH > 0
                        ? <>内訳: 刷り代 {yen(res.draft.suri)} ＋ 組版 {yen(res.draft.kumihan)}（DTP {res.draft.dtpH.toFixed(1)}h・<Kari />）</>
                        : <>内訳: 刷り代のみ(支給データが完全なので組版は ¥0)</>}
                    </div>
                    <dl className="kv">
                      <dt>推定単価(刷り代)</dt><dd>{res.draft.unitEst.toFixed(1)} 円/部 <span className="hint">(根拠の案件の単価 {res.draft.uMin.toFixed(1)}〜{res.draft.uMax.toFixed(1)} 円/部)</span></dd>
                      <dt>数量</dt><dd>{res.q.qty.toLocaleString()} 部</dd>
                      <dt>組版(DTP)</dt><dd>{res.draft.dtpH > 0 ? <>+{res.draft.dtpH.toFixed(1)}h = {yen(res.draft.kumihan)}（支給データ={res.q.dataState}・<Kari />ルール）</> : '+0h（完全データ）'}</dd>
                      <dt>想定粗利率</dt><dd>{res.draft.marginEst !== null ? `${res.draft.marginEst.toFixed(0)} %` : '—'} <span className="hint">(刷り代ベース・参考)</span></dd>
                      <dt>推奨納期</dt><dd>約 {res.draft.leadEst} 営業日</dd>
                      <dt>型・版代</dt><dd>{res.draft.katagata}</dd>
                    </dl>
                    <div className="basis">
                      <b>価格根拠</b>
                      <ul>
                        <li><b>基準の単価</b>: {sameType ? '同じ種類の' : '別の種類の'}類似上位 {res.basis.length} 件({res.draft.basisIds.join(', ')})の単価 {res.basis.map((t) => unitOf(t.r).toFixed(1)).join('・')} 円/部 の<b>中央値 {res.draft.baseUnit.toFixed(1)}円/部</b>。1件に合わせず真ん中の値を使い、高すぎる・安すぎる1件に引っ張られないようにしています。</li>
                        <li><b>数量差の調整 {pct(res.draft.scalePct)}</b>(<Kari />ルール): 根拠の案件の数量(中央値 {Math.round(res.draft.baseQty).toLocaleString()}部)と今回の {res.q.qty.toLocaleString()}部 を比べ、部数が少ないほど1部あたりを高く、多いほど安くします。{res.draft.scaleClamped ? '調整は上下25%までで、今回は上限で止めています。' : '調整は上下25%までです。'}</li>
                        {best && Math.abs(bestGap) >= 10 && (
                          <li>いちばん似た {codeOf(best.r)}(類似度 {best.pct}%・単価 {unitOf(best.r).toFixed(1)}円/部)より、叩き台の単価は <b>{pct(bestGap)}</b> です。{codeOf(best.r)} の1件ではなく、上位 {res.basis.length} 件の中央値を基準にし、数量差を調整しているためです。</li>
                        )}
                      </ul>
                      叩き台なので、特殊仕様・原価の変動・お客様の事情に合わせて金額を調整する前提です。
                    </div>
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
                      <div className="specs">{t.r.type} / {t.r.size} / {t.r.paper ?? '-'} / {t.r.color} / {t.r.qty.toLocaleString()}部 / {t.r.finishing.length ? t.r.finishing.join('・') : '加工なし'} / {t.r.dataState} / {t.r.reuse} … 単価 <b>{unitOf(t.r).toFixed(1)}円</b>・粗利 {fmtMargin(t.r)}・納期{t.r.leadDays ?? '-'}日{t.r.rework ? <><br /><span className="rw">▲手戻り: {t.r.rework}</span></> : null}</div>
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
                  <input type="number" inputMode="numeric" min={1} value={recAmount} disabled={!canRecord} aria-describedby={canRecord ? undefined : 'rec-why'} placeholder="31000" {...selectOnFocus} onChange={(e) => setRecAmount(e.target.value)} onKeyDown={(e) => onEnter(e, record)} /></label>
                <label className="field"><span className="lbl">補正理由 <span className="hint">(自由記述)</span></span>
                  <input type="text" value={recReason} maxLength={REASON_MAX} disabled={!canRecord} aria-describedby={canRecord ? undefined : 'rec-why'} placeholder="特殊紙の歩留まりを見て上げた 等" onChange={(e) => setRecReason(e.target.value)} /></label>
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
          </div>

        </div>
      </main>

      <div className="foot">
        仕組み: 引合いの特徴を過去見積と重み付きで突き合わせ(満点122点→100%正規化)、同種の類似上位から単価中央値×数量スケールで叩き台を出す、説明できる方式です。ネット印刷で自動で完結しない条件(人の確認・個別見積が入る)の判定は、各社公式の入稿ガイド・仕様・FAQ に基づきます。データは登録済みの過去見積から取得しています。
      </div>

      {/* 登録/編集ダイアログ(登録後も閉じずにメッセージ表示) */}
      <dialog ref={dialogRef} aria-labelledby="h-form">
        <form key={formKey} onSubmit={onSaveSubmit} noValidate>
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
            )) : <p className="hint pad">「{filter}」に一致する案件はありません。番号(E-003 など)や種類でも絞り込めます。</p>}
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
