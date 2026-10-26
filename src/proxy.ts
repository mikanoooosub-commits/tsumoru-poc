import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// 入口のふるい分け(WO-024 の1段目)。cookie の署名と期限だけを見る(DB は見ない)。
// ここを抜けても、ページと Server Action は src/lib/auth.ts で必ずもう一度確かめる(2段目)。
// Next.js 16 では middleware は proxy に名前が変わった(node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)。
export function proxy(req: NextRequest) {
  // ログイン画面だけはログインなしで開ける
  if (req.nextUrl.pathname === '/login') return NextResponse.next();
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  // ページを開こうとした → ログイン画面へ。それ以外(Server Action の POST など)は断る
  if (req.method === 'GET' || req.method === 'HEAD') return NextResponse.redirect(new URL('/login', req.url));
  return new NextResponse('ログインが必要です', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

// 静的ファイル(CSS・JS・フォント)とファビコンだけは通す(止めるとログイン画面が崩れる)。それ以外はすべてここを通る
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
