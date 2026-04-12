const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const DAY_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

type Summary = {
  classes_this_week: number;
  athletes_total: number;
  attendance_rate_30d: number;
  revenue_this_month: number;
};

type RecentClass = {
  start_at: string;
  type: string;
  trainer_name: string;
  booked_count: number;
  attended_count: number;
  attendance_pct: number;
};

type Debtor = {
  name: string;
  telegram_id: number | null;
  visits_left: number | null;
  valid_to: string | null;
};

async function fetchSummary(): Promise<Summary> {
  try {
    const res = await fetch(`${BACKEND_URL}/stats/summary`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return { classes_this_week: 0, athletes_total: 0, attendance_rate_30d: 0, revenue_this_month: 0 };
  }
}

async function fetchRecentClasses(): Promise<RecentClass[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/stats/recent-classes`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
}

async function fetchDebtors(): Promise<Debtor[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/stats/debtors`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${DAY_RU[d.getDay()]} ${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function BoxerIcon() {
  const K = '#1e293b'; // outline
  const S = '#fbbf24'; // skin
  const B = '#3b82f6'; // shirt
  const R = '#ef4444'; // gloves
  const G = '#6b7280'; // shorts
  const L = '#e2e8f0'; // legs

  // [col, row, color] — pixel size 3, canvas 16×16 → 48×48
  const px: [number, number, string][] = [
    // head
    [7,1,K],[8,1,K],[9,1,K],[10,1,K],
    [6,2,K],[7,2,S],[8,2,S],[9,2,S],[10,2,K],
    [6,3,K],[7,3,S],[8,3,K],[9,3,S],[10,3,K],
    [6,4,K],[7,4,S],[8,4,S],[9,4,S],[10,4,K],
    [6,5,K],[7,5,K],[8,5,K],[9,5,K],[10,5,K],
    // body
    [5,6,K],[6,6,B],[7,6,B],[8,6,B],[9,6,B],[10,6,B],[11,6,K],
    [3,7,R],[4,7,K],[6,7,B],[7,7,B],[8,7,B],[9,7,B],[10,7,B],[12,7,K],[13,7,R],
    [3,8,R],[4,8,K],[6,8,B],[7,8,B],[8,8,B],[9,8,B],[10,8,B],[12,8,K],[13,8,R],
    [5,9,K],[6,9,B],[7,9,B],[8,9,B],[9,9,B],[10,9,B],[11,9,K],
    [5,10,K],[6,10,B],[7,10,B],[8,10,B],[9,10,B],[10,10,B],[11,10,K],
    // shorts
    [6,11,K],[7,11,G],[8,11,G],[9,11,G],[10,11,K],
    [6,12,G],[7,12,G],[8,12,G],[9,12,G],[10,12,G],
    // legs
    [6,13,L],[7,13,L],[9,13,L],[10,13,L],
    [6,14,L],[7,14,L],[9,14,L],[10,14,L],
    // shoes
    [5,15,K],[6,15,K],[7,15,K],[9,15,K],[10,15,K],[11,15,K],
  ];

  return (
    <svg width="48" height="48" viewBox="0 0 48 48" shapeRendering="crispEdges"
         xmlns="http://www.w3.org/2000/svg">
      {px.map(([col, row, fill], i) => (
        <rect key={i} x={col * 3} y={row * 3} width={3} height={3} fill={fill} />
      ))}
    </svg>
  );
}

function AttendanceBadge({ pct }: { pct: number }) {
  const color =
    pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`font-mono ${color}`}>{pct}%</span>;
}

export default async function DashboardPage() {
  const [summary, recentClasses, debtors] = await Promise.all([
    fetchSummary(),
    fetchRecentClasses(),
    fetchDebtors(),
  ]);

  const metrics = [
    { label: 'Тренировок за неделю', value: summary.classes_this_week, color: 'text-white' },
    { label: 'Атлетов всего', value: summary.athletes_total, color: 'text-white' },
    { label: 'Посещаемость (30 дн.)', value: `${summary.attendance_rate_30d}%`, color:
        summary.attendance_rate_30d >= 70 ? 'text-green-400' :
        summary.attendance_rate_30d >= 50 ? 'text-yellow-400' : 'text-red-400' },
    { label: 'Выручка за месяц', value: `${summary.revenue_this_month} €`, color: 'text-white' },
  ];

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <BoxerIcon />
          Дашборд
        </h1>

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {metrics.map((m) => (
            <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">{m.label}</p>
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Recent classes */}
        <h2 className="text-xl font-semibold mb-4">Последние тренировки</h2>
        {recentClasses.length === 0 ? (
          <p className="text-gray-400 mb-10">Нет данных.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800 mb-10">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Дата</th>
                  <th className="px-4 py-3 text-left">Тип</th>
                  <th className="px-4 py-3 text-left">Тренер</th>
                  <th className="px-4 py-3 text-center">Записалось</th>
                  <th className="px-4 py-3 text-center">Пришло</th>
                  <th className="px-4 py-3 text-center">Посещаемость</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {recentClasses.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {formatDate(c.start_at)}{' '}
                      <span className="text-gray-400">{formatTime(c.start_at)}</span>
                    </td>
                    <td className="px-4 py-3 capitalize">{c.type}</td>
                    <td className="px-4 py-3">{c.trainer_name}</td>
                    <td className="px-4 py-3 text-center font-mono">{c.booked_count}</td>
                    <td className="px-4 py-3 text-center font-mono">{c.attended_count}</td>
                    <td className="px-4 py-3 text-center">
                      <AttendanceBadge pct={c.attendance_pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Debtors */}
        <h2 className="text-xl font-semibold mb-4">
          Должники{' '}
          {debtors.length > 0 && (
            <span className="text-sm font-normal text-red-400">({debtors.length})</span>
          )}
        </h2>
        {debtors.length === 0 ? (
          <p className="text-gray-400">Должников нет.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Имя</th>
                  <th className="px-4 py-3 text-left">Telegram ID</th>
                  <th className="px-4 py-3 text-center">Визитов осталось</th>
                  <th className="px-4 py-3 text-left">Абонемент до</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {debtors.map((d, i) => (
                  <tr key={i} className="hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-gray-400">{d.telegram_id ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {d.visits_left === null ? (
                        <span className="text-gray-500">—</span>
                      ) : (
                        <span className={d.visits_left === 0 ? 'text-red-400 font-bold' : 'text-yellow-400'}>
                          {d.visits_left}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {d.valid_to ? (
                        <span className="text-yellow-400">{d.valid_to}</span>
                      ) : (
                        <span className="text-red-400">Нет абонемента</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
