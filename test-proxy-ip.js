#!/usr/bin/env node

import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';

async function getIPAddress(proxyConfig) {
    try {
        const proxyUrl = `http://${proxyConfig.login}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
        const agent = new HttpsProxyAgent(proxyUrl);
        
        console.log(`Testing proxy: ${proxyConfig.host}:${proxyConfig.port} (${proxyConfig.label || 'Unknown'})`);
        
        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: agent,
            timeout: 12000
        });
        
        return { ip: response.data.ip, error: null };
    } catch (error) {
        return { ip: null, error: error.response?.status === 407 ? 'AUTH_407' : error.message };
    }
}

async function testProxies(proxies) {
    const results = [];
    for (const proxy of proxies) {
        const { ip, error } = await getIPAddress(proxy);
        results.push({
            label: proxy.label,
            host: proxy.host,
            ip: ip || 'FAILED',
            error
        });
        
        // Small delay to avoid overwhelming the service
        await new Promise(resolve => setTimeout(resolve, 700));
    }
    return results;
}

function printResults(results, heading = 'Results') {
    console.log(`\n=== ${heading} ===`);
    console.log('Label'.padEnd(12), 'Host'.padEnd(10), 'IP / Status');
    console.log('─'.repeat(50));
    
    const ipGroups = {};
    
    results.forEach(r => {
        const hostShort = r.host.includes('geo-dc') ? 'geo-dc' : 'geo';
        const display = r.ip === 'FAILED' ? (r.error === 'AUTH_407' ? 'FAILED (407 auth)' : 'FAILED') : r.ip;
        console.log(r.label.padEnd(12), hostShort.padEnd(10), display);
        
        // Group by IP for analysis
        if (r.ip !== 'FAILED') {
            (ipGroups[r.ip] ||= []).push(r.label);
        }
    });
    
    console.log('\nIP Groups:');
    Object.entries(ipGroups).forEach(([ip, labels]) => {
        console.log(labels.length > 1 ? `🔗 ${ip}: ${labels.join(', ')}` : `🔸 ${ip}: ${labels[0]}`);
    });
    
    const failed = results.filter(r => r.ip === 'FAILED').map(r => r.label);
    if (failed.length) {
        console.log(`\nFailed (${failed.length}): ${failed.join(', ')}`);
        console.log(`Retest only failures: node test-proxy-ip.js ${failed.join(' ')}`);
    }
}

async function main() {
    // Load all proxies from JSON file
    const allProxies = JSON.parse(fs.readFileSync('./proxies/http.proxies.json', 'utf8'));
    
    // Get labels from CLI arguments, filtering out any that start with '-'
    const requestedLabels = process.argv.slice(2).filter(a => !a.startsWith('-'));
    
    // Select proxies that match the requested labels, or all proxies if no labels are given
    const selected = requestedLabels.length
        ? allProxies.filter(p => requestedLabels.includes(p.label))
        : allProxies;
    
    // Check for any unknown labels that were requested
    const missing = requestedLabels.filter(l => !selected.find(p => p.label === l));
    if (missing.length) {
        console.error('Unknown labels:', missing.join(', '));
        process.exit(1);
    }
    
    console.log(`Testing ${selected.length} prox${selected.length === 1 ? 'y' : 'ies'}${requestedLabels.length ? ' (filtered)' : ''}...`);
    
    // Test the selected proxies and print the results
    const results = await testProxies(selected);
    printResults(results, requestedLabels.length ? 'Filtered Proxy Results' : 'All Proxy Results');
}

main().catch(err => { console.error(err); process.exit(1); });