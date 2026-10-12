# change-log — 変更管理表(つもる ― 見積アシスト PoC)

対象: `poc-next/`(Next.js 版 PoC)の仕様・スキーマ・公開状態に影響する変更。
運用: 仕様・スキーマに影響する変更はここに記録する。不具合起点の変更は [issue-log.md](issue-log.md) のIDと相互参照する。
採番: `CHANGE-P-nnn`(P = PoC)。判断の経緯はルートの `decisions.md`(D番号)に残す。

> **起票の根拠**: 本表は 2026-10-12(WO-002)に、git履歴・`docs/SPEC.md` §10・ルート `bugs.md`・`decisions.md` から**後追いで起こした**もの。
> 開発当時は個別に起票していないため、日付は「根拠にした記録の日付」で、同日内の前後関係は不明。コミットは 08-11 の `d784b54` に Phase 1 がまとまっており、実装日(08-10)は SPEC と bugs の記述による。

| ID | 日付 | 変更内容 | 理由 | 影響範囲 | 関連 |
|---|---|---|---|---|---|
| CHANGE-P-001 | 2026-07-27 | 技術構成とスキーマを設計確定: Next.js(App Router)+Neon+Drizzle+Vercel、3NFの3テーブル(customers / papers / estimates)、カテゴリ列は ENUM、加工は `text[]`、用紙は papers 辞書。認証なし | 静的HTML(`poc/Poc.html`)では「過去見積を登録して溜める」本来の価値が出せない。意味検索(pgvector)へ将来拡張できる Postgres を選定 | 設計のみ(実装は別) | D38 / SPEC.md §2・§3 |
| CHANGE-P-002 | 2026-08-09 | プロジェクト初期化(`create-next-app`)。コミット `3109cae` | 実装の土台 | `poc-next/` 新設 | git |
| CHANGE-P-003 | 2026-08-10 | **Phase 1 実装**: 過去見積の登録・一覧・編集・削除(フルCRUD)、語句検索(ILIKE)、類似検索・叩き台・対象外5型判定(静的PoC のロジックを `lib/scoring.ts` に移植)、確定金額の記録(画面内のみ)、合成(仮)36件のシード。マイグレーション `drizzle/0000_*.sql`。コミット `d784b54`(08-11)にまとめて収録 | 静的PoCを「書き込めるWebアプリ」にするため(Phase 1 のスコープ) | `src/**` 全体、DB(3テーブル+ENUM7種)。画面は別ルートを作らず `/` のモーダルに集約 | SPEC.md §1・§4・§10 / D34 |
| CHANGE-P-004 | 2026-08-10 | 登録成功後にダイアログを**閉じない**ように変更(`useEffect` の自動クローズを廃止、`useTransition`+手動制御、新規のみ再マウントキーでフォーム初期化) | 成功メッセージが見えず、連続登録もできなかった(ユーザー報告) | `src/components/EstimateTool.tsx` | ISSUE-P-001(B1) |
| CHANGE-P-005 | 2026-08-10 | 手動登録の `code` を insert 後の id から `E-{id:3桁}` で**自動採番**。既存の `code=null` 2件を E-037 / E-038 に一度だけ埋め戻し(スクリプトは実行後に削除) | 一覧で `#id` 表示となり、シードの `E-00x` と不統一だった | `src/app/actions.ts`(`saveEstimate`)、DBデータ2件 | ISSUE-P-002(B2) / D39 |
| CHANGE-P-006 | 2026-08-10 | `docs/SPEC.md` を as-built 化(照会/編集/削除の追加=フルCRUD、別ルート案の不採用、`code` 自動採番の明記) | 設計書と実装の食い違いを解消 | `docs/SPEC.md` §1・§3・§4・§9・§10 | SPEC.md §10 |
| CHANGE-P-007 | 2026-08-11 | **本番公開**: GitHub リポジトリ(`tsumoru-poc`)へ push、Vercel に import、環境変数 `DATABASE_URL` を設定。初回ビルドは接続文字列のクォートで失敗 → Vercel 側の値から前後の `"` を削除して Redeploy で成功。**コード変更なし** | PoC を URL で見せられる状態にする | Vercel プロジェクト / 環境変数。公開URL `https://tsumoru-poc-lovat.vercel.app/` | ISSUE-P-003(B3) / [deploy-runbook.md](deploy-runbook.md) |
| CHANGE-P-008 | 2026-08-13 | 結果表示を2カラム化・横幅拡大(デスクトップの画面を活用)。コミット `1003d67` | 結果が縦に長く、デスクトップで余白が大きかった | `src/app/globals.css`・`EstimateTool.tsx`(表示のみ) | git |
| CHANGE-P-009 | 2026-08-13 | 引合いが対象外5型に**該当しない**ときの「範囲内(自動見積対象内)」バナーを非表示に。該当時の警告は残す。コミット `95ac31b` | 「定型だから力を入れるな」と読め、引合いを断る示唆になって逆効果(ユーザー指摘) | `EstimateTool.tsx`(表示のみ。叩き台・類似案件は従来どおり) | D40(バナー削除の方。※ID重複あり → ISSUE-P-013) / D33 |
| CHANGE-P-010 | 2026-10-12 | `docs/` に as-built ドキュメント6点(architecture / change-log / issue-log / test-scenarios / HANDOVER / deploy-runbook)と `screenshots/` を追加。あわせて `docs/SPEC.md` 冒頭の**公開状態の記述のみ**を実態(本番公開済み・URL)に修正(「デプロイは未実施」→公開済み、§7 の見出し注記) | 参照プロジェクト並みの品質へ(D41 / WO-002)。SPEC の「未実施」は実態と矛盾していた | `docs/**` のみ。**コード・DB・環境変数は不変** | WO-002 / D41 / ISSUE-P-004 |

## 未起票・今後の変更候補(起票は着手時)

| 候補 | 内容 | 関連 |
|---|---|---|
| 確定金額の永続化 | 「確定金額の記録」を `estimates.draft_amount` / `reason` に保存し、乖離分析できるようにする(PoC合格ラインの測定手段=D34) | ISSUE-P-005 |
| `DATABASE_URL` のクォート防御 | `src/db/index.ts` で前後のクォートを除去する1行(再発防止案) | ISSUE-P-003 |
| 認証の導入 | 公開デモのまま誰でも削除できる状態の解消(顧客実データを入れる前に必須) | ISSUE-P-012 |
| Phase 2 意味検索 | `embedding` 列(pgvector)の追加 | SPEC.md §6 |
