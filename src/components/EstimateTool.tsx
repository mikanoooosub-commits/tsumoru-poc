'use client';

// 見積画面の本体。状態・叩き台の計算の呼び出し・Server Action の呼び出しはここに集め、
// 画面の部分は src/components/estimate/ の部品に分けている(WO-022)。
// 並べ方は決定案 D 直し3(D86): 上に紺の帯、左に紺の条件、右に叩き台 → 根拠 → メモ検索。スマホは縦に1列。
import { useRef, useState, useTransition } from 'react';
import {
  type EstimateRow, type Query,
  rank, detect, buildDraft, unitOf, meaningPoints, type Similarities,
  TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES,
} from '@/lib/scoring';
import { parseQty, QTY_ERROR, REQUEST_MAX, REQUEST_ERROR } from '@/lib/input';
import { saveEstimate, deleteEstimate, searchMemos, recordFinalAmount, semanticScores, type FormState } from '@/app/actions';
import type { ToolRecord } from '@/db/queries';
import { WEAK_PCT } from './estimate/ui';
import type { Paper, MemoRow, Result, Explain, SemanticState } from './estimate/types';
import { useMediaQuery, MOBILE_QUERY } from './estimate/useMediaQuery';
import AppBar from './estimate/AppBar';
import ConditionPanel, { Mechanism, type ConditionValues } from './estimate/ConditionPanel';
import StaleNotice, { type Change } from './estimate/StaleNotice';
import JudgeBand from './estimate/JudgeBand';
import DraftPanel from './estimate/DraftPanel';
import BasisList from './estimate/BasisList';
import SemanticNotice from './estimate/SemanticNotice';
import RecordPanel from './estimate/RecordPanel';
import MemoSearch from './estimate/MemoSearch';
import MobileActionBar from './estimate/MobileActionBar';
import EstimateFormDialog from './estimate/EstimateFormDialog';
import ListDialog from './estimate/ListDialog';

// 用紙の既定(ISSUE-P-011): チラシ既定条件に合う一般的な用紙。辞書に無ければ先頭にフォールバック
const DEFAULT_PAPER = 'コート90';
const DEFAULT_QTY = '3000';

