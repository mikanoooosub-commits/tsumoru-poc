// スマホの下に固定の操作バー(叩き台があるときだけ)。押すと記録欄と同じ record() を呼ぶ
import { yen } from '@/lib/scoring';
import { BusyLabel } from './ui';

export default function MobileActionBar({ amount, recording, onRecord }: {
  amount: number; recording: boolean; onRecord: () => void;
}) {
  return (
    <div className="mbar" role="region" aria-label="確定金額の記録">
      <p className="mbar-amt"><b>{yen(amount)}</b><span className="mut">叩き台・税抜</span></p>
      <button type="button" className="btn primary" onClick={onRecord} disabled={recording}>
        <BusyLabel busy={recording} busyText="記録中…" text="確定金額を記録する" />
      </button>
    </div>
  );
}
