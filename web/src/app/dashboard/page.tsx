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
    { label: 'Выручка за месяц', value: `${summary.revenue_this_month} руб.`, color: 'text-white' },
  ];

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">📊 Дашборд</h1>

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
