#!/usr/bin/env node
/**
 * Simple Batch Integration for Proxy Cycling
 * Easy interface for batch automation system
 */

import { getProxyForTimeSlot, getOptimizedBatchProxies } from './proxy-cycling.js';

/**
 * Get next proxy for batch automation
 * Automatically handles time slots and cycling
 * @param {number} batchIndex - Current batch run index (0, 1, 2, ...)
 * @param {Object} options - Configuration options
 * @returns {Object} Proxy with rotation info
 */
function getNextBatchProxy(batchIndex = 0, options = {}) {
    const {
        runsPerHour = 12,        // Max runs per hour (every 5 minutes)
        startHourOffset = 0,     // Start immediately or delay
        showDetails = false      // Detailed output
    } = options;
    
    // Calculate which hour and run within hour
    const hourOffset = startHourOffset + Math.floor(batchIndex / runsPerHour);
    const runInHour = batchIndex % runsPerHour;
    
    if (showDetails) {
        console.log(`🎯 Batch Run #${batchIndex}`);
        console.log(`📅 Hour offset: ${hourOffset}, Run: ${runInHour}`);
    }
    
    const result = getProxyForTimeSlot(hourOffset, runInHour);
    
    if (!result) {
        throw new Error(`No proxy available for batch index ${batchIndex}`);
    }
    
    return {
        batchIndex,
        proxy: result.proxy,
        hourOffset,
        runInHour,
        estimatedDelayMinutes: (hourOffset * 60) + (runInHour * 5),
        ipRotationWindow: result.estimatedRotation,
        country: result.proxy.country,
        weight: result.proxy.currentWeight
    };
}

/**
 * Pre-generate proxy list for entire batch operation
 * @param {number} totalRuns - Total number of runs planned
 * @param {Object} options - Configuration options
 * @returns {Array} Complete proxy schedule
 */
function generateBatchProxyList(totalRuns = 50, options = {}) {
    const {
        maxHours = 24,           // Max hours to spread across
        showSummary = true       // Show summary stats
    } = options;
    
    const hoursNeeded = Math.ceil(totalRuns / 12); // 12 runs per hour max
    const actualHours = Math.min(hoursNeeded, maxHours);
    
    if (showSummary) {
        console.log(`📋 Generating proxy list for ${totalRuns} batch runs`);
        console.log(`⏰ Spreading across ${actualHours} hours (${Math.ceil(totalRuns/actualHours)} runs/hour avg)`);
    }
    
    const proxyList = [];
    
    for (let i = 0; i < totalRuns; i++) {
        try {
            const batchProxy = getNextBatchProxy(i, { 
                runsPerHour: Math.ceil(totalRuns / actualHours),
                showDetails: false 
            });
            proxyList.push(batchProxy);
        } catch (error) {
            console.error(`⚠️  Could not assign proxy for batch ${i}: ${error.message}`);
        }
    }
    
    if (showSummary) {
        // Show distribution
        const distribution = {};
        proxyList.forEach(bp => {
            distribution[bp.country] = (distribution[bp.country] || 0) + 1;
        });
        
        console.log('\n✅ Final Distribution:');
        Object.entries(distribution)
            .sort(([,a], [,b]) => b - a)
            .forEach(([country, count]) => {
                const pct = ((count / totalRuns) * 100).toFixed(1);
                console.log(`   ${country}: ${count} runs (${pct}%)`);
            });
    }
    
    return proxyList;
}

/**
 * CLI interface for easy testing
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        switch (command) {
            case 'next':
                const batchIndex = parseInt(args[1]) || 0;
                const result = getNextBatchProxy(batchIndex, { showDetails: true });
                
                console.log('\n📋 Proxy Details:');
                console.log(`   Country: ${result.country}`);
                console.log(`   Weight: ${result.weight.toFixed(2)}`);
                console.log(`   Host: ${result.proxy.host}:${result.proxy.port}`);
                console.log(`   Estimated delay: ${result.estimatedDelayMinutes} minutes`);
                console.log(`   IP rotation in: ${result.ipRotationWindow} minutes`);
                
                if (args.includes('--json')) {
                    console.log('\n' + JSON.stringify(result, null, 2));
                }
                break;
                
            case 'list':
                const totalRuns = parseInt(args[1]) || 20;
                const list = generateBatchProxyList(totalRuns);
                
                if (args.includes('--json')) {
                    console.log('\n' + JSON.stringify(list, null, 2));
                } else if (args.includes('--csv')) {
                    console.log('\nbatchIndex,country,host,port,username,password,delayMinutes,weight');
                    list.forEach(item => {
                        const p = item.proxy;
                        console.log(`${item.batchIndex},${item.country},${p.host},${p.port},${p.username},${p.password},${item.estimatedDelayMinutes},${item.weight.toFixed(2)}`);
                    });
                }
                break;
                
            default:
                console.log(`
🚀 Simple Batch Proxy Integration

Commands:
  next <batchIndex>
    Get proxy for specific batch run number
    
  list <totalRuns>
    Generate complete proxy list for batch operation

Options:
  --json    Output as JSON
  --csv     Output as CSV (for list command)

Examples:
  node simple-batch-proxy.js next 0        # Get first proxy
  node simple-batch-proxy.js next 25       # Get 26th proxy  
  node simple-batch-proxy.js list 100      # Generate 100-run list
  node simple-batch-proxy.js list 50 --csv # Export as CSV

Integration:
  # In your batch script:
  PROXY_INFO=$(node simple-batch-proxy.js next $BATCH_INDEX --json)
  HOST=$(echo $PROXY_INFO | jq -r '.proxy.host')
  PORT=$(echo $PROXY_INFO | jq -r '.proxy.port')
                `);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Export functions
export {
    getNextBatchProxy,
    generateBatchProxyList
};

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}