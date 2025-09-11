#!/usr/bin/env node

import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';

const ENDPOINTS = {
    google204: 'http://www.google.com/generate_204',
    ipify: 'https://api.ipify.org?format=json',
    httpbin: 'https://httpbin.org/ip'
};

async function measureLatency(proxyConfig, endpoint, url) {
    try {
        const proxyUrl = `http://${proxyConfig.login}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
        const agent = new HttpsProxyAgent(proxyUrl);
        
        const start = Date.now();
        const response = await axios.get(url, {
            httpsAgent: agent,
            timeout: 15000,
            validateStatus: () => true // Accept all status codes
        });
        const latency = Date.now() - start;
        
        // For generate_204, expect 204 status; for others expect 200
        const expectedStatus = endpoint === 'google204' ? 204 : 200;
        if (response.status !== expectedStatus) {
            throw new Error(`Unexpected status ${response.status}`);
        }
        
        return latency;
    } catch (error) {
        console.error(`  ❌ ${endpoint}: ${error.message}`);
        return null;
    }
}

async function testProxyLatency(proxyConfig) {
    console.log(`\n🔍 Testing ${proxyConfig.label} (${proxyConfig.host})`);
    
    const latencies = {};
    let successCount = 0;
    
    for (const [endpoint, url] of Object.entries(ENDPOINTS)) {
        process.stdout.write(`  📡 ${endpoint}... `);
        const latency = await measureLatency(proxyConfig, endpoint, url);
        
        if (latency !== null) {
            latencies[endpoint] = latency;
            successCount++;
            console.log(`✅ ${latency}ms`);
        } else {
            latencies[endpoint] = 0;
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Calculate average latency from successful tests
    const validLatencies = Object.values(latencies).filter(l => l > 0);
    const avgLatency = validLatencies.length > 0 
        ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
        : 0;
    
    const status = successCount > 0 ? 'OK' : 'FAILED';
    console.log(`  📊 Average: ${avgLatency}ms (${successCount}/${Object.keys(ENDPOINTS).length} endpoints)`);
    
    return {
        status,
        avgLatencyMs: avgLatency,
        latenciesByEndpoint: latencies,
        lastChecked: new Date().toISOString()
    };
}

async function updateProxyData(proxies, results) {
    const updated = proxies.map(proxy => {
        const result = results.find(r => r.label === proxy.label);
        if (result) {
            return {
                ...proxy,
                status: result.status,
                avgLatencyMs: result.avgLatencyMs,
                latenciesByEndpoint: result.latenciesByEndpoint,
                lastChecked: result.lastChecked
            };
        }
        return proxy;
    });
    
    fs.writeFileSync('./proxies/http.proxies.json', JSON.stringify(updated, null, 2));
    console.log('\n💾 Updated proxies/http.proxies.json with latency data');
}

async function main() {
    const allProxies = JSON.parse(fs.readFileSync('./proxies/http.proxies.json', 'utf8'));
    const requestedLabels = process.argv.slice(2).filter(a => !a.startsWith('-'));
    const updateFile = !process.argv.includes('--no-update');
    
    const selected = requestedLabels.length
        ? allProxies.filter(p => requestedLabels.includes(p.label))
        : allProxies;
        
    const missing = requestedLabels.filter(l => !selected.find(p => p.label === l));
    if (missing.length) {
        console.error('❌ Unknown labels:', missing.join(', '));
        process.exit(1);
    }
    
    console.log(`🚀 Testing latency for ${selected.length} prox${selected.length === 1 ? 'y' : 'ies'}${requestedLabels.length ? ' (filtered)' : ''}...`);
    console.log(`📡 Endpoints: ${Object.keys(ENDPOINTS).join(', ')}`);
    
    const results = [];
    for (const proxy of selected) {
        const result = await testProxyLatency(proxy);
        results.push({ label: proxy.label, ...result });
    }
    
    // Summary
    console.log('\n📋 Summary:');
    console.log('Label'.padEnd(12), 'Status'.padEnd(8), 'Avg Latency', 'Google 204');
    console.log('─'.repeat(50));
    
    results.forEach(r => {
        const google204 = r.latenciesByEndpoint.google204 > 0 ? `${r.latenciesByEndpoint.google204}ms` : 'FAILED';
        console.log(
            r.label.padEnd(12),
            r.status.padEnd(8),
            `${r.avgLatencyMs}ms`.padEnd(11),
            google204
        );
    });
    
    const working = results.filter(r => r.status === 'OK');
    const failed = results.filter(r => r.status === 'FAILED');
    
    console.log(`\n✅ Working: ${working.length}, ❌ Failed: ${failed.length}`);
    
    if (failed.length > 0) {
        console.log(`Failed proxies: ${failed.map(f => f.label).join(', ')}`);
    }
    
    if (updateFile && results.length > 0) {
        await updateProxyData(allProxies, results);
    } else if (!updateFile) {
        console.log('ℹ️  Use --no-update flag was detected, skipping file update');
    }
}

main().catch(err => {
    console.error('💥 Error:', err.message);
    process.exit(1);
});