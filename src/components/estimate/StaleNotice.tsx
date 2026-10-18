// 条件を変えたのに叩き台が前の条件のままのときの帯(F-13)。引き直すかどうかは使う人が決める
export type Change = { label: string; from: string; to: string };

export default function StaleNotice({ changes, onRerun }: { changes: Change[]; onRerun: () => void }) {
  if (changes.length === 0) return null;
  const list = changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('、');
  return (
    <div className="stale" role="status">
      <p><b>▲ 条件が変わりました({list})。</b>下の案件と叩き台は前の条件のままです。</p>
      <button type="button" className="btn outline" onClick={onRerun}>引き直して叩き台を作る</button>
    </div>
  );
}