export default function EstimateTool({ estimates, papers, records }: { estimates: EstimateRow[]; papers: Paper[]; records: ToolRecord[] }) {
  const paperFamily = new Map(papers.map((p) => [p.name, p.family]));
  const paperNames = papers.map((p) => p.name);
  const defaultPaper = paperNames.includes(DEFAULT_PAPER) ? DEFAULT_PAPER : (paperNames[0] ?? '');
  const isMobile = useMediaQuery(MOBILE_QUERY);

  // ── 入力 ──
  const [type, setType] = useState(TYPES[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [paper, setPaper] = useState(defaultPaper);
  const [color, setColor] = useState(COLORS[0]);
  const [qty, setQty] = useState(DEFAULT_QTY);
  const [qtyErr, setQtyErr] = useState('');
  const [ds, setDs] = useState(DATA_STATES[0]);
  const [reuse, setReuse] = useState(REUSES[0]);
  // 特記・要望(WO-023)。空なら意味検索をしない(外に送らない)
  const [request, setRequest] = useState('');
  const [reqErr, setReqErr] = useState('');
  const [running, startRun] = useTransition(); // 意味検索の返事を待っている間
  // 加工のチェックは画面の状態(DOM)をそのまま読む。React の状態に写すと、チェックの付け方によっては
  // 画面にはチェックが見えるのに叩き台に渡らないことがあった(WO-016・対象外の表示の件)
  const finRef = useRef<HTMLFieldSetElement>(null);
  const readFin = () => FINS.filter((v) => finRef.current?.querySelector<HTMLInputElement>(`input[value="${v}"]`)?.checked);
  // 表示(「変更」の札・条件が変わった帯)のためだけの写し。叩き台を作るときは上の readFin() で DOM から読む
  const [finView, setFinView] = useState<string[]>([]);

  const [resPaper, setResPaper] = useState(''); // 叩き台を出した時点の用紙名(記録時に送る)
  const [res, setRes] = useState<Result | null>(null);
  // 画面の開閉の状態(表示だけ)
  const [condOpen, setCondOpen] = useState(true);                   // スマホで条件の入力欄を開いているか
  const [basisOpen, setBasisOpen] = useState<boolean | null>(null); // 根拠の欄(null=まだ叩き台を作っていない)
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  const [recorded, setRecorded] = useState(false);                  // いまの叩き台を記録したか

  // 叩き台を作るための条件を読む。数量が不正なら null
  // 数量は黙って直さない(F-02・F-03)。不正なら叩き台を出さず、前の結果も消して入力と結果が食い違わないようにする
  function readQuery(): Query | null {
    const q1 = parseQty(qty);
    if (q1 === null) { setQtyErr(QTY_ERROR); setRes(null); return null; }
    setQtyErr('');
    return {
      type, size, family: paperFamily.get(paper) ?? '', color,
      qty: q1, finishing: readFin(), dataState: ds, reuse,
    };
  }
  // 結果を出す。sims=文の意味の近さ(自由文が空・使えないときは null=条件の点だけ)
  function apply(q: Query, text: string, sims: Similarities | null, sem: SemanticState) {
    const { basis, strong } = rank(q, estimates, sims);
    setResPaper(paper);
    setRes({ q, text, sem, detect: detect(q), basis, strong, draft: buildDraft(basis, q) });
    // 表示の初期化: いちばん似た1件だけ行を開く・記録の札を「未記録」に戻す
    const top = basis.length ? basis.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
    setOpenRows(new Set(top ? [top.r.id] : []));
    setRecorded(false);
  }
  // 結果を出した直後の画面の動き。スマホでは条件をたたみ、叩き台の見出しへ移る(F-25)
  function showResult() {
    if (basisOpen === null) setBasisOpen(!isMobile); // 最初の1回だけ: PC は根拠を開く・スマホはたたむ
    if (isMobile) {
      setCondOpen(false);
      requestAnimationFrame(() => {
        const h = document.getElementById('h-draft');
        if (!h) return;
        h.scrollIntoView({ block: 'start' });
        h.focus({ preventScroll: true });
      });
    }
  }
  // ボタン・Enter から叩き台を作る。自由文があるときだけ、サーバーで文の意味の近さを測ってから出す(WO-023)
  function runAndShow() {
    if (running) return;
    const q = readQuery();
    if (!q) return;
    const text = request.trim();
    if (text.length > REQUEST_MAX) { setReqErr(REQUEST_ERROR); setRes(null); return; }
    setReqErr('');
    if (!text) { apply(q, '', null, { kind: 'none' }); showResult(); return; }
    startRun(async () => {
      let sem: SemanticState;
      let sims: Similarities | null = null;
      try {
        const r = await semanticScores(text);
        if (!r.ok && r.reason === 'invalid') { setReqErr(r.message); setRes(null); return; }
        if (r.ok) {
          sims = r.sims;
          sem = { kind: 'ok', matched: Object.values(r.sims).filter((v) => meaningPoints(v) > 0).length };
        } else {
          sem = { kind: 'off', message: r.message };
        }
      } catch {
        sem = { kind: 'off', message: 'サーバーにつながらなかったため' }; // 通信が切れたときも、条件の点だけで出す(止めない)
      }
      apply(q, text, sims, sem);
      showResult();
    });
  }

  // ── 登録/編集フォーム(Server Action・登録後も閉じずにメッセージ表示) ──
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<EstimateRow | null>(null); // null=新規登録 / row=編集
  const [saveMsg, setSaveMsg] = useState<FormState>(null);
  const [saving, startSave] = useTransition();
  const [newNonce, setNewNonce] = useState(0); // 新規フォームを初期化するための再マウントキー
  const formKey = editing ? `edit-${editing.id}` : `new-${newNonce}`;
  const formOpener = useRef<HTMLElement | null>(null); // 閉じたときにフォーカスを戻す先(F-23)

  // ── 一覧・照会・削除 ──
  const listRef = useRef<HTMLDialogElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listOpener = useRef<HTMLElement | null>(null);
  const skipListReturn = useRef(false); // 一覧から登録・編集へ移るときは、一覧を閉じてもフォーカスを戻さない
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, startDelete] = useTransition();
  const [listMsg, setListMsg] = useState<FormState>(null);
  const [recMsg, setRecMsg] = useState<FormState>(null);

  // 開いたら最初の入力欄へ(F-23: 以前はフォーカスが画面の外に残った)
  const focusFirstField = () => requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus());
  // 一覧から登録・編集へ移るときは一覧を閉じ、閉じたときの戻り先は一覧を開いたボタンにする
  function leaveListFor() {
    if (listRef.current?.open) {
      skipListReturn.current = true;
      formOpener.current = listOpener.current;
      listRef.current.close();
    } else {
      formOpener.current = document.activeElement as HTMLElement | null;
    }
  }
  function openCreate() { leaveListFor(); setEditing(null); setSaveMsg(null); setNewNonce((n) => n + 1); dialogRef.current?.showModal(); focusFirstField(); }
  function openEdit(r: EstimateRow) { leaveListFor(); setEditing(r); setSaveMsg(null); dialogRef.current?.showModal(); focusFirstField(); }

  function onSaveSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const isEdit = !!editing;
    startSave(async () => {
      const r = await saveEstimate(null, fd);
      setSaveMsg(r);
      dialogRef.current?.querySelector('.dlg-scroll')?.scrollTo({ top: 0 }); // 結果の文はダイアログの上に出すので、上まで戻して見せる(F-12)
      if (r?.ok && !isEdit) setNewNonce((n) => n + 1); // 新規登録が成功したら、次の入力用にフォームだけ初期化(画面は閉じない)
    });
  }

  function openList() {
    listOpener.current = document.activeElement as HTMLElement | null;
    setListMsg(null); setFilter(''); setTypeFilter(''); setDeletingId(null);
    listRef.current?.showModal();
    requestAnimationFrame(() => filterRef.current?.focus());
  }
  function onListClose() {
    if (skipListReturn.current) { skipListReturn.current = false; return; }
    listOpener.current?.focus();
  }
  function doDelete(id: number, fromRecords = false) {
    startDelete(async () => {
      const r = await deleteEstimate(id);
      setDeletingId(null);
      if (fromRecords) setRecMsg(r); else setListMsg(r);
    });
  }

  // ── メモ検索(DBのILIKE) ──
  const [kw, setKw] = useState('');
  const [searchedKw, setSearchedKw] = useState(''); // 検索した時点の語(結果の文に使う。入力中の語ではなく)
  const [kwTried, setKwTried] = useState(false); // 一度でも検索ボタンを押したか(空欄のときの案内を出すため)
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
  const [histOpen, setHistOpen] = useState(false);
  const recAmountRef = useRef<HTMLInputElement>(null);
  const canRecord = !!res?.draft;
  // エラーのときは確定金額の欄へ移る(スマホの下の操作バーから押したとき、エラーがバーの陰にならないように)
  const showAmountField = () => requestAnimationFrame(() => {
    recAmountRef.current?.scrollIntoView({ block: 'center' });
    recAmountRef.current?.focus({ preventScroll: true });
  });
  function record() {
    if (!res || !res.draft) return;
    const amount = /^\d+$/.test(recAmount.trim()) ? Number(recAmount.trim()) : 0;
    if (amount < 1) { setRecMsg({ ok: false, message: '確定金額は1円以上の整数で入力してください(例: 13500)' }); showAmountField(); return; }
    const shownDraft = res.draft.amount;
    startRecord(async () => {
      const r = await recordFinalAmount({
        type: res.q.type, size: res.q.size, paper: resPaper, color: res.q.color, qty: res.q.qty,
        finishing: res.q.finishing, dataState: res.q.dataState, reuse: res.q.reuse,
        amount, reason: recReason,
        request: res.text, shownDraft, // 自由文も送り、サーバーが同じ手順で叩き台を再計算する(WO-023)
      });
      setRecMsg(r);
      if (r?.ok) { setRecAmount(''); setRecReason(''); setRecorded(true); setHistOpen(true); }
      else showAmountField();
    });
  }

  const notesRows = res ? res.strong.filter((t) => t.r.rework) : [];

  // ── 根拠の説明(F-09・F-10)。計算式は変えず、scoring.ts が出した値を言葉にするだけ ──
  const topPct = res?.basis.length ? Math.max(...res.basis.map((t) => t.pct)) : 0;
  const best = res?.basis.length ? res.basis.reduce((a, b) => (b.pct > a.pct ? b : a)) : null; // いちばん似た案件
  const bestGap = best && res?.draft ? (res.draft.unitEst / unitOf(best.r) - 1) * 100 : 0; // 叩き台の単価との差(%)
  const sameType = !!res && res.strong.length > 0; // 根拠が同じ種類の案件か(無ければ別の種類で代用している)
  const weak = !!res?.draft && (!sameType || topPct < WEAK_PCT);
  const explain: Explain = { topPct, best, bestGap, sameType, weak };

  // ── 表示用: 初期値との違い・叩き台を出した条件・条件の食い違い ──
  const values: ConditionValues = { type, size, paper, color, qty, ds, reuse };
  const defaults: ConditionValues = { type: TYPES[0], size: SIZES[0], paper: defaultPaper, color: COLORS[0], qty: DEFAULT_QTY, ds: DATA_STATES[0], reuse: REUSES[0] };
  const finText = (f: string[]) => (f.length ? f.join('・') : '加工なし');
  const short = (t: string) => (t.length > 24 ? `${t.slice(0, 24)}…` : t); // 条件の1行・帯に出す特記は先頭24文字まで
  const qtyText = (raw: string) => { const n = parseQty(raw); return n === null ? (raw.trim() || '(空)') : `${n.toLocaleString()}部`; };
  const condItems = res ? [
    { value: res.q.type, changed: res.q.type !== defaults.type },
    { value: res.q.size, changed: res.q.size !== defaults.size },
    { value: resPaper, changed: resPaper !== defaults.paper },
    { value: res.q.color, changed: res.q.color !== defaults.color },
    { value: `${res.q.qty.toLocaleString()}部`, changed: String(res.q.qty) !== defaults.qty },
    { value: finText(res.q.finishing), changed: res.q.finishing.length > 0 },
    { value: res.q.dataState, changed: res.q.dataState !== defaults.ds },
    { value: res.q.reuse, changed: res.q.reuse !== defaults.reuse },
    ...(res.text ? [{ value: `特記: ${short(res.text)}`, changed: true }] : []),
  ] : [];
  const changes: Change[] = [];
  if (res) {
    const add = (label: string, from: string, to: string) => { if (from !== to) changes.push({ label, from, to }); };
    add('種類', res.q.type, type);
    add('サイズ', res.q.size, size);
    add('用紙', resPaper, paper);
    add('色', res.q.color, color);
    add('数量', `${res.q.qty.toLocaleString()}部`, qtyText(qty));
    add('加工', finText(res.q.finishing), finText(finView));
    add('支給データ', res.q.dataState, ds);
    add('流用', res.q.reuse, reuse);
    // 特記は全文で比べ、帯には先頭だけを出す(長い文が先頭24文字だけ同じでも「変わった」と出すため)
    if (res.text !== request.trim()) changes.push({ label: '特記・要望', from: res.text ? short(res.text) : '(なし)', to: request.trim() ? short(request.trim()) : '(なし)' });
  }

  const recordInDraft = canRecord && !isMobile; // PC は叩き台の中(内訳の右)に記録欄を置く
  const recordPanel = (standalone: boolean) => (
    <RecordPanel
      res={res} canRecord={canRecord} recorded={recorded} standalone={standalone} showButton={!(isMobile && canRecord)}
      recAmount={recAmount} setRecAmount={setRecAmount} recReason={recReason} setRecReason={setRecReason}
      recording={recording} onRecord={record} recMsg={recMsg} amountRef={recAmountRef}
      records={records} histOpen={histOpen} setHistOpen={setHistOpen}
      deletingId={deletingId} setDeletingId={setDeletingId} deleting={deleting} onDelete={(id) => doDelete(id, true)}
    />
  );
  const draftAmount = res?.draft?.amount ?? null;
  const showBar = isMobile && draftAmount !== null;

  return (
    <div className={`app${showBar ? ' has-mbar' : ''}`}>
      <AppBar count={estimates.length} onOpenList={openList} onOpenCreate={openCreate} />

      <div className="layout">
        <ConditionPanel
          values={values} defaults={defaults}
          set={{ setType, setSize, setPaper, setColor, setQty, setDs, setReuse }}
          papers={papers} qtyErr={qtyErr} finRef={finRef} finView={finView} onFinChange={() => setFinView(readFin())}
          onRun={runAndShow}
          request={request} setRequest={setRequest} reqErr={reqErr} running={running}
          collapsed={isMobile && !!res && !condOpen} onExpand={() => setCondOpen(true)} hasResult={!!res}
          summary={condItems.map((c, i) => <span key={i}>{i > 0 && ' / '}{c.changed ? <b>{c.value}</b> : c.value}</span>)}
          showMechanism={!isMobile}
        />

        <main className="out" aria-label="叩き台と根拠">
          {res && <StaleNotice changes={changes} onRerun={runAndShow} />}

          {!res ? (
            <section className="pane" aria-labelledby="h-empty">
              <div className="empty">
                <h2 id="h-empty" className="empty-title">まだ叩き台はありません</h2>
                <p className="small">{isMobile ? '上' : '左'}の条件を入れて「類似案件を検索して叩き台を作る」を押すと、過去見積 {estimates.length}件から条件の近い案件を探して、叩き台と内訳、その根拠をここに出します。</p>
              </div>
              <ul className="ghost-rows" aria-hidden="true">
                <li><div className="ghost w55" /><div className="ghost" /><div className="ghost" /></li>
                <li><div className="ghost w40" /><div className="ghost" /><div className="ghost" /></li>
              </ul>
            </section>
          ) : (
            <>
              {/* 叩き台が出ないとき(根拠が0件)も、判定に当たれば出力の先頭に帯を出す */}
              {!res.draft && <JudgeBand hits={res.detect} />}
              <DraftPanel res={res} ex={explain} condItems={condItems} recordSlot={recordInDraft ? recordPanel(false) : null} />
              <SemanticNotice sem={res.sem} />
              <BasisList
                sem={res.sem}
                basis={res.basis} notesRows={notesRows} total={estimates.length} sameType={sameType}
                bestId={best?.r.id ?? null} open={basisOpen ?? !isMobile} onToggle={setBasisOpen}
                openRows={openRows}
                onToggleRow={(id) => setOpenRows((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              />
            </>
          )}

          {/* 記録欄は常に出す(D60)。PC で叩き台があるときは叩き台の中、それ以外はここ */}
          {!recordInDraft && recordPanel(true)}

          <MemoSearch kw={kw} setKw={setKw} onSearch={onSearch} isSearching={isSearching} searchRes={searchRes} searchedKw={searchedKw} kwTried={kwTried} />
          {isMobile && <Mechanism light />}
        </main>
      </div>

      {showBar && draftAmount !== null && <MobileActionBar amount={draftAmount} recording={recording} onRecord={record} />}

      <EstimateFormDialog
        dialogRef={dialogRef} formKey={formKey} editing={editing} saveMsg={saveMsg} saving={saving}
        papers={papers} defaultPaper={defaultPaper} onSubmit={onSaveSubmit}
        onClose={() => formOpener.current?.focus()}
      />

      <ListDialog
        listRef={listRef} filterRef={filterRef} estimates={estimates}
        filter={filter} setFilter={setFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} listMsg={listMsg}
        deletingId={deletingId} setDeletingId={setDeletingId} deleting={deleting} onDelete={(id) => doDelete(id)}
        onEdit={openEdit} onOpenCreate={openCreate} onClose={onListClose}
      />
    </div>
  );
}
