import supabase from '../lib/supabase.js';

function getWeekRange() {
  const now = new Date();
  const diffToMon = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { from: mon.toISOString(), to: sun.toISOString() };
}

export default async function statsRoute(fastify) {
  // GET /stats/summary
  fastify.get('/stats/summary', async (_req, _reply) => {
    const now = new Date();

    const { from, to } = getWeekRange();
    const { count: classes_this_week } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .gte('start_at', from)
      .lte('start_at', to)
      .eq('is_cancelled', false);

    const { count: athletes_total } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'athlete');

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: pastClasses } = await supabase
      .from('classes')
      .select('bookings(status)')
      .gte('start_at', thirtyDaysAgo)
      .lte('start_at', now.toISOString())
      .eq('is_cancelled', false);

    let totalBooked = 0;
    let totalAttended = 0;
    for (const cls of pastClasses ?? []) {
      for (const b of cls.bookings) {
        if (b.status !== 'cancelled') totalBooked++;
        if (b.status === 'attended') totalAttended++;
      }
    }
    const attendance_rate_30d = totalBooked > 0
      ? Math.round((totalAttended / totalBooked) * 100)
      : 0;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: charges } = await supabase
      .from('transactions')
      .select('visits_delta')
      .in('type', ['charge', 'debit'])
      .gte('created_at', monthStart);

    const revenue_this_month = (charges ?? []).reduce(
      (sum, t) => sum + Math.abs(t.visits_delta ?? 0), 0
    );

    return {
      classes_this_week: classes_this_week ?? 0,
      athletes_total: athletes_total ?? 0,
      attendance_rate_30d,
      revenue_this_month,
    };
  });

  // GET /stats/recent-classes — last 10 past classes
  fastify.get('/stats/recent-classes', async (_req, reply) => {
    const { data, error } = await supabase
      .from('classes')
      .select('start_at, type, trainer:users!trainer_id(name), bookings(status)')
      .lte('start_at', new Date().toISOString())
      .eq('is_cancelled', false)
      .order('start_at', { ascending: false })
      .limit(10);

    if (error) return reply.status(500).send({ error: error.message });

    return (data ?? []).map(({ bookings, trainer, ...cls }) => {
      const active = bookings.filter((b) => b.status !== 'cancelled');
      const attended = bookings.filter((b) => b.status === 'attended');
      return {
        start_at: cls.start_at,
        type: cls.type,
        trainer_name: trainer?.name ?? '—',
        booked_count: active.length,
        attended_count: attended.length,
        attendance_pct: active.length > 0
          ? Math.round((attended.length / active.length) * 100)
          : 0,
      };
    });
  });

  // GET /stats/debtors — athletes with visits_left=0 or valid_to within 7 days
  fastify.get('/stats/debtors', async (_req, reply) => {
    const today = new Date().toISOString().split('T')[0];
    const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: athletes, error: athErr } = await supabase
      .from('users')
      .select('id, name, telegram_id')
      .eq('role', 'athlete')
      .order('name');

    if (athErr) return reply.status(500).send({ error: athErr.message });

    const userIds = (athletes ?? []).map((a) => a.id);

    const { data: memberships, error: mErr } = await supabase
      .from('memberships')
      .select('user_id, type, visits_left, valid_to')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('valid_to', today)
      .eq('is_frozen', false);

    if (mErr) return reply.status(500).send({ error: mErr.message });

    // Latest active membership per user
    const membershipMap = new Map();
    for (const m of memberships ?? []) {
      const prev = membershipMap.get(m.user_id);
      if (!prev || m.valid_to > prev.valid_to) membershipMap.set(m.user_id, m);
    }

    return (athletes ?? [])
      .flatMap((a) => {
        const m = membershipMap.get(a.id);
        if (!m) {
          // No active membership at all
          return [{ name: a.name, telegram_id: a.telegram_id, visits_left: null, valid_to: null }];
        }
        const visitsOut = (m.type === 'visits' || m.type === 'single') && (m.visits_left ?? 0) <= 0;
        const expiringSoon = m.valid_to <= in7days;
        if (visitsOut || expiringSoon) {
          return [{ name: a.name, telegram_id: a.telegram_id, visits_left: m.visits_left, valid_to: m.valid_to }];
        }
        return [];
      });
  });
}
