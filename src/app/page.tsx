import { getEstimates, getPapers } from '@/db/queries';
import EstimateTool from '@/components/EstimateTool';

// 登録後に最新の母集団を表示するため毎リクエスト取得
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [estimates, papers] = await Promise.all([getEstimates(), getPapers()]);
  return <EstimateTool estimates={estimates} papers={papers} />;
}
