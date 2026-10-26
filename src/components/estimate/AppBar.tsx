// 上の紺の帯(アプリの枠)。過去見積の一覧・登録はダイアログで開く。右端にログアウト(WO-024)
import { Kari } from './ui';
import { logout } from '@/app/login/actions';

export const LogoMark = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.6 L17 6.2 L10 9.8 L3 6.2 Z" />
      <path d="M3 10.2 L10 13.8 L17 10.2" />
      <path d="M3 13.9 L10 17.5 L17 13.9" />
    </svg>
  </span>
);

export default function AppBar({ count, onOpenList, onOpenCreate }: {
  count: number; onOpenList: () => void; onOpenCreate: () => void;
}) {
  return (
    <header className="appbar ink-zone">
      <div className="brand">
        <LogoMark />
        <h1 className="brand-name">つもる</h1>
      </div>
      <nav className="appnav pc-only" aria-label="画面">
        <span className="nav" aria-current="page">見積の叩き台</span>
        <button type="button" className="nav" onClick={onOpenList}>過去見積 <span className="n">{count}件</span></button>
      </nav>
      <div className="appbar-end">
        <span className="on-ink-note pc-only"><Kari /> 合成データ・金額は例示</span>
        <button type="button" className="btn ghost pc-only" onClick={onOpenCreate}>＋ 過去見積を登録</button>
        <button type="button" className="btn ghost sp-only" onClick={onOpenList}>過去見積 {count}件</button>
        <form action={logout} className="logout">
          <button type="submit" className="btn ghost">ログアウト</button>
        </form>
      </div>
    </header>
  );
}
