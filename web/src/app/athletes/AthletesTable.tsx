'use client';

import { useState } from 'react';
import AddMembershipModal from './AddMembershipModal';

type Membership = {
  id: string;
  type: string;
  visits_left: number | null;
  visits_total: number | null;
  valid_to: string;
  is_frozen: boolean;
};

type Athlete = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  membership: Membership | null;
};

type Props = {
  initialAthletes: Athlete[];
};

const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]} ${d.getFullYear()}`;
}

function membershipLabel(m: Membership | null): string {
  if (!m) return '—';
  if (m.is_frozen) return '❄️ Заморожен';
  if (m.type === 'unlimited') return `Безлимит до ${formatDate(m.valid_to)}`;
  if (m.type === 'personal') return `Персональный до ${formatDate(m.valid_to)}`;
  return `${m.visits_left ?? 0}/${m.visits_total ?? 0} до ${formatDate(m.valid_to)}`;
}

export default function AthletesTable({ initialAthletes }: Props) {
  const [athletes, setAthletes] = useState(initialAthletes);
  const [debtorsOnly, setDebtorsOnly] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  async function refreshAthlete(userId: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/memberships/${userId}`);
      const membership = res.ok ? await res.json() : null;
      setAthletes((prev) =>
        prev.map((a) => (a.id === userId ? { ...a, membership } : a))
      );
    } catch {
      // silently ignore
    }
  }

  const displayed = debtorsOnly ? athletes.filter((a) => !a.membership) : athletes;

  return (
    <>
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={debtorsOnly}
            onChange={(e) => setDebtorsOnly(e.target.checked)}
            className="accent-orange-500"
          />
          Только без абонемента
        </label>
        <span className="text-xs text-gray-600">{displayed.length} чел.</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Имя</th>
              <th className="px-4 py-3 text-left">Телефон</th>
              <th className="px-4 py-3 text-left">Роль</th>
              <th className="px-4 py-3 text-left">Абонемент</th>
              <th className="px-4 py-3 text-center">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {displayed.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Нет данных
                </td>
              </tr>
            )}
            {displayed.map((a) => (
              <tr key={a.id} className="hover:bg-gray-900 transition-colors">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3 text-gray-400">{a.phone ?? '—'}</td>
                <td className="px-4 py-3 capitalize text-gray-400">{a.role}</td>
                <td className="px-4 py-3">
                  {a.membership ? (
                    <span className="text-green-400">{membershipLabel(a.membership)}</span>
                  ) : (
                    <span className="text-red-400">Нет абонемента</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <AddMembershipModal
                    userId={a.id}
                    userName={a.name}
                    onSuccess={() => refreshAthlete(a.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
