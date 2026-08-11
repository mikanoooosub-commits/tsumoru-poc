CREATE TYPE "public"."color_type" AS ENUM('両面4C', '片面4C', '2C', '両面1C', '片面1C', '特色1C', '特色2C', '前回色合わせ');--> statement-breakpoint
CREATE TYPE "public"."data_state_type" AS ENUM('完全データ', 'ラフ・要組版', '手書き・要デザイン');--> statement-breakpoint
CREATE TYPE "public"."reuse_type" AS ENUM('新規', '前回流用可');--> statement-breakpoint
CREATE TYPE "public"."size_type" AS ENUM('A4', 'A3', 'A5', 'B4', 'B5', 'B2', '名刺', '長3', '角2', 'ハガキ', 'その他');--> statement-breakpoint
CREATE TYPE "public"."estimate_source" AS ENUM('seed', 'manual', 'tool');--> statement-breakpoint
CREATE TYPE "public"."estimate_status" AS ENUM('reference', 'draft', 'confirmed', 'issued');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('チラシ', 'リーフレット/パンフ', 'ポスター', '名刺', '封筒', '冊子/カタログ', 'パッケージ/紙器', 'シール/ラベル', 'DM', 'POP/販促');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"customer_id" integer,
	"status" "estimate_status" DEFAULT 'reference' NOT NULL,
	"source" "estimate_source" DEFAULT 'seed' NOT NULL,
	"type" "product_type" NOT NULL,
	"size" "size_type" NOT NULL,
	"paper" text,
	"color" "color_type" NOT NULL,
	"qty" integer NOT NULL,
	"finishing" text[] DEFAULT '{}'::text[] NOT NULL,
	"data_state" "data_state_type" NOT NULL,
	"reuse" "reuse_type" NOT NULL,
	"amount" integer NOT NULL,
	"cost" integer NOT NULL,
	"draft_amount" integer,
	"reason" text,
	"rework" text,
	"note" text,
	"lead_days" integer,
	"date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papers" (
	"name" text PRIMARY KEY NOT NULL,
	"family" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_paper_papers_name_fk" FOREIGN KEY ("paper") REFERENCES "public"."papers"("name") ON DELETE no action ON UPDATE no action;