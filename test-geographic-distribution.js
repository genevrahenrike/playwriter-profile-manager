#!/usr/bin/env node

import { ProfileLauncher } from './src/ProfileLauncher.js';
import { ProfileManager } from './src/ProfileManager.js';
import { GeographicProxyRotator } from './src/GeographicProxyRotator.js';
import chalk from 'chalk';

/**
 * Test script to validate the geographic proxy distribution system
 * 
 * This script simulates allocating proxies to verify:
 * 1. Geographic distribution matches specified ratios
 * 2. Even proxy usage within each region
 * 3. Proper handling of US datacenter + resident vs other regions resident only
 * 4. Australia proxy reduction is applied correctly
 */

async function testGeographicDistribution() {
    console.log(chalk.blue('🧪 Testing Geographic Proxy Distribution System'));
    console.log('='.repeat(70));

    const profileManager = new ProfileManager();
    const profileLauncher = new ProfileLauncher(profileManager, {});

    // Test different geographic ratios
    const testRatios = [
        'US:45,Other:55',
        'US:40,EU:35,Other:25',
        'US:50,UK:20,Other:30',
        'US:60,Other:40'
    ];

    for (const ratio of testRatios) {
        console.log(`\n${chalk.cyan(`Testing ratio: ${ratio}`)}`);
        console.log('-'.repeat(50));
        
        try {
            const rotator = new GeographicProxyRotator(profileLauncher.proxyManager, {
                geographicRatio: ratio,
                skipIPCheck: true, // Skip IP checks for faster testing
                maxProfilesPerIP: 10 // Higher limit for testing
            });

            const hasProxies = await rotator.initialize();
            if (!hasProxies) {
                console.log(chalk.red('❌ No proxies available'));
                continue;
            }

            // Simulate allocating 100 proxies
            const allocations = [];
            const maxAllocations = 100;
            
            console.log(`📊 Simulating ${maxAllocations} proxy allocations...`);
            
            for (let i = 0; i < maxAllocations; i++) {
                try {
                    const result = await rotator.getNextProxy();
                    if (result) {
                        allocations.push({
                            proxy: result.proxy,
                            region: result.region,
                            country: result.proxy.customName || result.proxy.country,
                            connectionType: result.proxy.connectionType
                        });
                    } else {
                        console.log(chalk.yellow(`⚠️  Ran out of proxies after ${i} allocations`));
                        break;
                    }
                } catch (error) {
                    console.log(chalk.red(`❌ Error at allocation ${i}: ${error.message}`));
                    break;
                }
            }

            // Print results
            rotator.printStats();
            
            // Analyze the results
            console.log('\n📈 Detailed Analysis:');
            
            const regionBreakdown = {};
            const countryBreakdown = {};
            const connectionTypeBreakdown = {};
            const proxyUsage = {};
            
            for (const allocation of allocations) {
                // Track by region
                if (!regionBreakdown[allocation.region]) regionBreakdown[allocation.region] = 0;
                regionBreakdown[allocation.region]++;
                
                // Track by country
                if (!countryBreakdown[allocation.country]) countryBreakdown[allocation.country] = 0;
                countryBreakdown[allocation.country]++;
                
                // Track by connection type
                const key = `${allocation.country}-${allocation.connectionType}`;
                if (!connectionTypeBreakdown[key]) connectionTypeBreakdown[key] = 0;
                connectionTypeBreakdown[key]++;
                
                // Track proxy usage for evenness
                if (!proxyUsage[allocation.proxy.label]) proxyUsage[allocation.proxy.label] = 0;
                proxyUsage[allocation.proxy.label]++;
            }
            
            // Print region breakdown
            console.log('\nRegion distribution:');
            for (const [region, count] of Object.entries(regionBreakdown)) {
                const percentage = ((count / allocations.length) * 100).toFixed(1);
                console.log(`  ${region}: ${count} (${percentage}%)`);
            }
            
            // Print country breakdown
            console.log('\nCountry distribution:');
            Object.entries(countryBreakdown)
                .sort((a, b) => b[1] - a[1])
                .forEach(([country, count]) => {
                    const percentage = ((count / allocations.length) * 100).toFixed(1);
                    console.log(`  ${country}: ${count} (${percentage}%)`);
                });
            
            // Print connection type breakdown
            console.log('\nConnection type by country:');
            Object.entries(connectionTypeBreakdown)
                .sort((a, b) => b[1] - a[1])
                .forEach(([key, count]) => {
                    const percentage = ((count / allocations.length) * 100).toFixed(1);
                    console.log(`  ${key}: ${count} (${percentage}%)`);
                });
            
            // Check for even proxy usage within regions
            console.log('\nProxy usage evenness:');
            const usageCounts = Object.values(proxyUsage);
            const minUsage = Math.min(...usageCounts);
            const maxUsage = Math.max(...usageCounts);
            const avgUsage = (usageCounts.reduce((sum, count) => sum + count, 0) / usageCounts.length).toFixed(1);
            
            console.log(`  Min usage per proxy: ${minUsage}`);
            console.log(`  Max usage per proxy: ${maxUsage}`);
            console.log(`  Avg usage per proxy: ${avgUsage}`);
            console.log(`  Usage variance: ${maxUsage - minUsage}`);
            
            if (maxUsage - minUsage <= 1) {
                console.log(chalk.green('  ✅ Excellent proxy usage distribution (variance ≤ 1)'));
            } else if (maxUsage - minUsage <= 2) {
                console.log(chalk.yellow('  ⚠️  Good proxy usage distribution (variance ≤ 2)'));
            } else {
                console.log(chalk.red('  ❌ Poor proxy usage distribution (variance > 2)'));
            }
            
        } catch (error) {
            console.log(chalk.red(`❌ Test failed: ${error.message}`));
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log(chalk.blue('🎯 Geographic Distribution Test Complete'));
}

// Test specific scenarios
async function testSpecificScenarios() {
    console.log(chalk.blue('\n🔍 Testing Specific Scenarios'));
    console.log('='.repeat(50));

    const profileManager = new ProfileManager();
    const profileLauncher = new ProfileLauncher(profileManager, {});

    // Test 1: Verify US gets both resident and datacenter
    console.log(chalk.cyan('\n1. Testing US resident + datacenter inclusion'));
    
    const rotator = new GeographicProxyRotator(profileLauncher.proxyManager, {
        geographicRatio: 'US:100', // 100% US to test inclusion
        skipIPCheck: true,
        maxProfilesPerIP: 10
    });

    await rotator.initialize();
    
    // Check the categorized proxies
    const stats = rotator.getStats();
    console.log('US Region Stats:', stats.regionStats.US);
    
    // Manually check proxy types in US region
    const usRegion = rotator.regions.get('US');
    if (usRegion) {
        const residentCount = usRegion.proxies.filter(p => p.connectionType === 'resident').length;
        const datacenterCount = usRegion.proxies.filter(p => p.connectionType === 'datacenter' || p.connectionType === 'dataCenter').length;
        
        console.log(`  US Resident proxies: ${residentCount}`);
        console.log(`  US Datacenter proxies: ${datacenterCount}`);
        console.log(`  Total US proxies: ${residentCount + datacenterCount}`);
        
        if (datacenterCount > 0) {
            console.log(chalk.green('  ✅ US includes both resident and datacenter proxies'));
        } else {
            console.log(chalk.red('  ❌ US missing datacenter proxies'));
        }
    }

    // Test 2: Verify Australia reduction
    console.log(chalk.cyan('\n2. Testing Australia proxy reduction (50%)'));
    
    const otherRegion = rotator.regions.get('Other');
    if (otherRegion) {
        const australiaProxies = otherRegion.proxies.filter(p => (p.customName || p.country) === 'Australia');
        console.log(`  Australia proxies in Other region: ${australiaProxies.length}`);
        console.log(`  (Should be ~50% of total Australia proxies from proxy file)`);
        
        // Compare with original count from analyze-proxy-distribution
        console.log(`  Original Australia count from analysis: 50`);
        console.log(`  Reduction ratio: ${(australiaProxies.length / 50 * 100).toFixed(1)}%`);
        
        if (australiaProxies.length <= 25) { // Should be roughly 50% of 50 = 25
            console.log(chalk.green('  ✅ Australia proxy reduction applied correctly'));
        } else {
            console.log(chalk.red('  ❌ Australia proxy reduction not applied'));
        }
    }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        await testGeographicDistribution();
        await testSpecificScenarios();
    } catch (error) {
        console.error(chalk.red('Test execution failed:'), error);
        process.exit(1);
    }
}