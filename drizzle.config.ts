import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// CLI(drizzle-kit / seed)からも .env.local を読む
config({ path: '.env.local' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
