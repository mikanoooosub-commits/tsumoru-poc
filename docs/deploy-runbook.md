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
| 環境変数 | `DATABASE_URL`(必須)、`TSUMORU_PASSWORD`・`TSUMORU_SESSION_SECRET`(ログイン・WO-024。**無いと誰も入れない**)、`VOYAGE_API_KEY`(意味検索・WO-023。無ければ意味検索なしで動く)。Vercel の Project Settings → Environment Variables / ローカルは `poc-next/.env.local` |
| 外部 API | Voyage AI(埋め込み。`voyage-4`)。サーバーからだけ呼ぶ。「学習に使わせない」設定にする(代表) |
| フレームワーク | Next.js 16.3.0 / React 19 / Drizzle ORM |
| 公開日 | 2026-08-11(初回ビルド失敗 → 修正して成功。ISSUE-P-003) |
| 認証 | **合言葉ひとつのログイン**(2026-10-26 WO-024・D92)。全体がログイン制。登録の手順は §2-3。人ごとのアカウントは実データの段で → ISSUE-P-012 |

**重要: ローカルと本番は同じ Neon DB を共有している。** ローカルで登録・削除すると本番の画面に即反映される。

## 2. `DATABASE_URL` の書き方(必須・B3)

- **クォート無しの「裸のURL」**で設定する。`postgresql://` で始まり `sslmode=require` で終わる文字列を、そのまま貼る。
- **誤り**: `"postgresql://…"`(前後にダブルクォート)。**ローカルの dotenv は囲みクォートを除去する**ので `.env.local` ではクォート付きでも動くが、**Vercel は値の一部として保持する**ため、ビルドが `neon()` の「not a valid URL」で失敗する(ISSUE-P-003 / 元 bugs.md B3)。
- `.env.local` から値をコピーするときは、**クォートの内側だけ**をコピーする。値をチャット・コミット・ドキュメントに貼らない。
- 設定後は **Redeploy** が必要(環境変数の変更は既存デプロイに反映されない)。
- 値を差し替えるときは Neon 側のパスワード再発行(漏えい時)も忘れず、Vercel と `.env.local` の両方を更新する。

### 2-2. `VOYAGE_API_KEY` の書き方(WO-023)
- `DATABASE_URL` と同じく**クォート無し**で入れる(コードは前後の空白・引用符を除くが、Vercel にはそのまま貼る)。名前に `NEXT_PUBLIC_` を付けない(付けるとブラウザに出る)。
- Vercel は Production に入れる。**入れた後・変えた後は Redeploy**(既存のデプロイには効かない)。push の前に入れておけば、その push のデプロイから効く。
- キーが無い・間違っているときも画面は止まらない(根拠は条件の近さだけで選び、「文の意味の近さは使えませんでした(…)」と出る)。

### 2-3. 合言葉と署名の鍵を登録する(WO-024・**代表の手**)

ログインに使う値は2つ。**どちらも値をチャット・コミット・ドキュメントに書かない。**

| 名前 | 中身 | 覚える? |
|---|---|---|
| `TSUMORU_PASSWORD` | 合言葉。ログイン画面で入れる | 代表が覚える(パスワード管理アプリに保存) |
| `TSUMORU_SESSION_SECRET` | ログイン状態に付ける署名の鍵(乱数) | 覚えなくてよい |

1. **合言葉を決める**。目安は **英数字ランダム16文字以上**、または**関係のない単語4〜5個をつないだもの**(例の形: `kumo-tansu-ringo-hashi-7`。この例そのものは使わない)。**12文字未満は受け付けない**(未設定と同じ扱いになり、誰も入れない)。ほかのサービスと同じものにしない。
   - 理由: 間違いの抑え(15分で5回)はサーバーのメモリだけで、決め打ちの攻撃は止めきれない。長い合言葉なら、試せる回数が多くても当たらない。
