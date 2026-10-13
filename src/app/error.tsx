'use client';

// 想定外のエラーの画面(既定の英語の画面を出さない)。詳細は画面に出さない。
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap">
      <h1>表示できませんでした</h1>
      <p>画面の読み込み中に問題が起きました。もう一度お試しください。続く場合は、時間をおいて開き直してください。</p>
      <button type="button" className="btn primary" onClick={reset}>もう一度読み込む</button>
    </main>
  );
}
