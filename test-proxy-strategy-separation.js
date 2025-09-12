#!/usr/bin/env node

import { ProxyManager } from './src/ProxyManager.js';
import { ProxyRotator } from './src/ProxyRotator.js';

async function testProxyStrategySeparation() {
    console.log('🧪 Testing Separated Proxy Strategy and Start Position\n');
    
    try {
        const proxyManager = new ProxyManager();
        await proxyManager.loadProxies();
        
        const allProxies = proxyManager.getAllProxies();
        console.log(`📡 Available proxies: ${allProxies.total} total\n`);
        
        // List available proxy labels for reference
        const httpLabels = allProxies.http.map(p => p.label);
        const socks5Labels = allProxies.socks5.map(p => p.label);
        console.log(`HTTP proxy labels: ${httpLabels.join(', ')}`);
        console.log(`SOCKS5 proxy labels: ${socks5Labels.join(', ')}\n`);
        
        // Test 1: Round-robin strategy (default) starting from beginning
        console.log('📋 Test 1: Round-robin strategy (default) from beginning');
        const rotator1 = new ProxyRotator(proxyManager, {
            maxProfilesPerIP: 2,
            strategy: 'round-robin'
        });
        
        await rotator1.initialize();
        
        for (let i = 1; i <= 4; i++) {
            try {
                const result = await rotator1.getNextProxy();
                if (result) {
                    console.log(`   Profile ${i}: ${result.proxy.label} (${result.proxy.type}) -> IP: ${rotator1.ipTracker.currentBatchIPs.get(result.proxy.label)}`);
                } else {
                    console.log(`   Profile ${i}: ❌ No proxy available`);
                    break;
                }
            } catch (error) {
                console.log(`   Profile ${i}: ❌ Error: ${error.message}`);
                break;
            }
        }
        
        // Test 2: Round-robin strategy starting from specific proxy
        console.log('\n📋 Test 2: Round-robin strategy starting from US3');
        const rotator2 = new ProxyRotator(proxyManager, {
            maxProfilesPerIP: 2,
            strategy: 'round-robin',
            startProxyLabel: 'US3'
        });
        
        await rotator2.initialize();
        
        for (let i = 1; i <= 4; i++) {
            try {
                const result = await rotator2.getNextProxy();
                if (result) {
                    console.log(`   Profile ${i}: ${result.proxy.label} (${result.proxy.type}) -> IP: ${rotator2.ipTracker.currentBatchIPs.get(result.proxy.label)}`);
                } else {
                    console.log(`   Profile ${i}: ❌ No proxy available`);
                    break;
                }
            } catch (error) {
                console.log(`   Profile ${i}: ❌ Error: ${error.message}`);
                break;
            }
        }
        
        // Test 3: Random strategy
        console.log('\n📋 Test 3: Random strategy');
        const rotator3 = new ProxyRotator(proxyManager, {
            maxProfilesPerIP: 2,
            strategy: 'random'
        });
        
        await rotator3.initialize();
        
        for (let i = 1; i <= 3; i++) {
            try {
                const result = await rotator3.getNextProxy();
                if (result) {
                    console.log(`   Profile ${i}: ${result.proxy.label} (${result.proxy.type}) -> IP: ${rotator3.ipTracker.currentBatchIPs.get(result.proxy.label)}`);
                } else {
                    console.log(`   Profile ${i}: ❌ No proxy available`);
                    break;
                }
            } catch (error) {
                console.log(`   Profile ${i}: ❌ Error: ${error.message}`);
                break;
            }
        }
        
        // Test 4: Fastest strategy
        console.log('\n📋 Test 4: Fastest strategy');
        const rotator4 = new ProxyRotator(proxyManager, {
            maxProfilesPerIP: 2,
            strategy: 'fastest'
        });
        
        await rotator4.initialize();
        
        for (let i = 1; i <= 3; i++) {
            try {
                const result = await rotator4.getNextProxy();
                if (result) {
                    const latency = result.proxy.avgLatencyMs || 'unknown';
                    console.log(`   Profile ${i}: ${result.proxy.label} (${result.proxy.type}, ${latency}ms) -> IP: ${rotator4.ipTracker.currentBatchIPs.get(result.proxy.label)}`);
                } else {
                    console.log(`   Profile ${i}: ❌ No proxy available`);
                    break;
                }
            } catch (error) {
                console.log(`   Profile ${i}: ❌ Error: ${error.message}`);
                break;
            }
        }
        
        // Test 5: Verify starting position works correctly
        console.log('\n🔍 Test 5: Verify starting position behavior');
        
        // Get the proxy list to show expected order
        const workingProxies = [
            ...proxyManager.loadedProxies.http.map(p => ({ ...p, type: 'http' })),
            ...proxyManager.loadedProxies.socks5.map(p => ({ ...p, type: 'socks5' }))
        ];
        
        console.log('   Available proxy order:');
        workingProxies.forEach((proxy, index) => {
            console.log(`     ${index}: ${proxy.label} (${proxy.type})`);
        });
        
        const startLabel = workingProxies.length > 2 ? workingProxies[2].label : workingProxies[0].label;
        console.log(`\n   Testing start from: ${startLabel}`);
        
        const rotator5 = new ProxyRotator(proxyManager, {
            maxProfilesPerIP: 1,
            strategy: 'round-robin',
            startProxyLabel: startLabel
        });
        
        await rotator5.initialize();
        
        const firstResult = await rotator5.getNextProxy();
        if (firstResult) {
            console.log(`   ✅ First proxy from rotation: ${firstResult.proxy.label} (should be ${startLabel} or next available)`);
        } else {
            console.log(`   ❌ No proxy returned from rotation`);
        }
        
        console.log('\n🎉 Strategy separation testing completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testProxyStrategySeparation().catch(console.error);