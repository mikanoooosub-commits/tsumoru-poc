import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ログイン(合言葉ひとつ・WO-024・D92)の中心。画面・DB には触らない、計算だけの部品。
// proxy(src/proxy.ts)・ページ・Server Action(src/lib/auth.ts 経由)から使う。
//
// ・合言葉 TSUMORU_PASSWORD と署名の鍵 TSUMORU_SESSION_SECRET はサーバーの環境変数だけに置く(NEXT_PUBLIC_ を付けない=ブラウザに出ない)。
//   鍵を合言葉と分けるのは、cookie を1つ盗まれても、そこから合言葉を手元で総当たりできないようにするため(WO-024 段0 1-2)。
// ・どちらかが未設定・短すぎるときは「誰も入れない」に倒す(開いてしまわない)。
// ・ログの中に合言葉・鍵・cookie の値は出さない。

export const SESSION_COOKIE = 'tsumoru_session';
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 有効期限7日(WO-024 Q2)。開くたびの延長はしない
export const PASSWORD_MIN = 12; // これより短い合言葉は未設定と同じ扱い(WO-024 Q3)
export const PASSWORD_INPUT_MAX = 200; // 入力の上限。超えたら比べずに「違います」(大きな入力で重くしない)
const SECRET_MIN = 32; // 鍵の長さの下限(32バイトの乱数を base64url にすると43文字)

// 環境変数の値。前後の空白・囲みの引用符は除く(DATABASE_URL と同じ扱い。ISSUE-P-003)
function envValue(name: string): string {
  return process.env[name]?.trim().replace(/^["']|["']$/g, '') ?? '';
}

export type AuthConfig = { ok: true; password: string; secret: string } | { ok: false };

// 設定がそろっているか。そろっていなければ ok: false(=誰も入れない)
export function authConfig(): AuthConfig {
  const password = envValue('TSUMORU_PASSWORD');
  const secret = envValue('TSUMORU_SESSION_SECRET');
  if (password.length < PASSWORD_MIN || secret.length < SECRET_MIN) return { ok: false };
  return { ok: true, password, secret };
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();
const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body, 'utf8').digest();

// 合言葉の照合。両方を SHA-256 で32バイトにそろえてから timingSafeEqual で比べる
// (=== は最初に違った文字で止まるので、時間から一致した長さが漏れうる。長さもハッシュでそろえて漏らさない)
export function passwordMatches(input: string, password: string): boolean {
  if (input.length === 0 || input.length > PASSWORD_INPUT_MAX) return false;
  return timingSafeEqual(sha256(input), sha256(password));
}

// ログイン状態の札(cookie の値)を作る。中身は「版.期限(ミリ秒).乱数」に HMAC-SHA256 の署名を付けたもの。
// 合言葉そのもの・個人の情報は入れない
export function createSessionToken(secret: string, now = Date.now()): string {
  const exp = now + SESSION_MAX_AGE_SEC * 1000;
  const body = `v1.${exp}.${randomBytes(16).toString('base64url')}`;
  return `${body}.${sign(secret, body).toString('base64url')}`;
}

// 札を確かめる。署名が合い、期限内のときだけ true。形が違う・設定が無いときは必ず false(安全側)
export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const cfg = authConfig();
  if (!cfg.ok || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^\d{1,16}$/.test(parts[1])) return false;
  const body = parts.slice(0, 3).join('.');
  const expected = sign(cfg.secret, body);
  const given = Buffer.from(parts[3], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const exp = Number(parts[1]);
  // 期限切れと、ありえない先の期限(7日+1分より先)は通さない
  return exp > now && exp <= now + SESSION_MAX_AGE_SEC * 1000 + 60_000;
}

// ── 間違いが続いたときの抑え(WO-024 Q5・数は【仮】) ──
// 15分のあいだに5回間違えたら、その IP は15分受け付けない。加えて、失敗のたびに約1秒待ってから返す(login 側)。
// 限界: 回数はこのサーバーのメモリにだけある。Vercel はサーバーを複数立て、使われないと止めるので、
// サーバーどうしで共有されず、止まると消える。決め打ちの並列の攻撃は止めきれない=本当の守りは長い合言葉(docs/deploy-runbook.md)。
export const FAIL_LIMIT = 5;
export const FAIL_WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;
export const FAIL_DELAY_MS = 1000;
const MAX_TRACKED = 1000; // 覚えておく IP の数の上限(メモリを使いすぎない)

type FailEntry = { count: number; first: number; lockedUntil: number };
const failures = new Map<string, FailEntry>();

function prune(now: number) {
  for (const [ip, e] of failures) {
    if (e.lockedUntil <= now && now - e.first > FAIL_WINDOW_MS) failures.delete(ip);
  }
  // それでも多すぎるときは古い順に捨てる(Map は入れた順に並ぶ)
  while (failures.size > MAX_TRACKED) {
    const oldest = failures.keys().next().value;
    if (oldest === undefined) break;
    failures.delete(oldest);
  }
}

export function isLocked(ip: string, now = Date.now()): boolean {
  const e = failures.get(ip);
  return !!e && e.lockedUntil > now;
}

// 失敗を1回数える。このあとロック中になったら true
export function recordFailure(ip: string, now = Date.now()): boolean {
  prune(now);
  let e = failures.get(ip);
  if (!e || now - e.first > FAIL_WINDOW_MS) {
    e = { count: 0, first: now, lockedUntil: 0 };
    failures.set(ip, e);
  }
  e.count += 1;
  if (e.count >= FAIL_LIMIT) e.lockedUntil = now + LOCK_MS;
  return e.lockedUntil > now;
}

export function clearFailures(ip: string) {
  failures.delete(ip);
}
