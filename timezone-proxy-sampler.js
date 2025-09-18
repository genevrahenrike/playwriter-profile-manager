#!/usr/bin/env node
/**
 * Timezone-aware proxy sampling utility
 * Provides smart proxy selection based on current time and timezone weights
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateTimezoneWeight, COUNTRY_TIMEZONES } from './generate-timezone-aware-proxies.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load and update proxy weights based on current time
 * @returns {Array} Proxies with updated weights
 */
function loadAndUpdateProxyWeights() {
    const proxiesPath = path.join(__dirname, 'proxies', 'http.proxies.v3.json');
    
    if (!fs.existsSync(proxiesPath)) {
        throw new Error('Proxy file not found. Run generate-timezone-aware-proxies.js first.');
    }
    
    const proxies = JSON.parse(fs.readFileSync(proxiesPath, 'utf8'));
    
    // Update weights based on current time
    return proxies.map(proxy => ({
        ...proxy,
        currentWeight: calculateTimezoneWeight(proxy.country),
        weightUpdatedAt: new Date().toISOString()
    }));
}

/**
 * Sample proxies with timezone awareness
 * @param {number} count - Number of proxies to sample
 * @param {Object} options - Sampling options
 * @returns {Array} Sampled proxies
 */
function sampleTimezoneAwareProxies(count = 10, options = {}) {
    const {
        minWeight = 0.1,           // Minimum weight to consider
        diversityBoost = 0.2,      // Boost factor for geographic diversity
        excludeCountries = [],     // Countries to exclude
        preferCountries = [],      // Countries to prefer (additional boost)
        showWeights = false        // Whether to log weight information
    } = options;
    
    console.log(`🎯 Sampling ${count} timezone-aware proxies...`);
    console.log(`⏰ Current UTC time: ${new Date().toISOString()}`);
    
    let proxies = loadAndUpdateProxyWeights();
    
    // Filter out excluded countries
    if (excludeCountries.length > 0) {
        proxies = proxies.filter(p => !excludeCountries.includes(p.country));
        console.log(`🚫 Excluded countries: ${excludeCountries.join(', ')}`);
    }
    
    // Apply preference boosts
    if (preferCountries.length > 0) {
        proxies = proxies.map(p => {
            if (preferCountries.includes(p.country)) {
                return { ...p, currentWeight: p.currentWeight + 0.3 };
            }
            return p;
        });
        console.log(`⭐ Preferred countries: ${preferCountries.join(', ')}`);
    }
    
    // Show current weights if requested
    if (showWeights) {
        console.log('\n🌍 Current timezone weights:');
        const weightByCountry = {};
        proxies.forEach(p => {
            if (!weightByCountry[p.country]) {
                weightByCountry[p.country] = p.currentWeight;
            }
        });
        
        Object.entries(weightByCountry)
            .sort(([,a], [,b]) => b - a)
            .forEach(([country, weight]) => {
                const localTime = new Date(Date.now() + (COUNTRY_TIMEZONES[country] * 3600000));
                console.log(`   ${country}: ${weight.toFixed(2)} (local: ${localTime.getHours().toString().padStart(2, '0')}:${localTime.getMinutes().toString().padStart(2, '0')})`);
            });
    }
    
    // Create weighted sampling pool
    const weightedPool = [];
    proxies.forEach(proxy => {
        if (proxy.currentWeight >= minWeight) {
            // Calculate final weight with diversity boost
            let finalWeight = proxy.currentWeight;
            
            // Add small diversity boost to encourage geographic spread
            finalWeight += diversityBoost;
            
            // Convert to integer multiplier for sampling
            const multiplier = Math.max(1, Math.round(finalWeight * 10));
            
            // Add to pool multiple times based on weight
            for (let i = 0; i < multiplier; i++) {
                weightedPool.push(proxy);
            }
        }
    });
    
    if (weightedPool.length === 0) {
        throw new Error('No proxies meet the minimum weight criteria');
    }
    
    // Sample unique proxies
    const sampled = [];
    const usedIds = new Set();
    const shuffled = weightedPool.sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffled.length && sampled.length < count; i++) {
        const proxy = shuffled[i];
        if (!usedIds.has(proxy.id)) {
            sampled.push(proxy);
            usedIds.add(proxy.id);
        }
    }
    
    // Sort by weight (highest first)
    sampled.sort((a, b) => b.currentWeight - a.currentWeight);
    
    // Show sampling results
    const countryDist = {};
    sampled.forEach(p => {
        countryDist[p.country] = (countryDist[p.country] || 0) + 1;
    });
    
    console.log(`\n✅ Sampled ${sampled.length} proxies:`);
    Object.entries(countryDist)
        .sort(([,a], [,b]) => b - a)
        .forEach(([country, count]) => {
            const weight = sampled.find(p => p.country === country).currentWeight;
            console.log(`   ${country}: ${count} proxies (weight: ${weight.toFixed(2)})`);
        });
    
    return sampled;
}

