# つもる ― 見積アシスト (PoC)

地場印刷会社向けの見積支援ツール。過去の見積を溜め、引合い条件に**似た過去案件**から
**見積の叩き台・自動見積対象外の判定・手戻り注意**を出す。AI研修課題（印刷業界リサーチ）の成果物PoC。

- 過去見積の登録・照会・編集・削除（CRUD）
- 引合い条件 → 重み付きスコアで類似案件を提示（満点122点→100%正規化・説明可能）
- 同種の類似上位から単価中央値×数量スケールで叩き台を生成
- ネット印刷の自動見積「対象外」5型の判定（各社公式の入稿ガイド/FAQを一次出典に）
- メモ・手戻り事由の語句検索（Neon の ILIKE）

設計の詳細は [`docs/SPEC.md`](docs/SPEC.md) / [`docs/spec.html`](docs/spec.html) を参照。

## 技術構成

| 層 | 採用 |
|---|---|
| フレームワーク | Next.js 16 (App Router) / React 19 |
| DB | Neon (サーバーレス Postgres) |
| DBアクセス | Drizzle ORM |
| ホスティング | Vercel |

## セットアップ（ローカル）

```bash
npm install
```

`.env.local` に Neon の接続文字列を設定（このファイルは `.gitignore` 済み。**コミットしない**）:

```
DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require
```

初回のみ、スキーマ適用とシード投入:

```bash
npm run db:migrate   # drizzle のマイグレーションを Neon に適用
npm run db:seed      # 合成(仮)の過去見積36件を投入
```

開発サーバ:

```bash
npm run dev
```

http://localhost:3000 を開く。

## デプロイ（Vercel）

1. このリポジトリを Vercel で import
2. 環境変数 `DATABASE_URL` に Neon の接続文字列を設定（サーバ限定。クライアントに露出させない）
3. `git push` で自動デプロイ

## 注意

- 初期データは**合成(仮)**。金額・原価は例示で実勢とは異なる。実運用では自社の過去見積に差し替える。
- `service_role` 等の秘密情報はクライアントに出さない。DBアクセスは Server Action 経由のみ。
