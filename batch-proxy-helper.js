#!/usr/bin/env node
/**
 * Integration helper for batch automation system
 * Provides timezone-aware proxy selection for batch account creation
 * Uses weighted sampling - ALL regions included but with timezone-based weights
 */

import { sampleTimezoneAwareProxies, getTimezoneRecommendations } from './timezone-proxy-sampler.js';

/**
 * Get proxy for batch automation with timezone awareness
 * Uses weighted sampling across ALL regions (no exclusions)
 * @param {Object} options - Batch automation options
 * @returns {Object} Selected proxy with timezone info
 */
function getProxyForBatchAutomation(options = {}) {
    const {
        preferredCountries = [],       // Specific countries to get extra boost
        showDetails = true             // Show selection details
    } = options;
    
    if (showDetails) {
        console.log('🤖 Batch Automation Proxy Selection');
        console.log(`📅 ${new Date().toLocaleString()}`);
        console.log('🌍 Using timezone-weighted sampling (all regions included)');
    }
    
    // Sample 1 proxy using natural timezone weights - NO EXCLUSIONS
    const proxies = sampleTimezoneAwareProxies(1, {
        minWeight: 0.05,              // Very low minimum - include almost everything
        excludeCountries: [],         // NO EXCLUSIONS - include all countries
        preferCountries: preferredCountries,
        diversityBoost: 0.1,          // Low diversity boost - let timezone weights dominate
        showWeights: showDetails
    });
    
    const selectedProxy = proxies[0];
    
    if (!selectedProxy) {
        console.log('❌ No proxies available');
        return null;
    }
    
    if (showDetails) {
        console.log(`\n✅ Selected Proxy:`);
        console.log(`   Country: ${selectedProxy.country} (${selectedProxy.customName})`);
        console.log(`   Timezone Weight: ${selectedProxy.currentWeight.toFixed(2)}`);
        console.log(`   Host: ${selectedProxy.host}:${selectedProxy.port}`);
        
        const localTime = new Date(Date.now() + (selectedProxy.timezoneOffset * 3600000));
        console.log(`   Local Time: ${localTime.toLocaleTimeString()}`);
    }
    
    return selectedProxy;
}

/**
 * Get multiple proxies for batch runs with geographic distribution
 * Uses weighted sampling to maintain realistic timezone distribution
 * @param {number} count - Number of proxies needed
 * @param {Object} options - Selection options
 * @returns {Array} Array of selected proxies
 */
function getProxiesForBatchRuns(count = 5, options = {}) {
    const {
        maxFromSameCountry = Math.ceil(count / 2), // Allow more from popular regions
        showDetails = true
    } = options;
    
    if (showDetails) {
        console.log(`🌍 Batch Runs Proxy Selection (${count} proxies)`);
        console.log('🕐 Using timezone-weighted sampling across all regions');
    }
    
    // Get a sample that's 3x larger to ensure good geographic mix
    // But still use timezone weights for natural distribution
    const sampleSize = Math.min(count * 4, 100);
    const candidateProxies = sampleTimezoneAwareProxies(sampleSize, {
        minWeight: 0.05,              // Very low threshold - include all regions
        excludeCountries: [],         // NO EXCLUSIONS
        showWeights: showDetails,
        diversityBoost: 0.3           // Moderate diversity boost
    });
    
    if (candidateProxies.length === 0) {
        console.log('❌ No proxies available');
        return [];
    }
    
    // Select proxies with some geographic distribution but respect timezone weights
    const selected = [];
    const countryCount = {};
    
    // First pass: select up to maxFromSameCountry from each country
    for (const proxy of candidateProxies) {
        if (selected.length >= count) break;
        
        const currentCountryCount = countryCount[proxy.country] || 0;
        
        if (currentCountryCount < maxFromSameCountry) {
            selected.push(proxy);
            countryCount[proxy.country] = currentCountryCount + 1;
        }
    }
    
    // Second pass: if we need more proxies, fill from any available
    if (selected.length < count) {
        for (const proxy of candidateProxies) {
            if (selected.length >= count) break;
            
            if (!selected.some(p => p.id === proxy.id)) {
                selected.push(proxy);
                countryCount[proxy.country] = (countryCount[proxy.country] || 0) + 1;
            }
        }
    }
    
    if (showDetails) {
        // Show distribution with timezone context
        console.log('\n✅ Selected Proxy Distribution:');
        Object.entries(countryCount).forEach(([country, count]) => {
            const proxy = selected.find(p => p.country === country);
            const localTime = new Date(Date.now() + (proxy.timezoneOffset * 3600000));
            const weightStr = proxy.currentWeight >= 0.8 ? '🟢' : 
                            proxy.currentWeight >= 0.3 ? '🟡' : '🔴';
            console.log(`   ${country}: ${count} proxies ${weightStr} (weight: ${proxy.currentWeight.toFixed(2)}, local: ${localTime.toLocaleTimeString()})`);
        });
        
        console.log('\n🕐 Legend: 🟢 Peak hours  🟡 Moderate  🔴 Night time');
    }
    
    return selected;
}