/**
 * Get timezone-aware proxy recommendation
 * @returns {Object} Recommendations and current status
 */
function getTimezoneRecommendations() {
    const proxies = loadAndUpdateProxyWeights();
    
    const countryStats = {};
    proxies.forEach(proxy => {
        if (!countryStats[proxy.country]) {
            countryStats[proxy.country] = {
                count: 0,
                weight: proxy.currentWeight,
                timezoneOffset: proxy.timezoneOffset
            };
        }
        countryStats[proxy.country].count++;
    });
    
    const recommendations = {
        timestamp: new Date().toISOString(),
        recommended: [],
        avoid: [],
        neutral: []
    };
    
    Object.entries(countryStats).forEach(([country, stats]) => {
        const category = {
            country,
            ...stats,
            localTime: new Date(Date.now() + (stats.timezoneOffset * 3600000)).toISOString()
        };
        
        if (stats.weight >= 0.8) {
            recommendations.recommended.push(category);
        } else if (stats.weight <= 0.15) {
            recommendations.avoid.push(category);
        } else {
            recommendations.neutral.push(category);
        }
    });
    
    // Sort by weight
    recommendations.recommended.sort((a, b) => b.weight - a.weight);
    recommendations.neutral.sort((a, b) => b.weight - a.weight);
    recommendations.avoid.sort((a, b) => b.weight - a.weight);
    
    return recommendations;
}

/**
 * CLI interface
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        switch (command) {
            case 'sample':
                const count = parseInt(args[1]) || 10;
                const showWeights = args.includes('--weights');
                const excludeCountries = args.includes('--exclude') ? 
                    args[args.indexOf('--exclude') + 1]?.split(',') || [] : [];
                
                const proxies = sampleTimezoneAwareProxies(count, { 
                    showWeights, 
                    excludeCountries 
                });
                
                if (args.includes('--json')) {
                    console.log('\n' + JSON.stringify(proxies, null, 2));
                }
                break;
                
            case 'recommend':
                const recommendations = getTimezoneRecommendations();
                console.log('\n🌍 Timezone-based Proxy Recommendations');
                console.log(`⏰ Analysis time: ${recommendations.timestamp}`);
                
                console.log('\n✅ RECOMMENDED (High Activity Regions):');
                recommendations.recommended.forEach(r => {
                    const localTime = new Date(r.localTime);
                    console.log(`   ${r.country}: ${r.count} proxies, weight ${r.weight.toFixed(2)}, local time ${localTime.getHours().toString().padStart(2, '0')}:${localTime.getMinutes().toString().padStart(2, '0')}`);
                });
                
                if (recommendations.neutral.length > 0) {
                    console.log('\n⚠️  MODERATE (Lower Activity):');
                    recommendations.neutral.forEach(r => {
                        const localTime = new Date(r.localTime);
                        console.log(`   ${r.country}: ${r.count} proxies, weight ${r.weight.toFixed(2)}, local time ${localTime.getHours().toString().padStart(2, '0')}:${localTime.getMinutes().toString().padStart(2, '0')}`);
                    });
                }
                
                if (recommendations.avoid.length > 0) {
                    console.log('\n🌙 AVOID (Night Time/Low Activity):');
                    recommendations.avoid.forEach(r => {
                        const localTime = new Date(r.localTime);
                        console.log(`   ${r.country}: ${r.count} proxies, weight ${r.weight.toFixed(2)}, local time ${localTime.getHours().toString().padStart(2, '0')}:${localTime.getMinutes().toString().padStart(2, '0')}`);
                    });
                }
                break;
                
            case 'update-weights':
                console.log('🔄 Updating proxy weights...');
                const updated = loadAndUpdateProxyWeights();
                const outputPath = path.join(__dirname, 'proxies', 'http.proxies.v3.json');
                fs.writeFileSync(outputPath, JSON.stringify(updated, null, 2));
                console.log(`✅ Updated ${updated.length} proxy weights`);
                break;
                
            default:
                console.log(`
🌍 Timezone-Aware Proxy Sampler

Usage:
  node timezone-proxy-sampler.js sample [count] [options]
    Sample timezone-weighted proxies
    Options:
      --weights         Show current timezone weights
      --exclude US,CA   Exclude specific countries
      --json           Output as JSON

  node timezone-proxy-sampler.js recommend
    Get timezone-based recommendations

  node timezone-proxy-sampler.js update-weights
    Update proxy weights based on current time

Examples:
  node timezone-proxy-sampler.js sample 20 --weights
  node timezone-proxy-sampler.js sample 10 --exclude US,CA --json
  node timezone-proxy-sampler.js recommend
                `);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Export functions
export {
    loadAndUpdateProxyWeights,
    sampleTimezoneAwareProxies,
    getTimezoneRecommendations
};

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}