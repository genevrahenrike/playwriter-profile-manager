#!/usr/bin/env node
/**
 * Smart Proxy Cycling System
 * Handles proxy reuse with IP rotation awareness for 24/7 batch operations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateTimezoneWeight, COUNTRY_TIMEZONES } from './generate-timezone-aware-proxies.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROXY_ROTATION_MINUTES = 5;  // IP rotation every 5 minutes
const BATCH_RUNS_PER_HOUR = 12;    // Assuming 1 run every 5 minutes = 12/hour max
const SAFE_REUSE_HOURS = 2;        // Wait 2 hours before reusing same proxy in same region

/**
 * Calculate time-slot aware proxy distribution
 * @param {Array} proxies - Available proxies
 * @param {number} hoursAhead - How many hours ahead to plan (default 24)
 * @returns {Object} Proxy schedule organized by hour
 */
function createProxySchedule(proxies, hoursAhead = 24) {
    const schedule = {};
    const proxyUsage = {}; // Track when each proxy was last used per region
    
    console.log('🗓️  Creating 24-hour proxy schedule...');
    console.log(`📊 Available: ${proxies.length} proxies across ${new Set(proxies.map(p => p.country)).size} countries`);
    console.log(`⏰ IP rotation: Every ${PROXY_ROTATION_MINUTES} minutes`);
    console.log(`🔄 Safe reuse window: ${SAFE_REUSE_HOURS} hours`);
    
    for (let hour = 0; hour < hoursAhead; hour++) {
        const currentTime = new Date(Date.now() + (hour * 60 * 60 * 1000));
        schedule[hour] = {
            timestamp: currentTime.toISOString(),
            localTime: currentTime.toLocaleString(),
            proxies: []
        };
        
        // Calculate timezone weights for this hour
        const proxiesWithWeights = proxies.map(proxy => ({
            ...proxy,
            currentWeight: calculateTimezoneWeight(proxy.country, currentTime),
            hourOffset: hour
        }));
        
        // Create weighted pool for this hour
        const weightedPool = [];
        proxiesWithWeights.forEach(proxy => {
            // Check if proxy can be reused (hasn't been used recently in this region)
            const lastUsed = proxyUsage[`${proxy.id}_${proxy.country}`] || -999;
            const canReuse = (hour - lastUsed) >= SAFE_REUSE_HOURS;
            
            if (canReuse && proxy.currentWeight >= 0.05) { // Very low threshold
                const multiplier = Math.max(1, Math.round(proxy.currentWeight * 10));
                for (let i = 0; i < multiplier; i++) {
                    weightedPool.push(proxy);
                }
            }
        });
        
        // If we don't have enough proxies, allow more aggressive reuse
        if (weightedPool.length < 15) {
            proxiesWithWeights.forEach(proxy => {
                if (proxy.currentWeight >= 0.05) {
                    const multiplier = Math.max(1, Math.round(proxy.currentWeight * 5));
                    for (let i = 0; i < multiplier; i++) {
                        weightedPool.push(proxy);
                    }
                }
            });
        }
        
        // Sample proxies for this hour (need ~15 for high-volume hours)
        let neededProxies = 15; // Default
        if (weightedPool.length > 0) {
            const avgWeight = weightedPool.reduce((sum, p) => sum + p.currentWeight, 0) / weightedPool.length;
            neededProxies = avgWeight >= 0.8 ? 15 : 
                          avgWeight >= 0.3 ? 10 : 5;
        }
        
        const shuffled = weightedPool.sort(() => Math.random() - 0.5);
        const selectedIds = new Set();
        
        for (let i = 0; i < shuffled.length && schedule[hour].proxies.length < neededProxies; i++) {
            const proxy = shuffled[i];
            if (!selectedIds.has(proxy.id)) {
                schedule[hour].proxies.push(proxy);
                selectedIds.add(proxy.id);
                
                // Mark this proxy as used
                proxyUsage[`${proxy.id}_${proxy.country}`] = hour;
            }
        }
        
        // Sort by weight for this hour
        schedule[hour].proxies.sort((a, b) => b.currentWeight - a.currentWeight);
    }
    
    return schedule;
}