/**
 * CLI interface for batch automation
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        switch (command) {
            case 'single':
                const proxy = getProxyForBatchAutomation({
                    showDetails: !args.includes('--quiet')
                });
                if (args.includes('--json') && proxy) {
                    console.log('\n' + JSON.stringify(proxy, null, 2));
                }
                break;
                
            case 'batch':
                const count = parseInt(args[1]) || 5;
                const proxies = getProxiesForBatchRuns(count, {
                    showDetails: !args.includes('--quiet')
                });
                
                if (args.includes('--json')) {
                    console.log('\n' + JSON.stringify(proxies, null, 2));
                }
                break;
                
            case 'status':
                const recs = getTimezoneRecommendations();
                
                console.log('🕐 Current Timezone Status for Batch Automation');
                console.log(`⏰ Analysis time: ${new Date(recs.timestamp).toLocaleString()}`);
                
                if (recs.recommended.length > 0) {
                    console.log('\n✅ Best regions for account creation right now:');
                    recs.recommended.forEach(r => {
                        const localTime = new Date(r.localTime);
                        console.log(`   ${r.country}: Business hours (${localTime.toLocaleTimeString()}), ${r.count} proxies available`);
                    });
                } else {
                    console.log('\n⚠️  No regions currently in peak business hours');
                }
                
                if (recs.neutral.length > 0) {
                    console.log('\n⚠️  Moderate activity regions:');
                    recs.neutral.forEach(r => {
                        const localTime = new Date(r.localTime);
                        console.log(`   ${r.country}: ${localTime.toLocaleTimeString()}, ${r.count} proxies available`);
                    });
                }
                
                if (recs.avoid.length > 0) {
                    console.log('\n🌙 Lower activity regions (night time):');
                    recs.avoid.forEach(r => {
                        const localTime = new Date(r.localTime);
                        console.log(`   ${r.country}: ${localTime.toLocaleTimeString()}, ${r.count} proxies available`);
                    });
                }
                break;
                
            default:
                console.log(`
🤖 Batch Automation Proxy Helper

Commands:
  single [--quiet] [--json]
    Get single proxy using timezone-weighted sampling
    
  batch <count> [--quiet] [--json]  
    Get multiple proxies with timezone-aware distribution
    
  status
    Show current timezone status and recommendations

Options:
  --quiet           Minimal output (no details)
  --json            Output as JSON

Examples:
  node batch-proxy-helper.js single
  node batch-proxy-helper.js batch 10 --json
  node batch-proxy-helper.js status

Note: All regions are included with timezone-based weighting.
      Peak hours = higher chance, night time = lower chance.
                `);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Export functions
export {
    getProxyForBatchAutomation,
    getProxiesForBatchRuns
};

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}