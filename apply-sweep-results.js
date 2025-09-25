#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';

async function usage() {
  console.log(`
Usage: node apply-sweep-results.js [options]

Options:
  --input <file>       Path to sweep JSON (default: latest ./output/proxy-sweep-*.json)
  --proxies <file>     Path to proxies v2 file to update (default: ./proxies/http.proxies.v2new.json or ./proxies/http.proxies.v2.json)
  --apply              Actually write changes (default: dry-run)
  --no-backup          Skip creating a backup (not recommended)
  --help               Show this help

Examples:
  # Dry-run (preview changes)
  node apply-sweep-results.js

  # Apply changes to the detected v2 file
  node apply-sweep-results.js --apply

  # Provide explicit input and proxies file
  node apply-sweep-results.js --input ./output/proxy-sweep-2025-09-23T...json --proxies ./proxies/http.proxies.v2.json --apply
`);
}

function parseArgs(argv) {
  const args = { apply: false, input: null, proxies: null, backup: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--input': args.input = argv[++i]; break;
      case '--proxies': args.proxies = argv[++i]; break;
      case '--apply': args.apply = true; break;
      case '--no-backup': args.backup = false; break;
      case '--help': args.help = true; break;
      default: console.warn(`Unknown arg: ${a}`); break;
    }
  }
  return args;
}

async function findLatestOutput() {
  const outDir = path.join(process.cwd(), 'output');
  if (!await fs.pathExists(outDir)) return null;
  const files = await fs.readdir(outDir);
  const matches = files.filter(f => f.startsWith('proxy-sweep-') && f.endsWith('.json'));
  if (matches.length === 0) return null;
  matches.sort(); // lexical includes timestamp ISO-like -> newest last
  return path.join(outDir, matches[matches.length - 1]);
}

async function detectProxiesFile(provided) {
  if (provided) return provided;
  const p1 = path.join(process.cwd(), 'proxies', 'http.proxies.v2new.json');
  const p2 = path.join(process.cwd(), 'proxies', 'http.proxies.v2.json');
  if (await fs.pathExists(p1)) return p1;
  if (await fs.pathExists(p2)) return p2;
  return null;
}

function buildLookup(proxies) {
  const map = new Map();
  proxies.forEach(p => {
    if (p._id) map.set(`id:${p._id}`, p);
    if (p.id) map.set(`id:${p.id}`, p);
    if (p.host && p.port) map.set(`hp:${p.host}:${p.port}`, p);
    if (p.customName) map.set(`name:${p.customName}`, p);
    if (p.label) map.set(`name:${p.label}`, p);
  });
  return map;
}

function tryMatchResultToProxy(r, lookup) {
  if (!r) return null;
  if (r._id && lookup.has(`id:${r._id}`)) return lookup.get(`id:${r._id}`);
  if (r.id && lookup.has(`id:${r.id}`)) return lookup.get(`id:${r.id}`);
  if (r.host && r.port && lookup.has(`hp:${r.host}:${r.port}`)) return lookup.get(`hp:${r.host}:${r.port}`);
  if (r.customName && lookup.has(`name:${r.customName}`)) return lookup.get(`name:${r.customName}`);
  if (r.customName) {
    // Try loose name match (case-insensitive)
    const key = [...lookup.keys()].find(k => k.startsWith('name:') && k.slice(5).toLowerCase() === String(r.customName).toLowerCase());
    if (key) return lookup.get(key);
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) return usage();

  let inputFile = args.input;
  if (!inputFile) {
    inputFile = await findLatestOutput();
    if (!inputFile) {
      console.error('No input file provided and no output proxy-sweep file found in ./output. Provide --input <file>');
      process.exit(1);
    }
  }

  console.log(`Using input file: ${inputFile}`);

  const raw = await fs.readFile(inputFile, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); } catch (err) { console.error('Could not parse input JSON:', err.message); process.exit(1); }

  // Detect where results array lives
  let results = null;
  if (Array.isArray(parsed)) results = parsed;
  else if (parsed.results && Array.isArray(parsed.results)) results = parsed.results;
  else if (parsed.summary && parsed.results) results = parsed.results;
  else {
    console.error('Could not find results array in input file. Expected top-level array or { results: [...] }');
    process.exit(1);
  }

  const proxiesFile = await detectProxiesFile(args.proxies);
  if (!proxiesFile) {
    console.error('Could not find proxies v2 file. Provide --proxies <file>');
    process.exit(1);
  }

  console.log(`Proxies file to update: ${proxiesFile}`);
  const proxiesRaw = await fs.readFile(proxiesFile, 'utf8');
  let proxies;
  try { proxies = JSON.parse(proxiesRaw); } catch (err) { console.error('Could not parse proxies file:', err.message); process.exit(1); }

  if (!Array.isArray(proxies)) {
    console.error('Proxies file does not contain an array at top level. Aborting.');
    process.exit(1);
  }

  const lookup = buildLookup(proxies);
  const now = new Date().toISOString();

  let updated = 0;
  const notFound = [];

  for (const r of results) {
    const match = tryMatchResultToProxy(r, lookup);
    if (!match) {
      notFound.push(r);
      continue;
    }

    // Apply updates
    const success = !!r.success;
    match.status = success;
    match.lastChecked = r.timestamp || now;
    match.isPaymentRequired = !!r.isPaymentRequired;
    match.isAuthRequired = !!r.isAuthRequired;
    match.lastResult = r.error || (success ? 'OK' : 'Failed');
    match.latency = r.latency || null;
    match.checkedService = r.service || null;

    updated++;
  }

  console.log(`\nSummary:`);
  console.log(`  Results processed: ${results.length}`);
  console.log(`  Proxies updated:   ${updated}`);
  console.log(`  Results unmatched: ${notFound.length}`);

  if (notFound.length > 0) {
    console.log('\nSample unmatched results (first 10):');
    notFound.slice(0, 10).forEach((r, i) => {
      console.log(` ${i + 1}. ${r.customName || ''} ${r.host || ''}:${r.port || ''} -> ${r.error || (r.success ? 'OK' : 'Failed')}`);
    });
  }

  if (!args.apply) {
    console.log('\nDry-run complete. No files written. Rerun with --apply to write changes (a backup will be created).');
    return;
  }

  // Write backup and file
  if (args.backup) {
    const backupPath = `${proxiesFile}.bak-${Date.now()}`;
    await fs.copy(proxiesFile, backupPath);
    console.log(`\nBackup created: ${backupPath}`);
  }

  await fs.writeFile(proxiesFile, JSON.stringify(proxies, null, 2), 'utf8');
  console.log(`Updated proxies file written: ${proxiesFile}`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
