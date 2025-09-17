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
            return status;\n            \n        } catch (error) {\n            const status = {\n                label: proxy.label,\n                type: proxy.type,\n                host: proxy.host,\n                port: proxy.port,\n                success: false,\n                error: error.message,\n                isPaymentRequired: false,\n                timestamp: new Date().toISOString()\n            };\n            \n            console.log(`💥 ${proxy.label}: ${error.message}`);\n            proxyManager.markProxyAsBad(proxy.label, error.message, false);\n            results.push(status);\n            return status;\n        }\n    }\n    \n    // Process queue with concurrency control\n    while (queue.length > 0 || running.length > 0) {\n        // Start new tasks up to the concurrency limit\n        while (running.length < maxConcurrent && queue.length > 0) {\n            const proxy = queue.shift();\n            const task = testProxy(proxy);\n            running.push(task);\n        }\n        \n        // Wait for at least one task to complete\n        if (running.length > 0) {\n            await Promise.race(running);\n            // Remove completed tasks\n            for (let i = running.length - 1; i >= 0; i--) {\n                if (running[i].isFulfilled !== undefined || running[i].isRejected !== undefined) {\n                    running.splice(i, 1);\n                }\n            }\n        }\n        \n        // Small delay to prevent overwhelming\n        await new Promise(resolve => setTimeout(resolve, 100));\n    }\n    \n    // Wait for all remaining tasks\n    if (running.length > 0) {\n        await Promise.allSettled(running);\n    }\n    \n    console.log('\\n' + '━'.repeat(80));\n    console.log('📊 Test Results Summary:');\n    \n    const summary = {\n        total: results.length,\n        successful: results.filter(r => r.success).length,\n        failed: results.filter(r => !r.success).length,\n        paymentRequired: results.filter(r => r.isPaymentRequired).length,\n        byType: {\n            http: {\n                total: results.filter(r => r.type === 'http').length,\n                successful: results.filter(r => r.type === 'http' && r.success).length,\n                failed: results.filter(r => r.type === 'http' && !r.success).length,\n                paymentRequired: results.filter(r => r.type === 'http' && r.isPaymentRequired).length\n            },\n            socks5: {\n                total: results.filter(r => r.type === 'socks5').length,\n                successful: results.filter(r => r.type === 'socks5' && r.success).length,\n                failed: results.filter(r => r.type === 'socks5' && !r.success).length,\n                paymentRequired: results.filter(r => r.type === 'socks5' && r.isPaymentRequired).length\n            }\n        },\n        timestamp: new Date().toISOString()\n    };\n    \n    console.log(`\\n✅ Working: ${summary.successful}/${summary.total} (${(summary.successful/summary.total*100).toFixed(1)}%)`);\n    console.log(`❌ Failed: ${summary.failed}/${summary.total}`);\n    console.log(`💳 Payment Required: ${summary.paymentRequired}/${summary.total}`);\n    \n    console.log(`\\nHTTP Proxies: ${summary.byType.http.successful}/${summary.byType.http.total} working`);\n    console.log(`SOCKS5 Proxies: ${summary.byType.socks5.successful}/${summary.byType.socks5.total} working`);\n    \n    // List payment-required proxies\n    const paymentProxies = results.filter(r => r.isPaymentRequired);\n    if (paymentProxies.length > 0) {\n        console.log('\\n💳 Proxies requiring payment:');\n        paymentProxies.forEach(p => {\n            console.log(`   ${p.label} (${p.type}): ${p.error}`);\n        });\n    }\n    \n    // List other failed proxies\n    const otherFailed = results.filter(r => !r.success && !r.isPaymentRequired);\n    if (otherFailed.length > 0) {\n        console.log('\\n❌ Other failed proxies:');\n        otherFailed.forEach(p => {\n            console.log(`   ${p.label} (${p.type}): ${p.error}`);\n        });\n    }\n    \n    // Save results if requested\n    if (saveResults) {\n        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');\n        const filename = `proxy-test-results-${timestamp}.json`;\n        const outputPath = `./output/${filename}`;\n        \n        await fs.ensureDir('./output');\n        await fs.writeJson(outputPath, {\n            summary,\n            results,\n            testConfig: { timeout, maxConcurrent }\n        }, { spaces: 2 });\n        \n        console.log(`\\n💾 Results saved to: ${outputPath}`);\n    }\n    \n    return { summary, results };\n}\n\n// CLI usage\nif (import.meta.url === `file://${process.argv[1]}`) {\n    const args = process.argv.slice(2);\n    const options = {\n        timeout: 15000,\n        maxConcurrent: 5,\n        saveResults: true\n    };\n    \n    // Parse command line arguments\n    for (let i = 0; i < args.length; i++) {\n        switch (args[i]) {\n            case '--timeout':\n                options.timeout = parseInt(args[++i]) || 15000;\n                break;\n            case '--concurrent':\n                options.maxConcurrent = parseInt(args[++i]) || 5;\n                break;\n            case '--no-save':\n                options.saveResults = false;\n                break;\n            case '--help':\n                console.log(`\nUsage: node test-all-proxies.js [options]\n\nOptions:\n  --timeout <ms>       Request timeout in milliseconds (default: 15000)\n  --concurrent <n>     Max concurrent tests (default: 5)\n  --no-save           Don't save results to file\n  --help              Show this help\n\nExamples:\n  node test-all-proxies.js\n  node test-all-proxies.js --timeout 10000 --concurrent 3\n  node test-all-proxies.js --no-save\n`);\n                process.exit(0);\n                break;\n        }\n    }\n    \n    testAllProxies(options)\n        .then(({ summary }) => {\n            const successRate = (summary.successful / summary.total * 100).toFixed(1);\n            console.log(`\\n🎉 Proxy testing complete! ${summary.successful}/${summary.total} proxies working (${successRate}%)`);\n            \n            if (summary.failed > 0) {\n                console.log(`⚠️  ${summary.failed} proxies failed (${summary.paymentRequired} require payment)`);\n            }\n            \n            process.exit(summary.successful > 0 ? 0 : 1);\n        })\n        .catch(error => {\n            console.error('💥 Error testing proxies:', error.message);\n            process.exit(1);\n        });\n}\n\nexport { testAllProxies };\n