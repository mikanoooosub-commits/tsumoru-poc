// 画面の幅が条件に合うか(スマホの並びに切り替えるため)。サーバーで描くときは「合わない」(=PC)として描く
import { useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 760px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
