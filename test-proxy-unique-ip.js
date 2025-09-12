#!/usr/bin/env node

import { ProxyManager } from './src/ProxyManager.js';
import { ProxyRotator } from './src/ProxyRotator.js';
import { IPTracker } from './src/IPTracker.js';

async function testProxyUniqueIPLogic() {
    console.log('🧪 Testing Enhanced Proxy Rotation Logic with Global IP Uniqueness\n');
    
    try {
        // Initialize proxy manager and rotator
        const proxyManager = new ProxyManager();
        const proxyRotator = new ProxyRotator(proxyManager, {
            maxProfilesPerIP: 2 // Lower limit for testing
        });
        
        const hasProxies = await proxyRotator.initialize();
        if (!hasProxies) {
            console.log('❌ No proxies available for testing');
            return;
        }
        
        console.log('✅ Proxy rotator initialized successfully\n');
        
        // Test 1: Get initial proxy assignments
        console.log('📋 Test 1: Initial proxy assignments');
        const assignments = [];
        
        for (let i = 1; i <= 6; i++) {
            try {
                const result = await proxyRotator.getNextProxy();
                if (result) {
                    assignments.push({
                        profile: `test-profile-${i}`,
                        proxy: result.proxy.label,
                        ip: proxyRotator.ipTracker.currentBatchIPs.get(result.proxy.label)
                    });
                    console.log(`   Profile ${i}: ${result.proxy.label} -> IP: ${proxyRotator.ipTracker.currentBatchIPs.get(result.proxy.label)}`);
                } else {
                    console.log(`   Profile ${i}: ❌ No proxy available (all exhausted)`);
                    break;
                }
            } catch (error) {
                console.log(`   Profile ${i}: ❌ Error: ${error.message}`);
                break;
            }
        }
        
        // Test 2: Show statistics
        console.log('\n📊 Test 2: Current statistics');
        const stats = proxyRotator.getStats();
        console.log(`   Total unique IPs: ${stats.totalUniqueIPs}`);
        console.log(`   Global IPs at limit: ${stats.globalIPsAtLimit}/${stats.totalGlobalIPs}`);
        console.log(`   Max profiles per IP: ${stats.maxProfilesPerIP}`);
        
        // Show per-proxy stats
        console.log('\n   Per-proxy statistics:');
        for (const [label, proxyStats] of Object.entries(stats.proxyStats)) {
            console.log(`     ${label}: ${proxyStats.currentUsage}/${stats.maxProfilesPerIP} profiles, IP: ${proxyStats.currentIP}`);
        }
        
        // Show global IP usage
        if (stats.globalIPStats && Object.keys(stats.globalIPStats).length > 0) {
            console.log('\n   Global IP usage:');
            for (const [ip, ipStats] of Object.entries(stats.globalIPStats)) {
                const status = ipStats.atLimit ? '🔴 AT LIMIT' : '🟢 Available';
                console.log(`     ${ip}: ${ipStats.usage}/${stats.maxProfilesPerIP} profiles (${ipStats.proxies.join(', ')}) ${status}`);
            }
        }
        
        // Test 3: Verify IP uniqueness
        console.log('\n🔍 Test 3: IP uniqueness verification');
        const ipToProxies = new Map();
        
        for (const assignment of assignments) {
            if (!ipToProxies.has(assignment.ip)) {
                ipToProxies.set(assignment.ip, []);
            }
            ipToProxies.get(assignment.ip).push(assignment.proxy);
        }
        
        let duplicateIPs = 0;
        for (const [ip, proxies] of ipToProxies.entries()) {
            if (proxies.length > stats.maxProfilesPerIP) {
                console.log(`   ❌ IP ${ip} used by ${proxies.length} profiles (${proxies.join(', ')}) - EXCEEDS LIMIT`);
                duplicateIPs++;
            } else if (proxies.length > 1) {
                console.log(`   ⚠️  IP ${ip} used by ${proxies.length} profiles (${proxies.join(', ')}) - within limit`);
            } else {
                console.log(`   ✅ IP ${ip} used by 1 profile (${proxies[0]}) - unique`);
            }
        }
        
        // Test 4: Try to get more proxies (should fail or cycle)
        console.log('\n🔄 Test 4: Attempting to get additional proxies');
        try {
            const extraResult = await proxyRotator.getNextProxy();
            if (extraResult) {
                console.log(`   Got additional proxy: ${extraResult.proxy.label} -> IP: ${proxyRotator.ipTracker.currentBatchIPs.get(extraResult.proxy.label)}`);
            } else {
                console.log('   ✅ No additional proxies available (correctly blocked)');
            }
        } catch (error) {
            console.log(`   ✅ Additional proxy blocked: ${error.message}`);
        }
        
        // Summary
        console.log('\n📋 Test Summary:');
        console.log(`   Total profiles assigned: ${assignments.length}`);
        console.log(`   Unique IPs used: ${ipToProxies.size}`);
        console.log(`   IPs exceeding limit: ${duplicateIPs}`);
        
        if (duplicateIPs === 0) {
            console.log('   ✅ SUCCESS: No duplicate IPs beyond limit detected!');
        } else {
            console.log('   ❌ FAILURE: Duplicate IPs beyond limit detected!');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testProxyUniqueIPLogic().catch(console.error);