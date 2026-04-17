import supabase from '../lib/supabase.js';

export default async function statsRoute(fastify) {
  // GET /stats/summary
  fastify.get('/stats/summary', async (_req, reply) => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const today = now.toISOString().split('T')[0];

    const [
      { count: total_athletes },
      { count: active_memberships },
      { count: visits_today },
      { count: visits_month },
      { data: recentClasses },
      { data: monthTxns },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'athlete'),
      supabase.from('memberships').select('*', { count: 'exact', head: true })
        .gte('valid_to', today).eq('is_frozen', false),
      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('status', 'attended')
        .gte('checked_in_at', todayStart.toISOString())
        .lt('checked_in_at', tomorrowStart.toISOString()),
      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('status', 'attended')
        .gte('checked_in_at', monthStart.toISOString()),
      supabase.from('classes')
        .select('bookings(status)')
        .gte('start_at', thirtyDaysAgo.toISOString())
        .lte('start_at', now.toISOString())
        .eq('is_cancelled', false),
      supabase.from('transactions')
        .select('visits_delta')
        .in('type', ['charge', 'debit'])
        .gte('created_at', monthStart.toISOString()),
    ]);

    let total = 0, noShows = 0;
    for (const cls of recentClasses ?? []) {
      for (const b of cls.bookings) {
        if (b.status !== 'cancelled') total++;
        if (b.status === 'no_show') noShows++;
      }
    }
    const no_show_rate = total > 0 ? Math.round((noShows / total) * 100) : 0;
    const revenue_month = (monthTxns ?? []).reduce((sum, t) => sum + Math.abs(t.visits_delta ?? 0), 0);

    return {
      total_athletes: total_athletes ?? 0,
      active_memberships: active_memberships ?? 0,
      visits_today: visits_today ?? 0,
      visits_month: visits_month ?? 0,
      no_show_rate,
      revenue_month,
    };
  });

  // GET /stats/attendance?period=week|month
  fastify.get('/stats/attendance', async (request, reply) => {
    const { period = 'month' } = request.query;
    const days = period === 'week' ? 7 : 30;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('bookings')
      .select('checked_in_at')
      .eq('status', 'attended')
      .gte('checked_in_at', from.toISOString())
      .lte('checked_in_at', now.toISOString());

    if (error) return reply.status(500).send({ error: error.message });

    const counts = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
      counts[d.toISOString().split('T')[0]] = 0;
    }
    for (const b of data ?? []) {
      if (!b.checked_in_at) continue;
      const key = b.checked_in_at.split('T')[0];
      if (key in counts) counts[key]++;
    }

    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  });

  // GET /stats/classes/top — top-5 by attended_count
  fastify.get('/stats/classes/top', async (_req, reply) => {
    const { data, error } = await supabase
      .from('classes')
      .select('id, type, start_at, capacity, trainer:users!trainer_id(name), bookings(status)')
      .lte('start_at', new Date().toISOString())
      .eq('is_cancelled', false)
      .order('start_at', { ascending: false })
      .limit(100);

    if (error) return reply.status(500).send({ error: error.message });

    return (data ?? [])
      .map(({ id, type, start_at, capacity, trainer, bookings }) => ({
        class_id: id,
        type,
        start_at,
        trainer_name: trainer?.name ?? '—',
        attended_count: bookings.filter((b) => b.status === 'attended').length,
        capacity,
      }))
      .sort((a, b) => b.attended_count - a.attended_count)
      .slice(0, 5);
  });

  // GET /stats/athletes/lost?days=14
  fastify.get('/stats/athletes/lost', async (request, reply) => {
    const days = parseInt(request.query.days ?? '14');
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data: athletes, error: athErr } = await supabase
      .from('users')
      .select('id, name')
      .eq('role', 'athlete')
      .order('name');

    if (athErr) return reply.status(500).send({ error: athErr.message });

    const userIds = (athletes ?? []).map((a) => a.id);
    if (!userIds.length) return [];

    const { data: bookings, error: bErr } = await supabase
      .from('bookings')
      .select('user_id, checked_in_at')
      .eq('status', 'attended')
      .in('user_id', userIds)
      .not('checked_in_at', 'is', null);

    if (bErr) return reply.status(500).send({ error: bErr.message });

    const lastVisit = {};
    for (const b of bookings ?? []) {
      if (!lastVisit[b.user_id] || b.checked_in_at > lastVisit[b.user_id]) {
        lastVisit[b.user_id] = b.checked_in_at;
      }
    }

    return (athletes ?? [])
      .filter((a) => {
        const last = lastVisit[a.id];
        return !last || new Date(last) < cutoff;
      })
      .map((a) => {
        const last = lastVisit[a.id] ?? null;
        const days_absent = last
          ? Math.floor((Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return {
          user_id: a.id,
          name: a.name,
          last_visit: last ? last.split('T')[0] : null,
          days_absent,
        };
      });
  });

  // GET /stats/athlete/:id
  fastify.get('/stats/athlete/:id', async (request, reply) => {
    const { id } = request.params;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('checked_in_at')
      .eq('user_id', id)
      .eq('status', 'attended')
      .not('checked_in_at', 'is', null)
      .order('checked_in_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });

    const allVisits = bookings ?? [];
    const visits_total = allVisits.length;
    const visits_month = allVisits.filter((b) => new Date(b.checked_in_at) >= monthStart).length;
    const last_visit = allVisits.length > 0 ? allVisits[0].checked_in_at.split('T')[0] : null;

    // Streak: consecutive days going back from today (or yesterday if today not visited)
    const visitDates = new Set(allVisits.map((b) => b.checked_in_at.split('T')[0]));
    const checkDate = new Date(); checkDate.setHours(0, 0, 0, 0);
    if (!visitDates.has(checkDate.toISOString().split('T')[0])) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    let streak = 0;
    while (visitDates.has(checkDate.toISOString().split('T')[0])) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    return { visits_total, visits_month, streak, last_visit };
  });

  // GET /stats/trainer/:id
  fastify.get('/stats/trainer/:id', async (request, reply) => {
    const { id } = request.params;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data, error } = await supabase
      .from('classes')
      .select('capacity, bookings(status)')
      .eq('trainer_id', id)
      .eq('is_cancelled', false)
      .gte('start_at', monthStart.toISOString())
      .lte('start_at', now.toISOString());

    if (error) return reply.status(500).send({ error: error.message });

    const classes = data ?? [];
    const classes_month = classes.length;
    let totalFill = 0;
    for (const cls of classes) {
      const attended = cls.bookings.filter((b) => b.status === 'attended').length;
      totalFill += cls.capacity > 0 ? (attended / cls.capacity) * 100 : 0;
    }
    const avg_fill_rate = classes_month > 0 ? Math.round(totalFill / classes_month) : 0;

    return { classes_month, avg_fill_rate };
  });

  // GET /stats/recent-classes (legacy)
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
        attendance_pct: active.length > 0 ? Math.round((attended.length / active.length) * 100) : 0,
      };
    });
  });

  // GET /stats/debtors (legacy)
  fastify.get('/stats/debtors', async (_req, reply) => {
    const today = new Date().toISOString().split('T')[0];
    const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: athletes, error: athErr } = await supabase
      .from('users').select('id, name, telegram_id').eq('role', 'athlete').order('name');
    if (athErr) return reply.status(500).send({ error: athErr.message });

    const userIds = (athletes ?? []).map((a) => a.id);
    const { data: memberships, error: mErr } = await supabase
      .from('memberships').select('user_id, type, visits_left, valid_to')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('valid_to', today).eq('is_frozen', false);
    if (mErr) return reply.status(500).send({ error: mErr.message });

    const membershipMap = new Map();
    for (const m of memberships ?? []) {
      const prev = membershipMap.get(m.user_id);
      if (!prev || m.valid_to > prev.valid_to) membershipMap.set(m.user_id, m);
    }

    return (athletes ?? []).flatMap((a) => {
      const m = membershipMap.get(a.id);
      if (!m) return [{ name: a.name, telegram_id: a.telegram_id, visits_left: null, valid_to: null }];
      const visitsOut = (m.type === 'visits' || m.type === 'single') && (m.visits_left ?? 0) <= 0;
      const expiringSoon = m.valid_to <= in7days;
      if (visitsOut || expiringSoon) {
        return [{ name: a.name, telegram_id: a.telegram_id, visits_left: m.visits_left, valid_to: m.valid_to }];
      }
      return [];
    });
  });
}
