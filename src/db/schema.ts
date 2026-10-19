import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  date,
  timestamp,
  vector,
} from 'drizzle-orm/pg-core';

// ── ENUM(選択肢を縛る。辞書テーブルにしない=過剰分割を避ける) ──
export const statusEnum = pgEnum('estimate_status', [
  'reference', // 参照用(シード・過去の確定見積)
  'draft', // ツールが出した叩き台
  'confirmed', // 確定
  'issued', // 発行
]);
export const sourceEnum = pgEnum('estimate_source', ['seed', 'manual', 'tool']);
export const typeEnum = pgEnum('product_type', [
  'チラシ',
  'リーフレット/パンフ',
  'ポスター',
  '名刺',
  '封筒',
  '冊子/カタログ',
  'パッケージ/紙器',
  'シール/ラベル',
  'DM',
  'POP/販促',
]);
export const sizeEnum = pgEnum('size_type', [
  'A4', 'A3', 'A5', 'B4', 'B5', 'B2', '名刺', '長3', '角2', 'ハガキ', 'その他',
]);
export const colorEnum = pgEnum('color_type', [
  '両面4C', '片面4C', '2C', '両面1C', '片面1C', '特色1C', '特色2C', '前回色合わせ',
]);
export const dataStateEnum = pgEnum('data_state_type', [
  '完全データ', 'ラフ・要組版', '手書き・要デザイン',
]);
export const reuseEnum = pgEnum('reuse_type', ['新規', '前回流用可']);

// ── customers(顧客) ──
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── papers(用紙辞書。paper→family の推移的従属をここに閉じる) ──
export const papers = pgTable('papers', {
  name: text('name').primaryKey(), // 例: コート90
  family: text('family').notNull(), // 例: コート系
});

// ── estimates(見積。参照↔叩き台↔確定を status で表現) ──
export const estimates = pgTable('estimates', {
  id: serial('id').primaryKey(),
  code: text('code'), // 表示コード(E-001)
  name: text('name').notNull(), // 案件名
  customerId: integer('customer_id').references(() => customers.id), // S3の受け皿
  status: statusEnum('status').notNull().default('reference'),
  source: sourceEnum('source').notNull().default('seed'),
  // 仕様(= 類似スコアの軸)
  type: typeEnum('type').notNull(),
  size: sizeEnum('size').notNull(),
  paper: text('paper').references(() => papers.name), // family は JOIN で取得
  color: colorEnum('color').notNull(),
  qty: integer('qty').notNull(),
  finishing: text('finishing').array().notNull().default(sql`'{}'::text[]`),
  dataState: dataStateEnum('data_state').notNull(),
  reuse: reuseEnum('reuse').notNull(),
  // 金額
  amount: integer('amount').notNull(), // 見積金額(価格)。スコアの単価計算に使用
  cost: integer('cost').notNull(), // 原価(粗利率は amount/cost から算出=保存しない)
  draftAmount: integer('draft_amount'), // ツールの叩き台(乖離分析用)
  // 自由文(検索対象)
  reason: text('reason'), // 補正理由
  rework: text('rework'), // 手戻り事由
  note: text('note'), // メモ
  // その他
  leadDays: integer('lead_days'),
  date: date('date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  // 意味検索(WO-023): 案件の文を Voyage AI(voyage-4・1024次元)で埋め込んだもの。pgvector の vector 型。
  // NULL 許容(append-only。既存の INSERT は列を指定しないため)。NULL の行は「意味の点 0」として扱う(計算には使わない)
  embedding: vector('embedding', { dimensions: 1024 }),
  embeddingModel: text('embedding_model'), // どのモデルで作ったか(モデルを替えたとき、古い埋め込みを見分けて作り直すため)
});

export type Estimate = typeof estimates.$inferSelect;
export type NewEstimate = typeof estimates.$inferInsert;
