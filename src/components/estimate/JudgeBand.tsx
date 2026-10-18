// ネット印刷で自動で完結しない条件の帯。文言と出典は scoring.ts の detect() の値をそのまま出す(出典より強く言わない・D71/D72)
// 置き場所は叩き台の金額のすぐ下(記録欄より上・WO-022 D 直し3)。叩き台が出ないときは出力の先頭
import type { DetectHit } from '@/lib/scoring';

export default function JudgeBand({ hits }: { hits: DetectHit[] }) {
  if (hits.length === 0) return null;
  return (
    <section className="judge" aria-labelledby="h-detect">
      <h2 id="h-detect"><span className="judge-tag">▲ 自動で完結しない条件 {hits.length}件</span>ネット印刷でも、人の確認や個別の見積が入る条件があります</h2>
      <ul>{hits.map((h, i) => (
        <li key={i}>
          <b data-v="detect-title">{h.t}</b> … {h.d}{h.note && <>。<b>{h.note}</b></>}
          {' ・ 出典: '}{h.links.map(([label, url], j) => (
            <span key={j}>{j > 0 ? ' / ' : ''}<a href={url} target="_blank" rel="noreferrer">{label}</a></span>
          ))}
        </li>
      ))}</ul>
    </section>
  );
}
