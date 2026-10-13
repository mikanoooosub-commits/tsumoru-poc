import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Neon の接続文字列はサーバ側のみ(.env.local / Vercel 環境変数)。クライアントに出さない。
// 前後の空白・引用符は除去する(ISSUE-P-003: Vercel の環境変数は囲みクォートを値に含めたまま渡すため)
const connectionString = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '');
if (!connectionString) {
  throw new Error('DATABASE_URL が未設定です(.env.local に Neon の接続文字列を入れてください)');
}

const client = neon(connectionString);
export const db = drizzle(client, { schema });
export { schema };
