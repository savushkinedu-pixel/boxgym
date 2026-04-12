import 'dotenv/config';
import supabase from '../lib/supabase.js';
import { autoCheckin } from '../autoCheckin.js';

// IDs of everything created during this run — cleaned up in finally
const created = {
  classId: null,
  membershipId: null,
  membershipWasTemporary: false,
  transactionId: null,
};

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }

// ─── Setup ────────────────────────────────────────────────────────────────────

async function setup() {
  // 1. Find Алексей (telegram_id=333)
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_id', 333)
    .single();

  if (userErr || !user) throw new Error('User telegram_id=333 not found — run seed migration first');
  const userId = user.id;

  // 2. Create class with start_at = now() - 3 hours
  const startAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: cls, error: clsErr } = await supabase
    .from('classes')
    .insert({ type: 'boxing', start_at: startAt, duration_min: 60, capacity: 12, location: '[TEST]', is_cancelled: false })
    .select('id')
    .single();

  if (clsErr) throw new Error(`Failed to create class: ${clsErr.message}`);
  created.classId = cls.id;
  console.log(`  → class created: ${cls.id} (start_at=${startAt})`);

  // 3. Find or create active visits/single membership with visits_left > 0
  const today = new Date().toISOString().split('T')[0];
  const { data: existingM } = await supabase
    .from('memberships')
    .select('id, visits_left')
    .eq('user_id', userId)
    .gte('valid_to', today)
    .eq('is_frozen', false)
    .in('type', ['visits', 'single'])
    .gt('visits_left', 0)
    .limit(1)
    .maybeSingle();

  let membershipId, initialVisitsLeft;

  if (existingM) {
    membershipId = existingM.id;
    initialVisitsLeft = existingM.visits_left;
    console.log(`  → existing membership found: visits_left=${initialVisitsLeft}`);
  } else {
    const validTo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: newM, error: mErr } = await supabase
      .from('memberships')
      .insert({ user_id: userId, type: 'visits', visits_total: 5, visits_left: 5, valid_from: today, valid_to: validTo })
      .select('id, visits_left')
      .single();

    if (mErr) throw new Error(`Failed to create membership: ${mErr.message}`);
    membershipId = newM.id;
    initialVisitsLeft = newM.visits_left;
    created.membershipId = newM.id;
    created.membershipWasTemporary = true;
    console.log(`  → temporary membership created: visits_left=${initialVisitsLeft}`);
  }

  // 4. Create booking with status 'booked'
  const { error: bookingErr } = await supabase
    .from('bookings')
    .insert({ class_id: cls.id, user_id: userId, status: 'booked' });

  if (bookingErr) throw new Error(`Failed to create booking: ${bookingErr.message}`);
  console.log(`  → booking created (status=booked)`);

  return { userId, membershipId, initialVisitsLeft };
}

// ─── Verify ───────────────────────────────────────────────────────────────────

async function verify(userId, membershipId, initialVisitsLeft) {
  let allPassed = true;

  // Check booking status
  const { data: booking } = await supabase
    .from('bookings')
    .select('status')
    .eq('class_id', created.classId)
    .eq('user_id', userId)
    .maybeSingle();

  if (booking?.status === 'attended') {
    pass(`booking.status = 'attended'`);
  } else {
    fail(`booking.status = '${booking?.status ?? 'not found'}' (expected 'attended')`);
    allPassed = false;
  }

  // Check visits_left decreased by 1
  const { data: membership } = await supabase
    .from('memberships')
    .select('visits_left')
    .eq('id', membershipId)
    .single();

  const expected = initialVisitsLeft - 1;
  if (membership?.visits_left === expected) {
    pass(`visits_left = ${membership.visits_left} (was ${initialVisitsLeft}, decreased by 1)`);
  } else {
    fail(`visits_left = ${membership?.visits_left ?? 'N/A'} (expected ${expected}, was ${initialVisitsLeft})`);
    allPassed = false;
  }

  // Check debit transaction created in the last minute
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, type, visits_delta')
    .eq('user_id', userId)
    .eq('membership_id', membershipId)
    .eq('type', 'debit')
    .gte('created_at', since)
    .maybeSingle();

  if (tx) {
    pass(`transaction created: type='debit', visits_delta=${tx.visits_delta}`);
    created.transactionId = tx.id;
  } else {
    fail(`transaction type='debit' not found — check constraint may need migration (add 'debit' to transactions_type_check)`);
    allPassed = false;
  }

  return allPassed;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  if (created.transactionId) {
    await supabase.from('transactions').delete().eq('id', created.transactionId);
  }
  // class DELETE cascades to bookings (ON DELETE CASCADE in schema)
  if (created.classId) {
    await supabase.from('classes').delete().eq('id', created.classId);
  }
  if (created.membershipWasTemporary && created.membershipId) {
    await supabase.from('memberships').delete().eq('id', created.membershipId);
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n=== autoCheckin integration test ===\n');

  let userId, membershipId, initialVisitsLeft;

  console.log('[1/4] setup');
  try {
    ({ userId, membershipId, initialVisitsLeft } = await setup());
  } catch (err) {
    console.error(`\n  FAILED: ${err.message}`);
    await cleanup();
    process.exit(1);
  }

  console.log('\n[2/4] running autoCheckin()');
  try {
    await autoCheckin();
  } catch (err) {
    console.error(`\n  FAILED: ${err.message}`);
    await cleanup();
    process.exit(1);
  }

  console.log('\n[3/4] verifying results');
  let allPassed = false;
  try {
    allPassed = await verify(userId, membershipId, initialVisitsLeft);
  } catch (err) {
    console.error(`\n  verify error: ${err.message}`);
  }

  console.log('\n[4/4] cleanup');
  try {
    await cleanup();
    console.log('  → test data removed');
  } catch (err) {
    console.error(`  WARNING: cleanup failed — ${err.message}`);
  }

  console.log('\n' + '='.repeat(36));
  console.log(`  result: ${allPassed ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('='.repeat(36) + '\n');
  process.exit(allPassed ? 0 : 1);
}

run();
