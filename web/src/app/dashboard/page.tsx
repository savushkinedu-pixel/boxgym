import AttendanceChart from './AttendanceChart';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const DAY_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

type Summary = {
  total_athletes: number;
  active_memberships: number;
  visits_today: number;
  visits_month: number;
  no_show_rate: number;
  revenue_month: number;
};

type AttendancePoint = { date: string; count: number };

type TopClass = {
  class_id: string;
  type: string;
  start_at: string;
  trainer_name: string;
  attended_count: number;
  capacity: number;
};

type LostAthlete = {
  user_id: string;
  name: string;
  last_visit: string | null;
  days_absent: number | null;
};

async function fetchJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return fallback;
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

export default async function DashboardPage() {
  const [summary, attendance, topClasses, lostAthletes] = await Promise.all([
    fetchJSON<Summary>('/stats/summary', {
      total_athletes: 0, active_memberships: 0,
      visits_today: 0, visits_month: 0,
      no_show_rate: 0, revenue_month: 0,
    }),
    fetchJSON<AttendancePoint[]>('/stats/attendance?period=month', []),
    fetchJSON<TopClass[]>('/stats/classes/top', []),
    fetchJSON<LostAthlete[]>('/stats/athletes/lost?days=14', []),
  ]);

  const cards = [
    { label: 'Атлетов', value: summary.total_athletes },
    { label: 'Активных абонементов', value: summary.active_memberships },
    { label: 'Визитов сегодня', value: summary.visits_today },
    { label: 'Визитов за месяц', value: summary.visits_month },
  ];

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <img src="/box.png" alt="boxer" style={{ height: '80px', imageRendering: 'pixelated' }} />
          Дашборд
        </h1>

        {/* 4 metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {cards.map((c) => (
            <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">{c.label}</p>
              <p className="text-2xl font-bold text-white">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Attendance chart */}
        <h2 className="text-xl font-semibold mb-4">Посещаемость за 30 дней</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-10">
          <AttendanceChart data={attendance} />
        </div>

        {/* Top-5 classes */}
        <h2 className="text-xl font-semibold mb-4">Топ-5 тренировок по заполняемости</h2>
        {topClasses.length === 0 ? (
          <p className="text-gray-400 mb-10">Нет данных.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800 mb-10">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Дата</th>
                  <th className="px-4 py-3 text-left">Тип</th>
                  <th className="px-4 py-3 text-left">Тренер</th>
                  <th className="px-4 py-3 text-center">Пришло</th>
                  <th className="px-4 py-3 text-center">Вместимость</th>
                  <th className="px-4 py-3 text-center">Заполняемость</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {topClasses.map((c) => {
                  const pct = c.capacity > 0 ? Math.round((c.attended_count / c.capacity) * 100) : 0;
                  const color = pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
                  return (
                    <tr key={c.class_id} className="hover:bg-gray-900 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {formatDate(c.start_at)}{' '}
                        <span className="text-gray-400">{formatTime(c.start_at)}</span>
                      </td>
                      <td className="px-4 py-3 capitalize">{c.type}</td>
                      <td className="px-4 py-3">{c.trainer_name}</td>
                      <td className="px-4 py-3 text-center font-mono">{c.attended_count}</td>
                      <td className="px-4 py-3 text-center font-mono">{c.capacity}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-mono ${color}`}>{pct}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Lost athletes */}
        <h2 className="text-xl font-semibold mb-4">
          Не приходили 14+ дней{' '}
          {lostAthletes.length > 0 && (
            <span className="text-sm font-normal text-orange-400">({lostAthletes.length})</span>
          )}
        </h2>
        {lostAthletes.length === 0 ? (
          <p className="text-gray-400">Все атлеты активны.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Имя</th>
                  <th className="px-4 py-3 text-left">Последний визит</th>
                  <th className="px-4 py-3 text-center">Дней без визита</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {lostAthletes.map((a) => (
                  <tr key={a.user_id} className="hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {a.last_visit ?? <span className="text-gray-600">никогда</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.days_absent !== null ? (
                        <span className={a.days_absent >= 30 ? 'text-red-400 font-bold' : 'text-orange-400'}>
                          {a.days_absent}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
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