/**
 * Get proxy for specific time slot with cycling awareness
 * @param {number} hourOffset - Hours from now (0 = now, 1 = 1 hour from now)
 * @param {number} runIndex - Which run within the hour (0-11 for 5min intervals)
 * @returns {Object} Selected proxy with timing info
 */
function getProxyForTimeSlot(hourOffset = 0, runIndex = 0) {
    const proxiesPath = path.join(__dirname, 'proxies', 'http.proxies.v3.json');
    const proxies = JSON.parse(fs.readFileSync(proxiesPath, 'utf8'));
    
    const schedule = createProxySchedule(proxies, Math.max(24, hourOffset + 1));
    const hourSlot = schedule[hourOffset];
    
    if (!hourSlot || hourSlot.proxies.length === 0) {
        console.log(`❌ No proxies available for hour offset ${hourOffset}`);
        return null;
    }
    
    // Select proxy based on run index (cycle through available proxies)
    const proxyIndex = runIndex % hourSlot.proxies.length;
    const selectedProxy = hourSlot.proxies[proxyIndex];
    
    console.log('🎯 Time-Slot Proxy Selection');
    console.log(`⏰ Target time: ${hourSlot.localTime}`);
    console.log(`🔄 Run index: ${runIndex} (${runIndex * 5} minutes into hour)`);
    console.log(`📍 Selected: ${selectedProxy.country} (weight: ${selectedProxy.currentWeight.toFixed(2)})`);
    console.log(`🔢 Available proxies for this hour: ${hourSlot.proxies.length}`);
    
    return {
        proxy: selectedProxy,
        timeSlot: hourSlot,
        runIndex,
        estimatedRotation: runIndex * PROXY_ROTATION_MINUTES
    };
}

/**
 * Analyze proxy distribution across 24 hours
 */
function analyzeProxyDistribution() {
    const proxiesPath = path.join(__dirname, 'proxies', 'http.proxies.v3.json');
    const proxies = JSON.parse(fs.readFileSync(proxiesPath, 'utf8'));
    
    console.log('📊 24-Hour Proxy Distribution Analysis');
    console.log(`🌍 Total proxies available: ${proxies.length}\n`);
    
    const schedule = createProxySchedule(proxies, 24);
    const distribution = {};
    const hourlyStats = {};
    
    for (let hour = 0; hour < 24; hour++) {
        const slot = schedule[hour];
        const utcHour = new Date(slot.timestamp).getUTCHours();
        
        hourlyStats[hour] = {
            utcHour,
            totalProxies: slot.proxies.length,
            countries: {}
        };
        
        slot.proxies.forEach(proxy => {
            // Country distribution
            if (!distribution[proxy.country]) {
                distribution[proxy.country] = { total: 0, hours: [] };
            }
            distribution[proxy.country].total++;
            distribution[proxy.country].hours.push(hour);
            
            // Hourly country stats
            if (!hourlyStats[hour].countries[proxy.country]) {
                hourlyStats[hour].countries[proxy.country] = 0;
            }
            hourlyStats[hour].countries[proxy.country]++;
        });
    }
    
    // Show 24-hour timeline
    console.log('🕐 24-Hour Timeline (showing proxy counts by country):');
    console.log('Hour | Total | US | KR | SG | CA | UK | DE | FR');
    console.log('-----|-------|----|----|----|----|----|----|----|');
    
    for (let hour = 0; hour < 24; hour++) {
        const stats = hourlyStats[hour];
        const counts = ['US', 'KR', 'SG', 'CA', 'UK', 'DE', 'FR'].map(c => 
            (stats.countries[c] || 0).toString().padStart(2, ' ')
        );
        console.log(`${hour.toString().padStart(4, ' ')} | ${stats.totalProxies.toString().padStart(5, ' ')} | ${counts.join(' | ')}`);
    }
    
    // Show reuse statistics
    console.log('\n🔄 Proxy Reuse Analysis:');
    Object.entries(distribution).forEach(([country, data]) => {
        const reuseRate = (data.total / proxies.filter(p => p.country === country).length).toFixed(1);
        console.log(`   ${country}: Used ${data.total} times across ${data.hours.length} hours (${reuseRate}x reuse rate)`);
    });
    
    return { schedule, distribution, hourlyStats };
}

