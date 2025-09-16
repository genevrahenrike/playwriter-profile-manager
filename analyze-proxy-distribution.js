#!/usr/bin/env node

import fs from 'fs';

const proxies = JSON.parse(fs.readFileSync('proxies/http.proxies.v2.json', 'utf8'));
const stats = {};

proxies.forEach(p => {
  const country = p.customName || p.country;
  const type = p.connectionType;
  
  if (!stats[country]) {
    stats[country] = { total: 0, resident: 0, datacenter: 0 };
  }
  
  stats[country].total++;
  if (type === 'resident') {
    stats[country].resident++;
  } else if (type === 'datacenter' || type === 'dataCenter') {
    stats[country].datacenter++;
  }
});

console.log('Current Proxy Distribution:');
console.log('='.repeat(70));

Object.entries(stats)
  .sort((a, b) => b[1].total - a[1].total)
  .forEach(([country, data]) => {
    const percentage = ((data.total / proxies.length) * 100).toFixed(1);
    console.log(`${country.padEnd(15)} Total: ${data.total.toString().padStart(3)} (${percentage}%) - Resident: ${data.resident.toString().padStart(3)}, Datacenter: ${data.datacenter.toString().padStart(3)}`);
  });

console.log('='.repeat(70));
console.log(`Total proxies: ${proxies.length}`);

// Calculate ideal distributions
const totalUS = stats['United States']?.total || 0;
const totalOther = proxies.length - totalUS;
const usRatio = (totalUS / proxies.length * 100).toFixed(1);

console.log(`\nCurrent US vs Other ratio: ${usRatio}% US, ${(100 - usRatio).toFixed(1)}% Other`);
console.log(`\nFor more natural distribution, consider:`);
console.log(`- 40-50% US (currently ${usRatio}%)`);
console.log(`- 50-60% Other regions (currently ${(100 - usRatio).toFixed(1)}%)`);