import NewClassModal from './NewClassModal';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const DAY_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

type Class = {
  id: string;
  type: string;
  start_at: string;
  duration_min: number;
  capacity: number;
  booked: number;
  location: string | null;
  is_cancelled: boolean;
  trainer: { id: string; name: string } | null;
};

async function fetchClasses(): Promise<Class[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/classes?week=current`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
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

export default async function SchedulePage() {
  const classes = await fetchClasses();

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">📅 Расписание</h1>
          <NewClassModal />
        </div>

        {classes.length === 0 ? (
          <p className="text-gray-400">Тренировок на этой неделе нет.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Дата</th>
                  <th className="px-4 py-3 text-left">Время</th>
                  <th className="px-4 py-3 text-left">Тип</th>
                  <th className="px-4 py-3 text-left">Тренер</th>
                  <th className="px-4 py-3 text-left">Локация</th>
                  <th className="px-4 py-3 text-center">Мест</th>
                  <th className="px-4 py-3 text-center">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {classes.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-gray-900 transition-colors ${
                      c.is_cancelled ? 'opacity-40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">{formatDate(c.start_at)}</td>
                    <td className="px-4 py-3">{formatTime(c.start_at)}</td>
                    <td className="px-4 py-3 capitalize">{c.type}</td>
                    <td className="px-4 py-3">{c.trainer?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{c.location ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`font-mono ${
                          c.booked >= c.capacity ? 'text-red-400' : 'text-green-400'
                        }`}
                      >
                        {c.booked}/{c.capacity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.is_cancelled ? (
                        <span className="text-red-500 text-xs">Отменена</span>
                      ) : (
                        <span className="text-green-500 text-xs">Активна</span>
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
