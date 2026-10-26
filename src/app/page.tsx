import { getEstimates, getPapers, getToolRecords } from '@/db/queries';
import EstimateTool from '@/components/EstimateTool';
import { requirePage } from '@/lib/auth';

// 登録後に最新の母集団を表示するため毎リクエスト取得
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requirePage(); // DB を読む前にログインを確かめる(proxy を外れても DB に届かない・WO-024)
  const [estimates, papers, records] = await Promise.all([getEstimates(), getPapers(), getToolRecords()]);
  return <EstimateTool estimates={estimates} papers={papers} records={records} />;
}