2. **鍵を作る**。`poc-next` のフォルダで次の1行を実行し、出てきた文字列(43文字)を使う:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. **ローカル**: `poc-next/.env.local` に2行を足す(クォート無し)。
   ```
   TSUMORU_PASSWORD=<決めた合言葉>
   TSUMORU_SESSION_SECRET=<作った鍵>
   ```
4. **Vercel**: Project → Settings → Environment Variables で、2つを **Production** に追加する(名前に `NEXT_PUBLIC_` を付けない・クォート無し)。Preview・Development には入れなくてよい(入れなければ、プレビュー用のデプロイは誰も入れない=安全側)。
   - 鍵はローカルと同じものでも別のものでもよい(別にすると、ローカルで付けた cookie は本番で使えない。困ることはない)。
5. **入れた後に Redeploy**(既存のデプロイには効かない)。**ログインのコードを push する前に入れておく**と、その push のデプロイから効く。入れずに push すると、本番は「合言葉がまだ設定されていないため、いまは入れません。」の画面になる(データは守られるが、デモできない)。
6. 本番で確かめる: ①ログインせずに開く → ログイン画面 ②合言葉を入れる → 見積の画面 ③右上の「ログアウト」→ ログイン画面。

**入れ替えるとき**(漏れた・人に教えた後など): 合言葉と鍵の**両方**を新しくして、`.env.local` と Vercel を更新 → Redeploy。鍵を変えると、いまログインしている全員がログアウトになる(盗まれた cookie も使えなくなる)。

**間違いを続けてロックされたとき**: 15分待つ。急ぐときは Redeploy でも解ける(回数はサーバーのメモリだけにあるため)。

## 3. 通常のデプロイ(コードを更新する)

```bash
cd poc-next
npm install              # 依存が変わったとき
npm run lint             # 任意。ビルド前の確認
git add -A && git commit -m "何を・なぜ"
git push origin master   # → Vercel が自動でビルド・デプロイ【推測】
```

1. Vercel の Deployments で、新しいデプロイが **Ready** になるのを待つ。
2. 本番URLを開き、ログイン画面が出ること → 合言葉で入って「過去見積 N件」が表示され、叩き台が出ることを確認する。
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
- **WO-023(0001・意味検索の列)は必ず「DB 適用 → push」の順**。Drizzle の insert は全列(新しい `embedding` 列も)を書くので、列が無い DB に新しいコードが載ると登録・記録が失敗する。手順は `work-orders/WO-023-report.md`「PM が行う DB 適用と埋め込みの書き込み」。予行演習と戻しの SQL は `drizzle/rollback/0001_rehearsal.sql`・`0001_down.sql`(戻すときは「コードを戻す → DB を戻す」の順)。
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
`DATABASE_URL` の修正(§2)→ Redeploy。ログイン画面に「合言葉がまだ設定されていない」と出る場合は `TSUMORU_PASSWORD`(12文字以上)と `TSUMORU_SESSION_SECRET`(32文字以上)を確かめる(§2-3)→ Redeploy。直前の Production への Promote でも復旧できる(環境変数は Deployment に紐づく【推測・要確認】)。

## 6. ローカルの立ち上げ

```bash
cd poc-next
npm install
# .env.local を作り DATABASE_URL を設定(値は Neon の管理画面から。コミットしない)
# ログインの TSUMORU_PASSWORD・TSUMORU_SESSION_SECRET も(§2-3。無いとローカルでも入れない)
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
- [ ] 秘密情報がコミットに含まれていない(`.env*`・接続文字列・合言葉・鍵)。リポジトリを公開する前は**履歴全体**を検索する(`git grep -E '<型>' $(git rev-list --all)`。型の一覧は WO-024 の報告)
- [ ] Vercel の Production に `TSUMORU_PASSWORD`・`TSUMORU_SESSION_SECRET` が入っている(§2-3)。ログインせずに開くとログイン画面になる
