// 見積画面の部品どうしで受け渡す型(DB の型は src/db/queries.ts・計算の型は src/lib/scoring.ts が正)
import type { DetectHit, Query, Scored, buildDraft } from '@/lib/scoring';

export type Paper = { name: string; family: string };

// メモ検索の1行(searchMemos の戻り値)
export type MemoRow = {
  id: number; code: string | null; name: string; rework: string | null; note: string | null;
  reason: string | null; source: string; amount: number; draftAmount: number | null;
};

// 意味検索(WO-023)を使えたか。none=自由文が空 / ok=使えた(matched=意味の点が付いた過去案件の数) / off=使えなかった(理由の文)
export type SemanticState = { kind: 'none' } | { kind: 'ok'; matched: number } | { kind: 'off'; message: string };

// 叩き台を作った結果(EstimateTool の run() が作る)
export type Result = {
  q: Query;
  text: string;          // 叩き台を出した時点の「特記・要望」(前後の空白を除いたもの。空なら '')
  sem: SemanticState;
  detect: DetectHit[];
  basis: Scored[];
  strong: Scored[];
  draft: ReturnType<typeof buildDraft>;
};

// 根拠の説明に使う値(EstimateTool が scoring.ts の結果から求める。計算式は変えない)
export type Explain = {
  topPct: number;
  best: Scored | null;
  bestGap: number;
  sameType: boolean;
  weak: boolean;
};
