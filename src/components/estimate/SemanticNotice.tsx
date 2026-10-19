// 意味検索(WO-023)を使えなかったとき・文に近い過去案件が無かったときの1行。根拠の欄をたたんでいても見えるよう、欄の外に出す。
// 自由文が空(none)と、使えて意味の点が付いた(ok・matched>0)ときは何も出さない
import type { SemanticState } from './types';

export default function SemanticNotice({ sem }: { sem: SemanticState }) {
  if (sem.kind === 'none') return null;
  if (sem.kind === 'ok' && sem.matched > 0) return null;
  const text = sem.kind === 'off'
    ? `文の意味の近さは使えませんでした(${sem.message})。根拠は条件の近さだけで選んでいます。`
    : '入力した文に意味の近い過去案件はありませんでした。根拠は条件の近さだけで選んでいます。';
  return (
    <p className="sem-note" role="status" data-v="sem-note" data-kind={sem.kind}>
      <span aria-hidden="true">i</span><span>{text}</span>
    </p>
  );
}
