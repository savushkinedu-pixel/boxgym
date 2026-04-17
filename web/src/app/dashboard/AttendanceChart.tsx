'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

type DataPoint = { date: string; count: number };

export default function AttendanceChart({ data }: { data: DataPoint[] }) {
  const formatted = data.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} interval={4} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} width={30} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#60a5fa' }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={false}
          name="Визиты"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
