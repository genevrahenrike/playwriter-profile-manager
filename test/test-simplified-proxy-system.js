#!/usr/bin/env node

/**
 * Test the simplified proxy system with both TXT and JSON formats
 */

import { ProxyManager } from '../src/ProxyManager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testTxtProxyFormat() {
    console.log('\n🧪 Testing TXT Proxy Format (colon-delimited)...');
    
    const txtProxyFile = path.join(__dirname, '../proxies/decode-proxies-global-5k.txt');
    const proxyManager = new ProxyManager({ proxyFile: txtProxyFile });
    
    try {
        await proxyManager.loadProxies();
        const stats = proxyManager.getAllProxies();
        console.log(`✅ TXT format: Loaded ${stats.total} proxies`);
        
        if (stats.total > 0) {
            // Test getting a random proxy
            const randomProxy = proxyManager.getRandomProxy();
            console.log(`   Example proxy: ${randomProxy.label} - ${randomProxy.host}:${randomProxy.port}`);
            
            // Test proxy config generation
            const proxyConfig = proxyManager.toPlaywrightProxy(randomProxy);
            console.log(`   Playwright config: ${proxyConfig.server}`);
        }
        
        return true;
    } catch (error) {
        console.error(`❌ TXT format test failed: ${error.message}`);
        return false;
    }
}

async function testJsonProxyFormat() {
    console.log('\n🧪 Testing JSON Proxy Format (v2)...');
    
    const jsonProxyFile = path.join(__dirname, '../proxies/http.proxies.v2.json');
    const proxyManager = new ProxyManager({ proxyFile: jsonProxyFile });
    
    try {
        await proxyManager.loadProxies();
        const stats = proxyManager.getAllProxies();
        console.log(`✅ JSON format: Loaded ${stats.total} working proxies (pre-filtered)`);
        
        if (stats.total > 0) {
            // Test getting a random proxy
            const randomProxy = proxyManager.getRandomProxy();
            console.log(`   Example proxy: ${randomProxy.label} - ${randomProxy.host}:${randomProxy.port}`);
            console.log(`   Country: ${randomProxy.country}, Type: ${randomProxy.connectionType}`);
            console.log(`   Status: ${randomProxy.status} (should be 'OK')`);
            
            // Verify all loaded proxies have good status
            const allProxies = proxyManager.getAllProxies();
            const badProxies = allProxies.http.filter(p => p.status !== 'OK');
            console.log(`   Quality check: ${badProxies.length} bad proxies found (should be 0)`);
            
            // Test filtering
            const usProxies = proxyManager.getFilteredProxies({ country: 'US' });
            console.log(`   US proxies available: ${usProxies.length}`);
            
            const dcProxies = proxyManager.getFilteredProxies({ connectionType: 'datacenter' });
            console.log(`   Datacenter proxies available: ${dcProxies.length}`);
        }
        
        return true;
    } catch (error) {
        console.error(`❌ JSON format test failed: ${error.message}`);
        return false;
    }
}

async function testNoProxyFile() {
    console.log('\n🧪 Testing No Proxy File...');
    
    const proxyManager = new ProxyManager({ });
    
    try {
        await proxyManager.loadProxies();
        const stats = proxyManager.getAllProxies();
        console.log(`✅ No proxy file: ${stats.total} proxies loaded (expected: 0)`);
        return stats.total === 0;
    } catch (error) {
        console.error(`❌ No proxy file test failed: ${error.message}`);
        return false;
    }
}

async function testInvalidFile() {
    console.log('\n🧪 Testing Invalid File...');
    
    const proxyManager = new ProxyManager({ proxyFile: '/nonexistent/file.txt' });
    
    try {
        await proxyManager.loadProxies();
        console.error(`❌ Should have failed with invalid file`);
        return false;
    } catch (error) {
        console.log(`✅ Invalid file correctly failed: ${error.message}`);
        return true;
    }
}

async function testUnsupportedFormat() {
    console.log('\n🧪 Testing Unsupported Format...');
    
    // Create a temporary file with unsupported extension
    const proxyManager = new ProxyManager({ proxyFile: '/tmp/test.xml' });
    
    try {
        await proxyManager.loadProxies();
        console.error(`❌ Should have failed with unsupported format`);
        return false;
    } catch (error) {
        console.log(`✅ Unsupported format correctly failed: ${error.message}`);
        return true;
    }
}

async function runTests() {
    console.log('🚀 Starting Simplified Proxy System Tests...');
    
    const tests = [
        { name: 'TXT Format', test: testTxtProxyFormat },
        { name: 'JSON Format', test: testJsonProxyFormat },
        { name: 'No Proxy File', test: testNoProxyFile },
        { name: 'Invalid File', test: testInvalidFile },
        { name: 'Unsupported Format', test: testUnsupportedFormat }
    ];
    
    let passed = 0;
    let total = tests.length;
    
    for (const { name, test } of tests) {
        try {
            const result = await test();
            if (result) {
                passed++;
            }
        } catch (error) {
            console.error(`❌ Test "${name}" crashed: ${error.message}`);
        }
    }
    
    console.log('\n📊 Test Results:');
    console.log(`   Passed: ${passed}/${total}`);
    console.log(`   Failed: ${total - passed}/${total}`);
    
    if (passed === total) {
        console.log('🎉 All tests passed! Simplified proxy system is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Review the output above.');
        process.exit(1);
    }
}

// Run the tests
runTests().catch(error => {
    console.error('💥 Test runner crashed:', error);
    process.exit(1);
});