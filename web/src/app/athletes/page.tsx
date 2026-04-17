import AthletesTable from './AthletesTable';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

type User = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
};

type Membership = {
  id: string;
  type: string;
  visits_left: number | null;
  visits_total: number | null;
  valid_to: string;
  is_frozen: boolean;
};

async function fetchAthletes() {
  try {
    const res = await fetch(`${BACKEND_URL}/users`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const users: User[] = await res.json();
    return users.filter((u) => u.role === 'athlete' || u.role === 'admin');
  } catch {
    return [];
  }
}

async function fetchMembership(userId: string): Promise<Membership | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/memberships/${userId}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function AthletesPage() {
  const users = await fetchAthletes();
  const athletes = await Promise.all(
    users.map(async (u) => ({
      ...u,
      membership: await fetchMembership(u.id),
    }))
  );

  const total = athletes.length;
  const withMembership = athletes.filter((a) => a.membership).length;
  const debtors = total - withMembership;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">👥 Атлеты</h1>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Всего атлетов</p>
            <p className="text-2xl font-bold">{total}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">С абонементом</p>
            <p className="text-2xl font-bold text-green-400">{withMembership}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Без абонемента</p>
            <p className="text-2xl font-bold text-red-400">{debtors}</p>
          </div>
        </div>

        <AthletesTable initialAthletes={athletes} />
      </div>
    </main>
  );
}
