# HANDOVER — つもる ― 見積アシスト PoC(poc-next)

作成: 2026-10-12(WO-002) / 状態: Phase 1 実装済み・本番公開済み・ドキュメント整備済み
> 新しい作業者(人/AI)が、この1枚と下記リンクで同じ状態から再開できることを目的にする。真実の所在はファイル(会話ではない)。

## 1. これは何か
地場印刷会社向けの見積支援PoC。過去見積を溜め、引合い条件に似た過去案件から**叩き台・自動見積の対象外判定・手戻り注意**を出す。AI研修課題(印刷業界リサーチ)の成果物。
- 本番: https://tsumoru-poc-lovat.vercel.app/ ／ リポジトリ: GitHub `mikanoooosub-commits/tsumoru-poc`(`master`)
- 構成: Next.js 16 + Neon(Postgres)+ Drizzle + Vercel。認証なし。データは合成(仮)36件+登録分(現在38件)。

## 2. 読む順番
1. [SPEC.md](SPEC.md) — 設計と判断(as-built)
2. [architecture.md](architecture.md) — 構成図・Server Action・テーブル
3. [issue-log.md](issue-log.md) / [change-log.md](change-log.md) — 不具合と変更の履歴
4. [test-scenarios.md](test-scenarios.md) — 何をどこまで確認したか(スクショは `screenshots/`)
5. [deploy-runbook.md](deploy-runbook.md) — 公開・戻し方
6. **`AGENTS.md`**(Next.js 16 は学習済みの知識と違う。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読む)
7. 上位の判断記録: ルート `decisions.md`(D30〜D34・D38・D39・D40・D41)、`bugs.md`(B1〜B3)

## 3. やったこと(2026-10-12 時点)
- Phase 1: 過去見積の登録・一覧・編集・削除、語句検索(ILIKE)、類似検索→叩き台、対象外5型判定(出典リンク付き)、確定金額の記録(画面内のみ)。36件シード。Vercel 公開。
- 不具合3件を修正(B1 登録後ダイアログ / B2 コード自動採番 / B3 Vercel のクォート)。
- WO-002 で as-built ドキュメント6点+画面確認(スクショ12枚)を整備。`docs/SPEC.md` の公開状態の記述を修正。

## 4. やらなかったこと(意図的)
| 項目 | 理由 |
|---|---|
| 認証 | 公開デモの方針(SPEC §1)。実データを入れる前に必須(ISSUE-P-012) |
| 意味検索(pgvector) | Phase 2(SPEC §6)。まず語句検索で成立させる |
| 見積書PDF・メール連携・MIS連携 | S3本体。PoCの対象外(SPEC §8) |
| 確定金額のDB保存 | 未実装(ISSUE-P-005)。`draft_amount`/`reason` 列は受け皿だけある |
| 書込みを伴う画面確認 | 本番DB共有のため WO-002 では実施せず(test-scenarios T-13〜T-16) |
| コードの修正 | WO-002 はドキュメント化のみ。見つけた不具合は issue-log に起票し、直しは別WO |

## 5. 既知の課題(優先度の目安)
| ID | 内容 | 優先 |
|---|---|---|
| ISSUE-P-012 | 認証なし×本番DB共有。誰でも削除可、ローカル操作も本番に効く | 高(実データ投入前) |
| ISSUE-P-005 | 確定金額が保存されない。PoC合格ラインの測定ができない | 中 |
| ISSUE-P-011 | 既定の用紙が「PP(特殊紙)」 | 低(直しやすい) |
| ISSUE-P-006〜010 | 非アトミックな採番・エラー文面・存在しないid・ILIKE・ENUM二重定義 | 低 |
| ISSUE-P-013 | `decisions.md` の D40 重複・D38 パス(PM判断) | 低 |

## 6. 再開手順
```bash
cd poc-next
npm install
# .env.local に DATABASE_URL を設定(値は Neon の管理画面。コミットしない・チャットに貼らない)
npm run dev            # http://localhost:3000
```
- 動作確認の手順は test-scenarios.md を参照。**書込み操作は本番DBに効く**ので、先に Neon のブランチを分けるか、読み取りだけにする。
- 本番へ出す・戻す手順は deploy-runbook.md。`DATABASE_URL` は**クォート無し**(B3)。
- コード変更後は、architecture.md(構成・Action・テーブル)と change-log.md を同じ変更で更新する。

## 7. 次の一手(提案・未着手)
1. 開発用 Neon ブランチの用意と、test-scenarios T-13〜T-16 の実施(WO起票)。
2. 確定金額の永続化(ISSUE-P-005)。ただし認証/書込み先の扱いを先に決める。
3. 用紙の既定値と並び順(ISSUE-P-011)。
4. `src/db/index.ts` のクォート除去防御(ISSUE-P-003 の再発防止案)。
5. (WO-001 の結果次第)提案デッキとの整合 — デッキが主張する数値・機能と、このPoCの実装範囲が合っているか。
