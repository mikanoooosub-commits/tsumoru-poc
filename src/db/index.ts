import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Neon の接続文字列はサーバ側のみ(.env.local / Vercel 環境変数)。クライアントに出さない。
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL が未設定です(.env.local に Neon の接続文字列を入れてください)');
}

const client = neon(connectionString);
export const db = drizzle(client, { schema });
export { schema };
