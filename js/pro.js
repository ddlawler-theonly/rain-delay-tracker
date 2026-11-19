// Rain Out subscriptions: tier rules (pure logic, unit-tested in test/pro.test.mjs) + StoreKit product ids.
// Gating applies ONLY to the App Store build (CONFIG.STORE). The GitHub Pages web version is never restricted.
// Only JOB counts (and lists / whole-list export) are limited. No device or user limits: there are no accounts or sync,
// and an Apple subscription covers every device signed in to the same Apple Account.
export const GROUP = 'Rain Out Pro';
export const PRODUCTS = {
  'com.blueworksfieldpro.raindelay.unlimited.yearly': { tier: 'unlimited', period: 'year' },
  'com.blueworksfieldpro.raindelay.unlimited.monthly': { tier: 'unlimited', period: 'month' },
  'com.blueworksfieldpro.raindelay.personal.yearly': { tier: 'personal', period: 'year' },
  'com.blueworksfieldpro.raindelay.personal.monthly': { tier: 'personal', period: 'month' },
};
export const PRODUCT_IDS = Object.keys(PRODUCTS);
export const IDS = {
  personal: { monthly: 'com.blueworksfieldpro.raindelay.personal.monthly', yearly: 'com.blueworksfieldpro.raindelay.personal.yearly' },
  unlimited: { monthly: 'com.blueworksfieldpro.raindelay.unlimited.monthly', yearly: 'com.blueworksfieldpro.raindelay.unlimited.yearly' },
};
// Group levels in App Store Connect: Unlimited = level 1 (highest), Personal = level 2.
export const TIERS = {
  free: { name: 'Free', rank: 0, jobs: 1, lists: 1, listExport: false },
  personal: { name: 'Personal', rank: 1, jobs: 15, lists: Infinity, listExport: true },
  unlimited: { name: 'Unlimited', rank: 2, jobs: Infinity, lists: Infinity, listExport: true },
};
export const FREE_JOBS = TIERS.free.jobs;

export const countedJobs = (jobs = []) => jobs.filter((j) => !j.sample).length; // the demo "sample job" never counts

const live = (e, now) => PRODUCTS[e?.productId] && !e.revoked && !(e.expires && e.expires <= now);
// Highest active tier from StoreKit 2 entitlements (Transaction.currentEntitlements, verified on device).
export function activeTier(entitlements, now = Date.now()) {
  let best = 'free';
  for (const e of entitlements || []) if (live(e, now) && TIERS[PRODUCTS[e.productId].tier].rank > TIERS[best].rank) best = PRODUCTS[e.productId].tier;
  return best;
}
export function activeEntitlement(entitlements, now = Date.now()) {
  const t = activeTier(entitlements, now);
  return (entitlements || []).find((e) => live(e, now) && PRODUCTS[e.productId].tier === t) || null;
}

// gate(action, ctx) -> { ok } or { ok:false, reason, need }. need = the lowest tier that allows it.
// Never gated: viewing, editing, refreshing weather, per-job CSV/Excel/PDF/print, backup, restoring a backup, deleting.
// Lapse/downgrade: nothing is deleted or locked; you just can't add jobs/lists beyond the current tier.
export function gate(action, { store, tier = 'free', jobs = [], lists = [] } = {}) {
  if (!store) return { ok: true };
  const T = TIERS[tier] || TIERS.free;
  switch (action) {
    case 'addJob': {
      if (countedJobs(jobs) < T.jobs) return { ok: true };
      return { ok: false, reason: tier === 'free' ? 'jobs' : 'jobs15', need: countedJobs(jobs) < TIERS.personal.jobs ? 'personal' : 'unlimited' };
    }
    case 'addList': return lists.length < T.lists ? { ok: true } : { ok: false, reason: 'lists', need: 'personal' };
    case 'listExport': return T.listExport ? { ok: true } : { ok: false, reason: 'listExport', need: 'personal' };
    default: return { ok: true };
  }
}

export const REASON_TEXT = {
  jobs: `Rain Out Free tracks ${TIERS.free.jobs} job. Personal tracks up to ${TIERS.personal.jobs} jobs, and Unlimited has no job limit.`,
  jobs15: `Personal tracks up to ${TIERS.personal.jobs} jobs. Unlimited has no job limit.`,
  lists: 'More than one project list is part of Personal and Unlimited.',
  listExport: 'Exporting a whole list at once is part of Personal and Unlimited. Each job can still be exported for free.',
};

export function periodLabel(p) {
  if (!p) return '';
  const u = { day: 'day', week: 'week', month: 'month', year: 'year' }[p.unit] || p.unit;
  return p.value === 1 ? u : `${p.value} ${u}s`;
}
// Yearly saving vs 12 x monthly, from real StoreKit prices; 0 if unknown.
export const yearlySaving = (y, m) => (y?.price > 0 && m?.price > 0 ? Math.round((1 - y.price / (m.price * 12)) * 100) : 0);
