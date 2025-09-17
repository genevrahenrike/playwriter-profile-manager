#!/usr/bin/env node

import { ProxyManager } from './src/ProxyManager.js';
import fs from 'fs-extra';

/**
 * Test all proxies and update their status
 */
async function testAllProxies(options = {}) {
    const { timeout = 15000, maxConcurrent = 5, saveResults = true } = options;
    
    const proxyManager = new ProxyManager();
    await proxyManager.loadProxies();
    
    // Get all proxies before filtering
    const allProxies = [
        ...proxyManager.loadedProxies.http.map(p => ({ ...p, type: 'http' })),
        ...proxyManager.loadedProxies.socks5.map(p => ({ ...p, type: 'socks5' }))
    ];
    
    console.log(`🧪 Testing ${allProxies.length} proxies (timeout: ${timeout}ms, concurrent: ${maxConcurrent})`);
    console.log('━'.repeat(80));
    
    const results = [];
    const queue = [...allProxies];
    const running = [];
    
    async function testProxy(proxy) {
        try {
            console.log(`📡 Testing ${proxy.label} (${proxy.type}) - ${proxy.host}:${proxy.port}`);
            const result = await proxyManager.testProxy(proxy, timeout);
            
            const status = {
                label: proxy.label,
                type: proxy.type,
                host: proxy.host,
                port: proxy.port,
                success: result.success,
                error: result.error,
                ip: result.ip,
                service: result.service,
                latency: result.latency,
                statusCode: result.statusCode,
                isPaymentRequired: result.isPaymentRequired || false,
                timestamp: new Date().toISOString()
            };
            
            if (result.success) {
                console.log(`✅ ${proxy.label}: ${result.ip} (${result.latency}ms via ${result.service})`);
            } else {
                const paymentFlag = result.isPaymentRequired ? ' 💳' : '';
                console.log(`❌ ${proxy.label}: ${result.error}${paymentFlag}`);
                
                // Mark proxy as bad in the manager
                proxyManager.markProxyAsBad(proxy.label, result.error, result.isPaymentRequired);
            }
            
            results.push(status);
            return status;
            
        } catch (error) {
            const status = {
                label: proxy.label,
                type: proxy.type,
                host: proxy.host,
                port: proxy.port,
                success: false,
                error: error.message,
                isPaymentRequired: false,
                timestamp: new Date().toISOString()
            };
            
            console.log(`💥 ${proxy.label}: ${error.message}`);
            proxyManager.markProxyAsBad(proxy.label, error.message, false);
            results.push(status);
            return status;
        }
    }
    
    // Process queue with concurrency control
    while (queue.length > 0 || running.length > 0) {
        // Start new tasks up to the concurrency limit
        while (running.length < maxConcurrent && queue.length > 0) {
            const proxy = queue.shift();
            const task = testProxy(proxy);
            running.push(task);
        }
        
        // Wait for at least one task to complete
        if (running.length > 0) {
            await Promise.race(running);
            // Remove completed tasks
            for (let i = running.length - 1; i >= 0; i--) {
                if (running[i].isFulfilled !== undefined || running[i].isRejected !== undefined) {
                    running.splice(i, 1);
                }
            }
        }
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Wait for all remaining tasks
    if (running.length > 0) {
        await Promise.allSettled(running);
    }
    
    console.log('\n' + '━'.repeat(80));
    console.log('📊 Test Results Summary:');
    
    const summary = {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        paymentRequired: results.filter(r => r.isPaymentRequired).length,
        byType: {
            http: {
                total: results.filter(r => r.type === 'http').length,
                successful: results.filter(r => r.type === 'http' && r.success).length,
                failed: results.filter(r => r.type === 'http' && !r.success).length,
                paymentRequired: results.filter(r => r.type === 'http' && r.isPaymentRequired).length
            },
            socks5: {
                total: results.filter(r => r.type === 'socks5').length,
                successful: results.filter(r => r.type === 'socks5' && r.success).length,
                failed: results.filter(r => r.type === 'socks5' && !r.success).length,
                paymentRequired: results.filter(r => r.type === 'socks5' && r.isPaymentRequired).length
            }
        },
        timestamp: new Date().toISOString()
    };
    
    console.log(`\n✅ Working: ${summary.successful}/${summary.total} (${(summary.successful/summary.total*100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${summary.failed}/${summary.total}`);
    console.log(`💳 Payment Required: ${summary.paymentRequired}/${summary.total}`);
    
    console.log(`\nHTTP Proxies: ${summary.byType.http.successful}/${summary.byType.http.total} working`);
    console.log(`SOCKS5 Proxies: ${summary.byType.socks5.successful}/${summary.byType.socks5.total} working`);
    
    // List payment-required proxies
    const paymentProxies = results.filter(r => r.isPaymentRequired);
    if (paymentProxies.length > 0) {
        console.log('\n💳 Proxies requiring payment:');
        paymentProxies.forEach(p => {
            console.log(`   ${p.label} (${p.type}): ${p.error}`);
        });
    }
    
    // List other failed proxies
    const otherFailed = results.filter(r => !r.success && !r.isPaymentRequired);
    if (otherFailed.length > 0) {
        console.log('\n❌ Other failed proxies:');
        otherFailed.forEach(p => {
            console.log(`   ${p.label} (${p.type}): ${p.error}`);
        });
    }
    
    // Save results if requested
    if (saveResults) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `proxy-test-results-${timestamp}.json`;
        const outputPath = `./output/${filename}`;
        
        await fs.ensureDir('./output');
        await fs.writeJson(outputPath, {
            summary,
            results,
            testConfig: { timeout, maxConcurrent }
        }, { spaces: 2 });
        
        console.log(`\n💾 Results saved to: ${outputPath}`);
    }
    
    return { summary, results };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {
        timeout: 15000,
        maxConcurrent: 5,
        saveResults: true
    };
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--timeout':
                options.timeout = parseInt(args[++i]) || 15000;
                break;
            case '--concurrent':
                options.maxConcurrent = parseInt(args[++i]) || 5;
                break;
            case '--no-save':
                options.saveResults = false;
                break;
            case '--help':
                console.log(`
Usage: node validate-proxies.js [options]

Options:
  --timeout <ms>       Request timeout in milliseconds (default: 15000)
  --concurrent <n>     Max concurrent tests (default: 5)
  --no-save           Don't save results to file
  --help              Show this help

Examples:
  node validate-proxies.js
  node validate-proxies.js --timeout 10000 --concurrent 3
  node validate-proxies.js --no-save
`);
                process.exit(0);
                break;
        }
    }
    
    testAllProxies(options)
        .then(({ summary }) => {
            const successRate = (summary.successful / summary.total * 100).toFixed(1);
            console.log(`\n🎉 Proxy testing complete! ${summary.successful}/${summary.total} proxies working (${successRate}%)`);
            
            if (summary.failed > 0) {
                console.log(`⚠️  ${summary.failed} proxies failed (${summary.paymentRequired} require payment)`);
            }
            
            process.exit(summary.successful > 0 ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Error testing proxies:', error.message);
            process.exit(1);
        });
}

export { testAllProxies };