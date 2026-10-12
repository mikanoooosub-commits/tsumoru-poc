# deploy-runbook — 公開・更新・戻し方(つもる ― 見積アシスト PoC)

作成: 2026-10-12(WO-002) / 対象: `poc-next/`
> **秘密情報は本書に書かない**。接続文字列・キーの「値」は Vercel / `.env.local` にだけある。
> 確認できていないことは **【推測・要確認】**。この手順書はコードとドキュメントから起こしたもので、Vercel/Neon の管理画面は(本WOでは)開いていない。

## 1. 構成の一覧

| 項目 | 内容 |
|---|---|
| 本番URL | https://tsumoru-poc-lovat.vercel.app/ (2026-10-12 に HTTP 200 を確認) |
| ソース | GitHub `mikanoooosub-commits/tsumoru-poc`(ブランチ `master`) |
| ホスティング | Vercel(GitHub 連携で `master` への push が自動デプロイ【推測・要確認: Production Branch の設定】) |
| DB | Neon(サーバーレス Postgres)。接続は HTTP(`@neondatabase/serverless`) |
| 環境変数 | `DATABASE_URL` の1つだけ(Vercel の Project Settings → Environment Variables / ローカルは `poc-next/.env.local`) |
| フレームワーク | Next.js 16.3.0 / React 19 / Drizzle ORM |
| 公開日 | 2026-08-11(初回ビルド失敗 → 修正して成功。ISSUE-P-003) |
| 認証 | なし(公開デモ)。→ ISSUE-P-012 |

**重要: ローカルと本番は同じ Neon DB を共有している。** ローカルで登録・削除すると本番の画面に即反映される。

## 2. `DATABASE_URL` の書き方(必須・B3)

- **クォート無しの「裸のURL」**で設定する。`postgresql://` で始まり `sslmode=require` で終わる文字列を、そのまま貼る。
- **誤り**: `"postgresql://…"`(前後にダブルクォート)。**ローカルの dotenv は囲みクォートを除去する**ので `.env.local` ではクォート付きでも動くが、**Vercel は値の一部として保持する**ため、ビルドが `neon()` の「not a valid URL」で失敗する(ISSUE-P-003 / 元 bugs.md B3)。
- `.env.local` から値をコピーするときは、**クォートの内側だけ**をコピーする。値をチャット・コミット・ドキュメントに貼らない。
- 設定後は **Redeploy** が必要(環境変数の変更は既存デプロイに反映されない)。
- 値を差し替えるときは Neon 側のパスワード再発行(漏えい時)も忘れず、Vercel と `.env.local` の両方を更新する。

## 3. 通常のデプロイ(コードを更新する)

```bash
cd poc-next
npm install              # 依存が変わったとき
npm run lint             # 任意。ビルド前の確認
git add -A && git commit -m "何を・なぜ"
git push origin master   # → Vercel が自動でビルド・デプロイ【推測】
```

1. Vercel の Deployments で、新しいデプロイが **Ready** になるのを待つ。
2. 本番URLを開き、「Neon 全N件」が表示され、叩き台が出ることを確認する。
3. **`npm run build` をローカルの `npm run dev` 稼働中に実行しない**(`.next` が競合する)。

## 4. DBスキーマを変えるとき

スキーマの正は `src/db/schema.ts`。変更は **append-only**(カラム追加は NULL 許容から)を基本にする(共通規約 `db-change` に従う)。

```bash
npm run db:generate      # drizzle/ にマイグレーションSQLを生成(内容を必ず目視)
npm run db:migrate       # Neon に適用 ← 本番DBに効く
```

- **本番DBと共有なので、適用前に戻しSQLとバックアップ(Neon のブランチ/スナップショット【推測・要確認】)を用意する。**
- コードのデプロイとDB適用の順序: カラム追加は「DB適用 → コードデプロイ」。列の削除・改名は2段階に分ける。
- `npm run db:push` は差分を直接適用する。**本番では使わない**(履歴が残らない)。
- シード(`npm run db:seed`)は**全表を delete してから**36件を入れ直す。**本番DBに対して実行すると登録済みデータが全部消える**。初回構築専用。

## 5. 戻し方(ロールバック)

### 5-1. アプリを直前の状態に戻す(コードの不具合・表示崩れ)
1. Vercel → 対象プロジェクト → **Deployments**。
2. 直前の **Production** デプロイ(正常だったもの)を開く。
3. **Promote to Production**(または「Instant Rollback」)を押す。
4. 本番URLで表示を確認する。再ビルドは走らず、数十秒で切り替わる。
5. 原因を直したら通常のデプロイ(§3)で上書きする。

> 注意: Promote で戻るのは**コードだけ**。DBの中身・スキーマは戻らない。
> 【推測・要確認】Rollback 後に `master` へ新しい push があると自動デプロイが再び走るため、直すまで push しない。

### 5-2. Git 側を戻す(履歴を残す方法)
```bash
git revert <問題のコミット>   # 打ち消しコミットを作る(履歴を壊さない)
git push origin master
```
`reset --hard` や force push は、先に戻す手段(バックアップ)を用意してから(共通規約)。

### 5-3. DBを戻す
- データを誤って消した/書き換えた場合: **Neon の履歴復元(Point-in-Time Restore)またはブランチ復元**が候補【推測・要確認: プランの保持期間・操作手順は未確認】。
- 合成シードの初期状態に戻すだけなら `npm run db:seed`(**全データが消える**。登録した案件も失われる)。
- スキーマ変更を戻す場合は、変更時に用意した戻しSQLを使う(§4)。

### 5-4. 環境変数の誤りで落ちた場合
`DATABASE_URL` の修正(§2)→ Redeploy。直前の Production への Promote でも復旧できる(環境変数は Deployment に紐づく【推測・要確認】)。

## 6. ローカルの立ち上げ

```bash
cd poc-next
npm install
# .env.local を作り DATABASE_URL を設定(値は Neon の管理画面から。コミットしない)
npm run dev              # http://localhost:3000
```
- `.env.local` は `.gitignore` 済み。**値をコミット・チャット・ドキュメントに出さない。**
- 起動時に `DATABASE_URL が未設定です` で止まる場合は `.env.local` を確認(`src/db/index.ts`)。
- **ローカルの操作は本番DBに効く**(§1)。試験で登録・削除するなら、先に Neon のブランチを切って `DATABASE_URL` をそちらにする【推測・要確認】。

## 7. 公開前チェックリスト

- [ ] 合成(仮)データのままか(実在の顧客データを入れる前に、認証と開発/本番DBの分離を ― ISSUE-P-012)
- [ ] `DATABASE_URL` は裸のURLか(§2)
- [ ] ビルドが通る(`npm run build`。dev 停止中に)
- [ ] 本番URLで叩き台が出る・全件数が正しい
- [ ] 秘密情報がコミットに含まれていない(`.env*`・接続文字列)
