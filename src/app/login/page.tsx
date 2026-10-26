import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { hasSession, MSG_UNSET } from '@/lib/auth';
import { authConfig } from '@/lib/session';
import { LogoMark } from '@/components/estimate/AppBar';
import LoginForm from './LoginForm';

// ログイン画面(WO-024・D92)。全体がログイン制で、ログインしていないと見えるのはこの画面だけ。
// 「仮 合成データ」の札と問い合わせ先は出さない(WO どおり)。合言葉を知らない人向けに、LP の動画の案内を1行(WO-024 Q4)。

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ログイン ― つもる' };

export default async function LoginPage() {
  if (await hasSession()) redirect('/');
  const configured = authConfig().ok;

  return (
    <>
      <header className="appbar ink-zone">
        <div className="brand">
          <LogoMark />
          <span className="brand-name">つもる</span>
        </div>
      </header>
      <main className="login">
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title" className="login-title">つもる ― 見積アシスト</h1>
          {configured ? (
            <>
              <p>合言葉を入れると、見積の画面が開きます。</p>
              <LoginForm />
            </>
          ) : (
            <p className="msg ng" role="alert">
              <span aria-hidden="true">!</span>
              <span>
                {MSG_UNSET}
                <br />
                <span className="login-admin">管理者の方へ: 設定の手順は docs/deploy-runbook.md にあります。</span>
              </span>
            </p>
          )}
          <p className="login-foot">
            合言葉をお持ちでない方へ: デモの様子は <a href="https://riceparrow.com/">riceparrow.com</a> の動画でご覧になれます。
          </p>
        </section>
      </main>
    </>
  );
}
