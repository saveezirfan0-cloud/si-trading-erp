// src/lib/match.js — fuzzy matching of free text against the customer and
// inventory lists.
//
// The OCR scanner and the AI document creator both receive names that were
// never typed against the catalogue: a supplier's spelling of a product, or a
// person's shorthand for a customer. These helpers pick the record that was
// most likely meant, and say how sure they are, so a screen can auto-fill the
// clear cases and ask about the rest.

// Normalizes common local/OCR spellings so "PIPE RAINCH" matches "Pipe Wrench",
// "PLIERS" matches "plier", etc.
const SYNONYMS = {
  rainch: 'wrench', rench: 'wrench', wrinch: 'wrench', wranch: 'wrench',
  pliers: 'plier', screwdriver: 'driver', sd: 'driver',
  pc: 'pcs', piece: 'pcs', pieces: 'pcs', no: 'nos',
};

export const tokens = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s"']/g, ' ')
  .split(/\s+/).filter(t => t.length > 1)
  .map(t => {
    let n = SYNONYMS[t] || t;
    if (n.length > 3 && n.endsWith('s') && !SYNONYMS[n]) n = n.slice(0, -1); // crude plural strip
    return SYNONYMS[n] || n;
  });

export const similarity = (a, b) => {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach(t => { if (tb.has(t)) inter++; });
  return inter / Math.max(ta.size, tb.size);
};

export const bestMatch = (name, candidates, min = 0.3) => {
  let best = null, score = 0;
  for (const c of candidates || []) {
    const s = similarity(name, c.name);
    if (s > score) { score = s; best = c; }
  }
  return score >= min ? { ...best, _score: score } : null;
};

// Ranking a line against the inventory.
//
// Plain token overlap treats every word as equally telling, so an invoice line
// like "PLIERS ORANGE XIANYU CUTTER" scores the same against "6\" Solid Cutter
// Plier" as against "Pliers Orange Xianyu Cutter" — the words that actually
// identify the item ("xianyu", "orange") carry no more weight than the ones
// half the catalogue shares ("solid", "6\""). So weight each token by how rare
// it is across the inventory, and search the code and brand too.
export const makeRanker = (items) => {
  // Score against the item name only — codes and brands are for the search box,
  // and letting them into the score dilutes it.
  const docs = (items || []).map((i) => ({ item: i, set: new Set(tokens(i.name)) }));
  const df = new Map();
  docs.forEach((d) => d.set.forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const n = docs.length || 1;
  const idf = (t) => Math.log((n + 1) / ((df.get(t) || 0) + 1)) + 1;
  const weight = (set) => { let w = 0; set.forEach((t) => { w += idf(t); }); return w; };
  const docWeight = docs.map((d) => weight(d.set));

  return (name, limit = 5) => {
    const q = new Set(tokens(name));
    if (!q.size) return [];
    const qw = weight(q);
    const scored = [];
    docs.forEach((d, k) => {
      let inter = 0;
      q.forEach((t) => { if (d.set.has(t)) inter += idf(t); });
      if (!inter) return;
      // Dice coefficient: rewards covering both sides, but unlike dividing by
      // the longer side it doesn't punish an invoice line for carrying extra
      // spec words ("SOLID HD", "( 36PCS/CTN )") the catalogue name omits.
      scored.push({ ...d.item, score: (2 * inter) / (qw + docWeight[k]) });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  };
};

// Auto-select an inventory item only when one candidate is both good and
// clearly ahead of the next one; a near-tie means the line has to be checked by
// hand, and proposing a new item is safer than silently picking the wrong one.
export const AUTO_MATCH = 0.55;
export const AUTO_MARGIN = 0.08;

export const pickMatch = (rank, name) => {
  const [best, next] = rank(name, 2);
  if (!best) return { action: 'create', itemId: '', matchScore: 0, nearMiss: null };
  const clear = best.score >= AUTO_MATCH && (!next || best.score - next.score >= AUTO_MARGIN);
  return clear
    ? { action: 'match', itemId: best.id, matchScore: best.score, nearMiss: null }
    : { action: 'create', itemId: '', matchScore: 0,
        nearMiss: best.score >= 0.3 ? { name: best.name, score: best.score } : null };
};
