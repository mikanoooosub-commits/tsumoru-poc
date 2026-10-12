# 見積支援PoC ― Next.js版 設計(SPEC)

> ステータス: **Phase 1 実装済み(as-built)・本番公開済み**(2026-08-11 に GitHub/Vercel へ公開。URL: https://tsumoru-poc-lovat.vercel.app/ 。手順・戻し方は [deploy-runbook.md](deploy-runbook.md))。
> 現行の静的PoC(`poc/Poc.html`)を、登録・保存できるWebアプリにした。本書は実装に合わせた as-built。
> 作成: 2026-07-27 / 最終更新: 2026-10-12 / 上位: scope.md / decisions.md(判断の経緯) / bugs.md(不具合)

## 1. 目的とスコープ

- 現行PoCは「合成データを埋め込んだ静的HTML」。**過去見積を登録して溜め、それを検索・流用して見積の叩き台を出す**という本来の価値を出すには、**書き込みできるDBとWebアプリ**が要る。
- 今回のスコープ(Phase 1): 過去見積の**登録・照会(一覧)・編集・削除**（フルCRUD）、語句**検索(LIKE)**、引合い条件からの**叩き台生成**(現行ロジック流用)、**確定金額の記録**、Vercelへ**公開**。
- 認証は**なし**(誰でも触れる公開デモ)。

## 2. 技術構成(確定)

| 層 | 採用 | 備考 |
|---|---|---|
| フレームワーク | **Next.js(App Router)** | React。UIとサーバ処理を1つに |
| DB | **Neon(サーバーレス Postgres)** | Supabaseの無料枠を使わないため。将来 pgvector で意味検索に拡張可 |
| DBアクセス | **Drizzle ORM** | 型安全・Neon/Turso両対応で乗り換えやすい。SQL文字列を手書きしない |
| ホスティング | **Vercel** | GitHub連携で `git push`→自動デプロイ |
| ソース管理 | **GitHub** | Vercelに必須ではないが推奨(自動デプロイ・履歴・ロールバック) |
| 検索 | **Phase 1: LIKE(ILIKE)** → Phase 2: pgvector 意味検索 | まず語句一致で成立させ、意味検索は後付けの層 |
| 認証 | なし | 公開デモ |

**セキュリティ(CLAUDE.md準拠)**: Neonの接続文字列は**サーバ側のみ**(環境変数)。クライアントに出さない。DBアクセスは Server Action / Route Handler で行い、ブラウザから直接DBに繋がない。

## 3. データモデル(3テーブル・第3正規形)

**方針**: 更新が走る取引データなので **3NF** を基本にする。ただし過剰分割はしない ―
- 選択肢の列(type/size/color/data_state/reuse)は **ENUM / CHECK**(辞書テーブルにしない=コマ切れ回避。スカラなので推移的従属もなく3NF)。
- 加工の複数持ちは **`text[]`**(現代Postgresの実務。厳密1NFではないが許容。加工が自分の属性=原価/納期を持ち始めたら `finishings` へ昇格)。
- 用紙だけは `paper → paper_family` の**推移的従属**を除くため小さな辞書 **papers** に分ける(= paper_family を全行に重複させない)。

### customers(顧客)
| 列 | 型 | 説明 |
|---|---|---|
| id | serial PK | |
| name | text | 顧客名 |
| note | text (null可) | メモ |
| created_at | timestamptz | |

### papers(用紙辞書)
| 列 | 型 | 説明 |
|---|---|---|
| name | text PK | 用紙名(例: コート90) |
| family | text | 用紙系統(例: コート系)。`paper→family` の従属をここに閉じる |

### estimates(見積)
| 列 | 型 | 説明 |
|---|---|---|
| id | serial PK | |
| code | text (null可) | 表示コード。シードは E-001…、**手動登録は insert 後に `E-{id}`(3桁ゼロ埋め)を自動採番**(D39 / bugs.md B2) |
| name | text | 案件名(表示) |
| customer_id | int FK→customers (null可) | どの顧客か(S3の受け皿) |
| status | ENUM(reference/draft/confirmed/issued) | ライフサイクル |
| source | ENUM(seed/manual/tool) | 由来 |
| type | ENUM(種類) | チラシ/名刺… |
| size | ENUM(サイズ) | A4/名刺… |
| paper | text FK→papers(name) | 用紙(family は JOIN で取得) |
| color | ENUM(色) | 両面4C/特色2C… |
| qty | integer | 数量 |
| finishing | text[] | 加工(複数) |
| data_state | ENUM | 支給データの状態 |
| reuse | ENUM | 型・版・色の流用 |
| amount | integer | 見積金額(この見積の価格。スコアの単価計算にも使用) |
| cost | integer | 原価 |
| draft_amount | integer (null可) | ツールが出した叩き台(乖離分析用) |
| reason | text (null可) | 補正理由(自由記述・検索対象) |
| rework | text (null可) | 手戻り事由(検索対象) |
| note | text (null可) | メモ(検索対象) |
| lead_days | integer | 納期(営業日) |
| date | date (null可) | 案件日 |
| created_at / updated_at | timestamptz | |
| (将来) embedding | vector(N) | 意味検索用(Phase 2で追加) |

- **類似検索の母集団** = `status in ('reference','confirmed')`。
- **LIKE検索** = `note / rework / reason ILIKE '%語%'`(ILIKE=大小無視)。将来 `embedding` 列で意味検索。
- **スコアの用紙系統** = `estimates.paper → papers.family` を JOIN で取得。

### ENUM(選択肢を縛る・辞書テーブルにしない)
`type / size / color / data_state / reuse` は ENUM(または CHECK)。`finishing` の各要素はアプリ側で選択肢を制御。

### 将来の拡張(受け皿だけ用意・今は作らない=S3)
| 将来テーブル | 対応S3機能 |
|---|---|
| estimate_items(見積明細: 刷り代/組版/型代) | 見積書発行 |
| assets(型・版・色データ) | 「流用」の実体化(customer/job 紐付け) |
| inquiries(引合い) | メールからの条件抽出 |

→ estimates に `customer_id` を今入れてあるので、これらは後から**足すだけ**(既存データの作り直し不要)。

## 4. 画面とルート

実装は**別ルートを作らず、すべて `/` のクライアントコンポーネント＋モーダル**に集約した(設計時の `/estimates/new` `/estimates` 案は不採用)。

| 画面 | 内容 |
|---|---|
| `/`(本体) | 見積ツール: 引合い条件入力 → 判定(自動見積対象外の5型)・叩き台・類似案件・手戻り注意・削減効果 |
| 登録/編集モーダル | `/` 上のダイアログ。過去見積を1件**登録**、既存を**編集**(同一フォーム、hidden `id` の有無で insert/update を分岐)。**登録・更新の成功後も閉じずメッセージ表示**、新規は連続入力用にフォーム初期化(bugs.md B1) |
| 一覧・削除モーダル | `/` 上のダイアログ。全件**照会**＋絞り込み、各行から**編集/削除**(削除はその場でインライン確認)。更新・削除は即 revalidate で一覧に反映 |
| 確定記録・語句検索 | `/` 内の開閉トグル「▸ 詳しく見る」内。語句検索は Neon へ ILIKE |

現行PoCの見せ方(初期は入力カードのみ→ボタンで結果表示、記録/検索はトグル内)は踏襲。

## 5. 計算ロジックの扱い(現行PoCの流用)

現行の以下は**変えずに移植**(決定的な計算なので `lib/` の共通TS関数にする):
- **スコアリング**(満点122点→100%正規化・種類一致必須)
- **自動見積対象外の判定(5型)** … 出典は sources.C2-b.md の各社公式一次(グラフィック/ラクスル/印刷会社)。画面に実リンク表示
- **叩き台**(同種の類似上位から単価中央値×数量スケール、組版=支給データ状態で加算、型版代)
- **削減効果**(時給2,631円・30分→15分)

置き場所(推奨): 計算は共通TS関数、**DB問い合わせだけ Server Action**。データが小さいので負荷面はどちらでも可。

## 6. 段階(Phase)

- **Phase 1(今回作る)**: 上記の登録・LIKE検索・叩き台・確定記録・36件シード・Vercel公開。
- **Phase 2(将来)**: `embedding` 列(pgvector)を足して**意味検索**。埋め込みは**無料枠つきAPI**(Gemini/Jina等)から始め、必要なら有料APIへ数行で差し替え。次元は最初に固定。

## 7. デプロイの流れ(Phase 1)

> 以下は設計時の流れ。**2026-08-11 に実施済み**(実際の構成・手順・戻し方は [deploy-runbook.md](deploy-runbook.md))。

1. GitHub に新規リポジトリ作成 → Next.js プロジェクトを push
2. Vercel で GitHub リポジトリを import(以後 `git push` で自動デプロイ)
3. Neon でDB作成 → 接続文字列を Vercel の環境変数に登録(サーバ限定)
4. Drizzle でマイグレーション(テーブル作成)→ 36件シード投入
5. 公開URL発行

## 8. やらないこと(S3本体・原則を飛ばさない)

- 認証 / 見積書PDF発行 / メール自動返信 / MIS連携 … S3本体なので今回は作らない。
- 冊子のページ数・固定費(版代/型代)の計算モデル化 … 適用範囲外(現行どおり)。
- 意味検索 … Phase 2 に回す(今回はLIKEまで)。

## 9. 確定した設計判断(2026-07-27)

1. **DBスキーマ** = 3NF の3テーブル(customers / papers / estimates)。カテゴリ列は ENUM、加工は text[]、用紙は papers 辞書(paper→family の従属を排除)。
2. **計算の置き場所** = 共通TS関数＋DB問い合わせは Server Action。
3. **id** = serial + 表示用 `code`。シードは E-001 を保持、**手動登録は `E-{id}` を自動採番**(D39)。削除で欠番は出るが id 一意ゆえコードも一意。
4. **シード** = 現行の合成36件を estimates(status=reference)で投入。
5. **GitHub** = 新規リポジトリで管理 → Vercel 連携。

## 10. 更新履歴

- **2026-07-27**: 初版(設計・相談中)。
- **2026-08-10**: Phase 1 実装完了に合わせ as-built 化。(1)照会/編集/削除を追加=フルCRUD(§1,§4)、(2)別ルート案 `/estimates*` は不採用→全て `/` 上のモーダルに集約(§4)、(3)手動登録の `code` 自動採番を明記(§3,§9)。関連: decisions.md D39 / bugs.md B1,B2。
- **2026-10-12**: 公開状態の記述のみ修正(冒頭ステータス・§7 注記)。2026-08-11 に本番公開済みで、「デプロイは未実施」は実態と不一致だった。他の節は変更なし。関連: change-log.md CHANGE-P-010 / issue-log.md ISSUE-P-004。