/**
 * Get optimized proxy list for batch operations
 * @param {number} batchSize - Number of batch runs planned
 * @param {number} hoursSpread - Hours to spread the batch across
 * @returns {Array} Optimized proxy list with timing
 */
function getOptimizedBatchProxies(batchSize = 50, hoursSpread = 12) {
    const proxiesPath = path.join(__dirname, 'proxies', 'http.proxies.v3.json');
    const proxies = JSON.parse(fs.readFileSync(proxiesPath, 'utf8'));
    
    console.log(`🚀 Optimizing proxy selection for ${batchSize} batch runs over ${hoursSpread} hours`);
    
    const schedule = createProxySchedule(proxies, hoursSpread);
    const batchProxies = [];
    
    // Distribute batch runs across the time period
    const runsPerHour = Math.ceil(batchSize / hoursSpread);
    let totalAssigned = 0;
    
    for (let hour = 0; hour < hoursSpread && totalAssigned < batchSize; hour++) {
        const slot = schedule[hour];
        const runsThisHour = Math.min(runsPerHour, batchSize - totalAssigned);
        
        for (let run = 0; run < runsThisHour && totalAssigned < batchSize; run++) {
            const proxyIndex = run % slot.proxies.length;
            const proxy = slot.proxies[proxyIndex];
            
            batchProxies.push({
                batchIndex: totalAssigned,
                hourOffset: hour,
                runInHour: run,
                estimatedTime: new Date(Date.now() + (hour * 60 * 60 * 1000) + (run * 5 * 60 * 1000)),
                proxy: proxy,
                ipRotationWindow: run * PROXY_ROTATION_MINUTES
            });
            
            totalAssigned++;
        }
    }
    
    // Show distribution summary
    const countryDist = {};
    batchProxies.forEach(bp => {
        countryDist[bp.proxy.country] = (countryDist[bp.proxy.country] || 0) + 1;
    });
    
    console.log('\n✅ Batch Proxy Distribution:');
    Object.entries(countryDist)
        .sort(([,a], [,b]) => b - a)
        .forEach(([country, count]) => {
            const percentage = ((count / batchSize) * 100).toFixed(1);
            console.log(`   ${country}: ${count} runs (${percentage}%)`);
        });
    
    return batchProxies;
}

/**
 * CLI interface
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        switch (command) {
            case 'slot':
                const hourOffset = parseInt(args[1]) || 0;
                const runIndex = parseInt(args[2]) || 0;
                const result = getProxyForTimeSlot(hourOffset, runIndex);
                
                if (args.includes('--json') && result) {
                    console.log('\n' + JSON.stringify(result, null, 2));
                }
                break;
                
            case 'analyze':
                analyzeProxyDistribution();
                break;
                
            case 'batch':
                const batchSize = parseInt(args[1]) || 50;
                const hoursSpread = parseInt(args[2]) || 12;
                const batchProxies = getOptimizedBatchProxies(batchSize, hoursSpread);
                
                if (args.includes('--json')) {
                    console.log('\n' + JSON.stringify(batchProxies, null, 2));
                }
                break;
                
            default:
                console.log(`
🔄 Smart Proxy Cycling System

Commands:
  slot <hourOffset> <runIndex>
    Get proxy for specific time slot
    hourOffset: Hours from now (0=now, 1=1hr from now)
    runIndex: Run within hour (0-11 for 5min intervals)
    
  analyze
    Show 24-hour proxy distribution analysis
    
  batch <size> <hours>
    Get optimized proxy list for batch operations
    size: Number of batch runs (default: 50)
    hours: Hours to spread across (default: 12)

Options:
  --json    Output as JSON

Examples:
  node proxy-cycling.js slot 0 0      # Get proxy for current time
  node proxy-cycling.js slot 2 6      # Get proxy for 2hrs+30min from now
  node proxy-cycling.js analyze       # Show full 24h analysis
  node proxy-cycling.js batch 100 24  # Plan 100 runs over 24 hours
                `);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Export functions
export {
    createProxySchedule,
    getProxyForTimeSlot,
    analyzeProxyDistribution,
    getOptimizedBatchProxies,
    PROXY_ROTATION_MINUTES,
    SAFE_REUSE_HOURS
};

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}