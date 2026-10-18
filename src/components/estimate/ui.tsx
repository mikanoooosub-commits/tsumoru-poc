// 見積画面で共通に使う小さな部品と入力の補助(EstimateTool から移したもの。挙動は変えていない)
import type { FormState } from '@/app/actions';
import { type EstimateRow, marginOf } from '@/lib/scoring';

// 根拠が弱いとみなす類似度(%)の境目(F-10)。上位の類似度がこれ未満なら注意を出す
export const WEAK_PCT = 50;

export const codeOf = (r: { code: string | null; id: number }) => r.code ?? `#${r.id}`;

// 「仮」の印(design-tokens §2.5)。色だけでなく字で示す
export const Kari = () => <span className="kari">仮</span>;

// 粗利率の表示。金額0円の行は割れないので「—」(F-04: 以前は「NaN %」と出た)
export const fmtMargin = (r: EstimateRow) => {
  const m = marginOf(r);
  return m === null ? '—' : `${m.toFixed(0)}%`;
};

// 数値欄に入ったら中身を全選択する(F-04: 既存の値に打った数字が連結されないように)。
// クリックで入ったときは、ボタンを離した瞬間に選択が解けるので、その1回だけ解除を止める
// (すでに入力中の欄をクリックしたときは止めない=カーソル位置を選べる)。
export const selectOnFocus = {
  onMouseDown: (e: React.MouseEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) e.currentTarget.dataset.selectOnUp = '1';
  },
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
  onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => {
    if (e.currentTarget.dataset.selectOnUp) { e.preventDefault(); delete e.currentTarget.dataset.selectOnUp; }
  },
};

// Enter で実行する(日本語入力の変換確定の Enter では動かさない)
export function onEnter(e: React.KeyboardEvent<HTMLInputElement>, fn: () => void) {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); fn(); }
}

// 結果メッセージ(記号+文字。成功は status、失敗は alert として読み上げられる)
export function Msg({ m }: { m: FormState }) {
  if (!m) return null;
  return (
    <p className={`msg ${m.ok ? 'ok' : 'ng'}`} role={m.ok ? 'status' : 'alert'}>
      <span aria-hidden="true">{m.ok ? '✓' : '!'}</span>
      <span>{m.ok ? '' : 'エラー: '}{m.message}</span>
    </p>
  );
}

// 削除の確認(その場に出す。何を消すかを書き、動詞のボタンにする)
export function DeleteConfirm({ label, deleting, onConfirm, onCancel }: {
  label: string; deleting: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <>
      <span className="confirm">{label} を削除しますか?</span>
      <button type="button" className="btn text danger" disabled={deleting} onClick={onConfirm}>{deleting ? '削除中…' : '削除する'}</button>
      <button type="button" className="btn text" onClick={onCancel}>やめる</button>
    </>
  );
}
