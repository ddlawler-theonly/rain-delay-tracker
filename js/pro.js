// Rain Out Pro: gating rules (pure logic, unit-tested in test/pro.test.mjs) + StoreKit product ids.
// Gating applies ONLY to the App Store build (CONFIG.STORE). The GitHub Pages web version is never restricted.
export const PRO = {
  group: 'Rain Out Pro',
  monthly: 'com.blueworksfieldpro.raindelay.pro.monthly',
  yearly: 'com.blueworksfieldpro.raindelay.pro.yearly',
};
export const PRO_IDS = [PRO.yearly, PRO.monthly];
export const FREE_JOBS = 2;   // free tier: 2 jobs (the demo "sample job" does not count)
export const FREE_LISTS = 1;  // free tier: 1 project list

export const countedJobs = (jobs = []) => jobs.filter((j) => !j.sample).length;

// Active if any verified, unrevoked, unexpired Pro transaction is present (StoreKit 2 Transaction.currentEntitlements).
export function isProActive(entitlements, now = Date.now()) {
  return (entitlements || []).some((e) => PRO_IDS.includes(e.productId) && !e.revoked && !(e.expires && e.expires <= now));
}

// gate(action, ctx) -> { ok, reason }. Only creating MORE jobs/lists and whole-list exports are Pro.
// Never gated (free, and after a subscription lapses): viewing, editing, refreshing weather, per-job CSV/Excel/PDF/print,
// backup/restore, deleting. Jobs and lists made while Pro stay fully usable after a lapse; you just can't add more.
export function gate(action, { store, pro, jobs = [], lists = [] } = {}) {
  if (!store || pro) return { ok: true };
  switch (action) {
    case 'addJob': return countedJobs(jobs) < FREE_JOBS ? { ok: true } : { ok: false, reason: 'jobs' };
    case 'addList': return lists.length < FREE_LISTS ? { ok: true } : { ok: false, reason: 'lists' };
    case 'listExport': return { ok: false, reason: 'listExport' };
    default: return { ok: true };
  }
}

export const REASON_TEXT = {
  jobs: `The free version tracks ${FREE_JOBS} jobs. Rain Out Pro tracks unlimited jobs.`,
  lists: 'Multiple project lists are part of Rain Out Pro.',
  listExport: 'Exporting a whole list at once is part of Rain Out Pro. Each job can still be exported for free.',
};

export function periodLabel(p) {
  if (!p) return '';
  const u = { day: 'day', week: 'week', month: 'month', year: 'year' }[p.unit] || p.unit;
  return p.value === 1 ? u : `${p.value} ${u}s`;
}
