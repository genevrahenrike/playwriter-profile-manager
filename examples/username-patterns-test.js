import { RandomDataGenerator } from '../src/RandomDataGenerator.js';
import fs from 'fs-extra';

console.log('🎯 Sampling username generation to evaluate distribution and quality...');

function sample(generator, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(generator.generateUserData());
  return out;
}

function summarize(records) {
  const counters = {
    style: new Map(),
    pattern: new Map(),
    number: new Map(),
    sep: new Map(),
  };
  const examples = { clean: [], separatedD2: [], separatedD4: [], concatD4: [], business: [], handle: [] };

  for (const r of records) {
    const s = r.usernameStyle; const p = r.usernamePattern; const nf = r.numberFlavor || 'none';
    counters.style.set(s, (counters.style.get(s) || 0) + 1);
    counters.pattern.set(p, (counters.pattern.get(p) || 0) + 1);
    counters.number.set(nf, (counters.number.get(nf) || 0) + 1);

    let sep = null;
    if (s === 'separated') sep = r.fullName.includes('.') ? '.' : (r.fullName.includes('_') ? '_' : (r.fullName.includes('-') ? '-' : 'none'));
    if (sep) counters.sep.set(sep, (counters.sep.get(sep) || 0) + 1);

    if (s === 'business') examples.business.length < 3 && examples.business.push(r.fullName);
    if (s === 'handle') examples.handle.length < 3 && examples.handle.push(r.fullName);
    if (s === 'concatenated' && nf === 'none') examples.clean.length < 3 && examples.clean.push(r.fullName);
    if (s === 'separated' && nf === 'd2') examples.separatedD2.length < 3 && examples.separatedD2.push(r.fullName);
    if (s === 'separated' && nf === 'd4') examples.separatedD4.length < 3 && examples.separatedD4.push(r.fullName);
    if (s === 'concatenated' && nf === 'd4') examples.concatD4.length < 3 && examples.concatD4.push(r.fullName);
  }

  const toObj = (m) => Object.fromEntries([...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
  return { counts: { style: toObj(counters.style), pattern: toObj(counters.pattern), number: toObj(counters.number), separators: toObj(counters.sep) }, examples };
}

// Tune: favor common-looking outputs by default
const generatorAuto = new RandomDataGenerator({
  usernameStyle: 'auto',
  usernamePattern: 'random',
  enableTracking: false,
  patternWeights: { concatenated: 2, separated: 2, business: 1, handle: 0.5 },
  numberFlavorWeights: { none: 2, d2: 2, d4: 0.25 },
  numberFlavorWeightsByStyle: {
    concatenated: { none: 1, d2: 2, d4: 0.25 },
    separated: { none: 2, d2: 2, d4: 0.25 }
  }
});

const N = 500;
const records = sample(generatorAuto, N);
const { counts, examples } = summarize(records);

console.log('\n— Summary —');
console.log('Styles:', counts.style);
console.log('Patterns:', counts.pattern);
console.log('Number flavors:', counts.number);
console.log('Separators (separated only):', counts.separators);

console.log('\n— Examples —');
console.log('Clean (concat no digits):', examples.clean);
console.log('Separated + d2:', examples.separatedD2);
console.log('Separated + d4 (rare):', examples.separatedD4);
console.log('Concat + d4 (rare):', examples.concatD4);
console.log('Business:', examples.business);
console.log('Handle (rare):', examples.handle);

// Uniqueness quick check with lower verbosity
const generatorUnique = new RandomDataGenerator({ enableTracking: true, trackingDbPath: './test-uniqueness.db', maxAttempts: 100 });
const set = new Set(); let collisions = 0; for (let i = 0; i < 200; i++) { const u = generatorUnique.generateUserData().fullName; if (set.has(u)) collisions++; else set.add(u); }
console.log(`\nUniqueness: ${set.size}/200 unique, collisions=${collisions}`);
generatorUnique.close();
await fs.remove('./test-uniqueness.db').catch(()=>{});

console.log('\n✅ Distribution sampling complete. Adjust weights as needed.');