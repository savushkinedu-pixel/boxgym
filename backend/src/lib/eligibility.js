import supabase from './supabase.js';

/**
 * Checks whether an athlete can book a class.
 *
 * Returns:
 *   { eligible, reason, useTrialAfterBook, visitsLimit }
 *
 * visitsLimit — max bookings allowed right now:
 *   Infinity  → unlimited/personal membership
 *   N > 0     → visits_left on active membership
 *   1         → trial (one free class)
 *   0         → not eligible
 *
 * Eligibility rules:
 *   1. Active membership (valid_to >= today, is_frozen = false):
 *      - unlimited / personal → always eligible
 *      - visits / single      → eligible if visits_left > 0
 *   2. No active membership + trial_used = false → one trial booking
 *   3. Otherwise → not eligible
 */
export async function checkBookingEligibility(userId) {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, trial_used')
    .eq('id', userId)
    .single();

  if (userErr || !user) {
    return { eligible: false, reason: 'user_not_found', useTrialAfterBook: false, visitsLimit: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: memberships } = await supabase
    .from('memberships')
    .select('id, type, visits_left, valid_to, is_frozen')
    .eq('user_id', userId)
    .gte('valid_to', today)
    .eq('is_frozen', false);

  const active = (memberships || []).find((m) => {
    if (m.type === 'unlimited' || m.type === 'personal') return true;
    return (m.visits_left ?? 0) > 0;
  });

  if (active) {
    const visitsLimit =
      active.type === 'unlimited' || active.type === 'personal'
        ? Infinity
        : (active.visits_left ?? 0);
    return { eligible: true, reason: null, useTrialAfterBook: false, visitsLimit };
  }

  if (!user.trial_used) {
    return { eligible: true, reason: 'trial', useTrialAfterBook: true, visitsLimit: 1 };
  }

  return { eligible: false, reason: 'no_membership', useTrialAfterBook: false, visitsLimit: 0 };
}

/** Mark trial as consumed. Call after a successful trial booking. */
export async function markTrialUsed(userId) {
  await supabase.from('users').update({ trial_used: true }).eq('id', userId);
}
