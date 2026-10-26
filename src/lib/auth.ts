import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, createSessionToken, verifySessionToken } from './session';

// ログインの確かめ(WO-024)。守りは2段:
//   1段目 src/proxy.ts … 入口で cookie を見てふるい分ける(DB は見ない)
//   2段目 ここ … ページの描画と、export しているすべての Server Action の先頭で確かめる
// 2段目が要る理由: Server Action は使われているページへの POST として届くので、proxy の対象から外れたり、
// 場所が変わったりすると proxy を通らない。Next.js 16 の公式ドキュメントも「Server Function の中で毎回確かめる」としている
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md の Server Functions の注記)。

export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

// ページ用。ログインしていなければログイン画面へ
export async function requirePage(): Promise<void> {
  if (!(await hasSession())) redirect('/login');
}

// Server Action 用。false なら、呼ぶ側は DB・Voyage に触る前に返す
export async function requireAction(): Promise<boolean> {
  return hasSession();
}

export const MSG_UNSET = '合言葉がまだ設定されていないため、いまは入れません。';
export const AUTH_EXPIRED = 'ログインの有効期限が切れました。ページを開き直して、合言葉を入れてください';

// ログイン状態の cookie を付ける(httpOnly・Secure・SameSite=Lax・7日)
export async function startSession(secret: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(secret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
