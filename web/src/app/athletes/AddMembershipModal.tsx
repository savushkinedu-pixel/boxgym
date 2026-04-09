'use client';

import { useState } from 'react';

type Props = {
  userId: string;
  userName: string;
  onSuccess: () => void;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function AddMembershipModal({ userId, userName, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState('visits');
  const [visitsTotal, setVisitsTotal] = useState(12);
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [validTo, setValidTo] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = { user_id: userId, type, valid_from: validFrom, valid_to: validTo };
    if (type === 'visits' || type === 'single') body.visits_total = visitsTotal;

    const res = await fetch(`${BACKEND_URL}/memberships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setLoading(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Ошибка');
      return;
    }
    setOpen(false);
    onSuccess();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1 rounded-lg transition-colors"
      >
        + Начислить
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-1">Новый абонемент</h2>
            <p className="text-gray-400 text-sm mb-5">{userName}</p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Тип</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="visits">Визиты</option>
                  <option value="unlimited">Безлимит</option>
                  <option value="single">Разовый</option>
                  <option value="personal">Персональный</option>
                </select>
              </div>

              {(type === 'visits' || type === 'single') && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Количество визитов</label>
                  <input
                    type="number"
                    min={1}
                    value={visitsTotal}
                    onChange={(e) => setVisitsTotal(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Дата начала</label>
                  <input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Дата окончания</label>
                  <input
                    type="date"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 border border-gray-600 rounded-lg py-2 text-sm hover:bg-gray-800 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold transition-colors"
                >
                  {loading ? 'Сохранение...' : 'Начислить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
