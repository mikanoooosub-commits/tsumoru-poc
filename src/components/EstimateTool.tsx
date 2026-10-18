'use client';

// 見積画面の本体。状態・叩き台の計算の呼び出し・Server Action の呼び出しはここに集め、
// 画面の部分は src/components/estimate/ の部品に分けている(WO-022)。
import { useRef, useState, useTransition } from 'react';
import {
  type EstimateRow, type Query,
  rank, detect, buildDraft, unitOf,
  TYPES, SIZES, COLORS, FINS, DATA_STATES, REUSES,
} from '@/lib/scoring';
import { parseQty, QTY_ERROR } from '@/lib/input';
import { saveEstimate, deleteEstimate, searchMemos, recordFinalAmount, type FormState } from '@/app/actions';
import type { ToolRecord } from '@/db/queries';
import { Kari, WEAK_PCT } from './estimate/ui';
import type { Paper, MemoRow, Result, Explain } from './estimate/types';
import ConditionPanel from './estimate/ConditionPanel';
import JudgeBand from './estimate/JudgeBand';
import DraftPanel from './estimate/DraftPanel';
import BasisList, { NotesBox } from './estimate/BasisList';
import RecordPanel from './estimate/RecordPanel';
import MemoSearch from './estimate/MemoSearch';
import EstimateFormDialog from './estimate/EstimateFormDialog';
import ListDialog from './estimate/ListDialog';

// 用紙の既定(ISSUE-P-011): チラシ既定条件に合う一般的な用紙。辞書に無ければ先頭にフォールバック
const DEFAULT_PAPER = 'コート90';

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
  const [res, setRes] = useState<Result | null>(null);
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
  const explain: Explain = { topPct, best, bestGap, sameType, weak };

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
        <ConditionPanel
          values={{ type, size, paper, color, qty, ds, reuse }}
          set={{ setType, setSize, setPaper, setColor, setQty, setDs, setReuse }}
          papers={papers} qtyErr={qtyErr} finRef={finRef}
          onRun={run} onOpenCreate={openCreate} onOpenList={openList}
        />

        <div>
          {/* 結果 */}
          {!res ? (
            <div className="placeholder">左で条件を入れて「叩き台を作る」を押すと、判定・叩き台・類似案件がここに表示されます。</div>
          ) : (
            <div className="results">
              {/* 叩き台を出した条件(画面の入力と結果が食い違っていないかを、その場で確かめられるように) */}
              <p className="cond">この条件で出しました: {res.q.type} / {res.q.size} / {resPaper} / {res.q.color} / {res.q.qty.toLocaleString()}部 / 加工: {res.q.finishing.length ? res.q.finishing.join('・') : 'なし'} / {res.q.dataState} / {res.q.reuse}</p>

              {/* 判定(該当したときだけ、結果のいちばん上に全幅で出す) */}
              <JudgeBand hits={res.detect} />

              <div className="rescol">
                <DraftPanel res={res} ex={explain} />
                <NotesBox rows={notesRows} />
              </div>

              <div className="rescol">
                <BasisList basis={res.basis} />
              </div>
            </div>
          )}

          {/* 記録と検索(結果の有無に関わらず常に表示) */}
          <div className="band">
            <RecordPanel
              res={res} resPaper={resPaper} canRecord={canRecord}
              recAmount={recAmount} setRecAmount={setRecAmount} recReason={recReason} setRecReason={setRecReason}
              recording={recording} onRecord={record} recMsg={recMsg}
              records={records} deletingId={deletingId} setDeletingId={setDeletingId}
              deleting={deleting} onDelete={(id) => doDelete(id, true)}
            />
            <MemoSearch kw={kw} setKw={setKw} onSearch={onSearch} isSearching={isSearching} searchRes={searchRes} searchedKw={searchedKw} kwTried={kwTried} />
          </div>
        </div>
      </main>

      <div className="foot">
        仕組み: 引合いの特徴を過去見積と重み付きで突き合わせ(満点122点→100%正規化)、同種の類似上位から単価中央値×数量スケールで叩き台を出す、説明できる方式です。ネット印刷で自動で完結しない条件(人の確認・個別見積が入る)の判定は、各社公式の入稿ガイド・仕様・FAQ に基づきます。データは登録済みの過去見積から取得しています。
      </div>

      <EstimateFormDialog
        dialogRef={dialogRef} formKey={formKey} editing={editing} saveMsg={saveMsg} saving={saving}
        papers={papers} defaultPaper={defaultPaper} onSubmit={onSaveSubmit}
      />

      <ListDialog
        listRef={listRef} estimates={estimates} filter={filter} setFilter={setFilter} listMsg={listMsg}
        deletingId={deletingId} setDeletingId={setDeletingId} deleting={deleting} onDelete={(id) => doDelete(id)}
        onEdit={openEdit} onOpenCreate={openCreate}
      />
    </div>
  );
}
