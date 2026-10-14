# HANDOVER — つもる ― 見積アシスト PoC(poc-next)

作成: 2026-10-12(WO-002) / 更新: 2026-10-13(WO-003) / 状態: Phase 1 実装済み・本番公開済み(※WO-003 の変更は commit のみ・未 push)・ドキュメント整備済み
> 新しい作業者(人/AI)が、この1枚と下記リンクで同じ状態から再開できることを目的にする。真実の所在はファイル(会話ではない)。

## 1. これは何か
地場印刷会社向けの見積支援PoC。過去見積を溜め、引合い条件に似た過去案件から**叩き台・ネット印刷で自動で完結しない条件の判定(旧称: 自動見積の対象外判定)・手戻り注意**を出す。AI研修課題(印刷業界リサーチ)の成果物。
- 本番: https://tsumoru-poc-lovat.vercel.app/ ／ リポジトリ: GitHub `mikanoooosub-commits/tsumoru-poc`(`master`)
- 構成: Next.js 16 + Neon(Postgres)+ Drizzle + Vercel。認証なし。データは合成(仮)36件+登録分(現在38件)。

## 2. 読む順番
1. [SPEC.md](SPEC.md) — 設計と判断(as-built)。画面の決まりは [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)・点検の記録は [design-audit.md](design-audit.md)
2. [architecture.md](architecture.md) — 構成図・Server Action・テーブル
3. [issue-log.md](issue-log.md) / [change-log.md](change-log.md) — 不具合と変更の履歴
4. [test-scenarios.md](test-scenarios.md) — 何をどこまで確認したか(スクショは `screenshots/`)
5. [deploy-runbook.md](deploy-runbook.md) — 公開・戻し方
6. **`AGENTS.md`**(Next.js 16 は学習済みの知識と違う。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読む)
7. 上位の判断記録: ルート `decisions.md`(D30〜D34・D38・D39・D40・D41)、`bugs.md`(B1〜B3)

## 3. やったこと(2026-10-12 時点)
- Phase 1: 過去見積の登録・一覧・編集・削除、語句検索(ILIKE)、類似検索→叩き台、対象外5型判定(出典リンク付き)、確定金額の記録(WO-003 でDB保存に変更)。36件シード。Vercel 公開。
- 不具合3件を修正(B1 登録後ダイアログ / B2 コード自動採番 / B3 Vercel のクォート)。
- WO-002 で as-built ドキュメント6点+画面確認(スクショ12枚)を整備。`docs/SPEC.md` の公開状態の記述を修正。
- WO-009(2026-10-13): 画面を印刷版デザインシステムに整備(DESIGN-SYSTEM.md・design-audit.md)。記録・メモ検索を常時表示に。機能・計算・DBは変更なし。
- WO-003(2026-10-13): 確定金額をDBに保存(P-005。スキーマ変更なし。新しい行を `status='draft'`・`source='tool'`・`cost=0`=原価未入力で insert)。書込み系の画面確認(T-08b・T-13〜T-16・T-20)を実施。P-003 再発防止・P-007/008/009/011 を修正、spec.html 修正。DBの控えと突き合わせツール `scripts/db-snapshot.ts` を追加。

## 4. やらなかったこと(意図的)
| 項目 | 理由 |
|---|---|
| 認証 | 公開デモの方針(SPEC §1)。実データを入れる前に必須(ISSUE-P-012) |
| 意味検索(pgvector) | Phase 2(SPEC §6)。まず語句検索で成立させる |
| 見積書PDF・メール連携・MIS連携 | S3本体。PoCの対象外(SPEC §8) |
| 記録行の昇格(draft→confirmed) | 未実装。昇格時は**原価の入力を必須**にすること(`cost=0` は「未入力」の意味) |
| (解消)書込みを伴う画面確認 | WO-002 では未実施 → WO-003 で実施(D45。試験行は削除し、控えと突き合わせ済) |
| コードの修正 | WO-002 はドキュメント化のみ。見つけた不具合は issue-log に起票し、直しは別WO |

## 5. 既知の課題(優先度の目安)
| ID | 内容 | 優先 |
|---|---|---|
| ISSUE-P-012 | 認証なし×本番DB共有。誰でも削除可、ローカル操作も本番に効く | 高(実データ投入前) |
| ISSUE-P-006 | 採番が insert+update の2段(非アトミック。未再現) | 低(スキーマ変更を伴う) |
| ISSUE-P-010 | ENUM の選択肢が2か所(現時点でずれなし) | 低(スキーマ変更を伴う) |
| (対応済) | P-003 再発防止・P-005・P-007・P-008・P-009・P-011 は WO-003 で対応 | — |
| ISSUE-P-013 | `decisions.md` の D40 重複・D38 パス(PM判断) | 低 |

## 6. 再開手順
```bash
cd poc-next
npm install
# .env.local に DATABASE_URL を設定(値は Neon の管理画面。コミットしない・チャットに貼らない)
npm run dev            # http://localhost:3000
```
- 動作確認の手順は test-scenarios.md を参照。**書込み操作は本番DBに効く**(認証なし・DB共有)。書込み試験は D45 の方針(試験行に `WO003テスト` を入れる→画面から削除→`npx tsx scripts/db-snapshot.ts diff docs/backup/…json` で控えと突き合わせ)で行う。**`npm run db:seed` は全表を消すので実行しない**。
- 本番へ出す・戻す手順は deploy-runbook.md。`DATABASE_URL` は**クォート無し**(B3)。
- コード変更後は、architecture.md(構成・Action・テーブル)と change-log.md を同じ変更で更新する。

## 7. 次の一手(提案・未着手)
1. 認証の導入(ISSUE-P-012)。実データを入れる前に必須。
2. 記録行(draft)を原価入力のうえ confirmed に昇格する機能(原価を必須にする)。cost を nullable にする案はスキーマ変更(db-change)が要る。
3. 採番・ENUM のDB側集約(ISSUE-P-006・010。スキーマ変更)。
4. 用紙の並び順(ISSUE-P-011 の別件)。
5. (WO-001 の結果次第)提案デッキとの整合 — デッキが主張する数値・機能と、このPoCの実装範囲が合っているか。
