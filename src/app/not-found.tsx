import Link from 'next/link';

// 存在しないページの画面(既定の英語の画面を出さない)
export default function NotFound() {
  return (
    <main className="wrap">
      <h1>ページが見つかりません</h1>
      <p>お探しのページはありません。<Link href="/">つもる のトップへ戻る</Link></p>
    </main>
  );
}
