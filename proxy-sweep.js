#!/usr/bin/env node

import { ProxyManager } from './src/ProxyManager.js';
import fs from 'fs-extra';

/**
 * Comprehensive proxy validation sweep with parallel processing and jitter
 */
async function sweepProxyValidation(options = {}) {
    const { 
        timeout = 8000, 
        maxConcurrent = 50, 
        jitterMs = 100,
        saveResults = true,
        onlyTestWorking = false 
    } = options;
    
    console.log('🔍 Starting comprehensive proxy validation sweep...');
    
    // Load proxy configurations
    const proxies = JSON.parse(await fs.readFile('./proxies/http.proxies.v2.json', 'utf8'));
    const allProxies = onlyTestWorking ? proxies.filter(p => p.status === true) : proxies;
    
    console.log(`📊 Testing ${allProxies.length} proxies (${onlyTestWorking ? 'working only' : 'all'}) with ${maxConcurrent} concurrent, ${jitterMs}ms jitter`);
    console.log('━'.repeat(80));
    
    const results = [];
    const startTime = Date.now();
    
    // Create test function for each proxy
    async function testSingleProxy(proxy, index) {
        // Add jitter to prevent overwhelming the proxy service
        const jitter = Math.random() * jitterMs;
        await new Promise(resolve => setTimeout(resolve, jitter));
        
        const testStart = Date.now();
        
        try {
            console.log(`📡 [${index + 1}/${allProxies.length}] Testing ${proxy.customName} (${proxy.country}) - ${proxy.host}:${proxy.port}`);
            
            const result = await testProxyConnectivity(proxy, timeout);
            
            const testDuration = Date.now() - testStart;
            
            const status = {
                index: index + 1,
                customName: proxy.customName,
                country: proxy.country,
                host: proxy.host,
                port: proxy.port,
                username: proxy.username,
                connectionType: proxy.connectionType,
                success: result.success,
                ip: result.ip,
                service: result.service,
                latency: result.latency,
                error: result.error,
                statusCode: result.statusCode,
                isPaymentRequired: result.isPaymentRequired || false,
                isAuthRequired: result.isAuthRequired || false,
                testDuration: testDuration,
                timestamp: new Date().toISOString(),
                originalStatus: proxy.status
            };
            
            if (result.success) {
                console.log(`✅ [${index + 1}] ${proxy.customName}: ${result.ip} (${result.latency}ms via ${result.service})`);
            } else {
                const errorType = result.isPaymentRequired ? '💳' : result.isAuthRequired ? '🔐' : '❌';
                console.log(`${errorType} [${index + 1}] ${proxy.customName}: ${result.error}`);
            }
            
            return status;
            
        } catch (error) {
            const testDuration = Date.now() - testStart;
            
            const status = {
                index: index + 1,
                customName: proxy.customName,
                country: proxy.country,
                host: proxy.host,
                port: proxy.port,
                username: proxy.username,
                connectionType: proxy.connectionType,
                success: false,
                error: error.message,
                isPaymentRequired: false,
                isAuthRequired: false,
                testDuration: testDuration,
                timestamp: new Date().toISOString(),
                originalStatus: proxy.status
            };
            
            console.log(`💥 [${index + 1}] ${proxy.customName}: ${error.message}`);
            return status;
        }
    }
    
    // Process proxies in batches with concurrency control
    const batches = [];
    for (let i = 0; i < allProxies.length; i += maxConcurrent) {
        const batch = allProxies.slice(i, i + maxConcurrent);
        batches.push(batch);
    }
    
    console.log(`🔄 Processing ${allProxies.length} proxies in ${batches.length} batches of up to ${maxConcurrent}`);
    
    let processedCount = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`\n📦 Batch ${batchIndex + 1}/${batches.length}: Testing ${batch.length} proxies...`);
        
        const batchPromises = batch.map((proxy, batchItemIndex) => {
            const globalIndex = batchIndex * maxConcurrent + batchItemIndex;
            return testSingleProxy(proxy, globalIndex);
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, batchItemIndex) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                const globalIndex = batchIndex * maxConcurrent + batchItemIndex;
                const proxy = batch[batchItemIndex];
                console.log(`💥 [${globalIndex + 1}] ${proxy.customName}: Promise rejected - ${result.reason?.message || 'Unknown error'}`);
                results.push({
                    index: globalIndex + 1,
                    customName: proxy.customName,
                    success: false,
                    error: `Promise rejected: ${result.reason?.message || 'Unknown error'}`,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        processedCount += batch.length;
        console.log(`📊 Batch ${batchIndex + 1} complete. Progress: ${processedCount}/${allProxies.length}`);
        
        // Small delay between batches to be respectful
        if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    const totalDuration = Date.now() - startTime;
    
    // Generate comprehensive summary
    console.log('\n' + '━'.repeat(80));
    console.log('📊 Proxy Validation Sweep Results');
    console.log('━'.repeat(80));\n    \n    const summary = generateSummary(results, totalDuration);\n    displaySummary(summary);\n    \n    // Save detailed results\n    if (saveResults) {\n        await saveResults(results, summary, {\n            timeout,\n            maxConcurrent,\n            jitterMs,\n            onlyTestWorking\n        });\n    }\n    \n    return { results, summary };\n}\n\n/**\n * Test individual proxy connectivity\n */\nasync function testProxyConnectivity(proxy, timeout) {\n    const testServices = [\n        'http://icanhazip.com',\n        'http://ipv4.icanhazip.com',\n        'http://checkip.amazonaws.com'\n    ];\n    \n    for (const service of testServices) {\n        try {\n            const result = await makeProxyRequest(service, proxy, timeout);\n            \n            if (result.isProxyError) {\n                const isPaymentRequired = result.statusCode === 401 || result.statusCode === 402 ||\n                                        result.error.toLowerCase().includes('payment') ||\n                                        result.error.toLowerCase().includes('subscription');\n                                        \n                const isAuthRequired = result.statusCode === 407 ||\n                                     result.error.toLowerCase().includes('authentication');\n                \n                return {\n                    success: false,\n                    error: result.error,\n                    statusCode: result.statusCode,\n                    isPaymentRequired,\n                    isAuthRequired,\n                    service\n                };\n            }\n            \n            return {\n                success: true,\n                ip: result.ip,\n                service,\n                latency: result.latency\n            };\n            \n        } catch (error) {\n            // Try next service\n            continue;\n        }\n    }\n    \n    return {\n        success: false,\n        error: 'All test services failed',\n        isPaymentRequired: false,\n        isAuthRequired: false\n    };\n}\n\n/**\n * Make HTTP request through proxy\n */\nasync function makeProxyRequest(url, proxy, timeout) {\n    const http = await import('http');\n    \n    return new Promise((resolve, reject) => {\n        const startTime = Date.now();\n        \n        const options = {\n            hostname: proxy.host,\n            port: proxy.port,\n            path: url,\n            method: 'GET',\n            headers: {\n                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',\n                'Accept': '*/*',\n                'Connection': 'close'\n            },\n            timeout\n        };\n        \n        // Add proxy authentication\n        if (proxy.username && proxy.password) {\n            const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');\n            options.headers['Proxy-Authorization'] = `Basic ${auth}`;\n        }\n        \n        const req = http.default.request(options, (res) => {\n            let data = '';\n            res.setEncoding('utf8');\n            \n            res.on('data', (chunk) => { data += chunk; });\n            \n            res.on('end', () => {\n                const latency = Date.now() - startTime;\n                \n                // Check for proxy errors\n                if (res.statusCode === 407) {\n                    return resolve({\n                        isProxyError: true,\n                        error: 'Proxy authentication required (407)',\n                        statusCode: res.statusCode\n                    });\n                }\n                \n                if (res.statusCode === 401 || res.statusCode === 402) {\n                    return resolve({\n                        isProxyError: true,\n                        error: `Proxy requires payment/auth (${res.statusCode})`,\n                        statusCode: res.statusCode\n                    });\n                }\n                \n                if (res.statusCode >= 400) {\n                    return resolve({\n                        isProxyError: true,\n                        error: `HTTP ${res.statusCode}: ${data.slice(0, 100)}`,\n                        statusCode: res.statusCode\n                    });\n                }\n                \n                // Extract IP from response\n                const ip = data.trim().split('\\n')[0];\n                \n                if (ip && /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(ip)) {\n                    resolve({ ip, latency, isProxyError: false });\n                } else {\n                    reject(new Error(`Invalid IP response: ${data.slice(0, 100)}`));\n                }\n            });\n        });\n        \n        req.on('timeout', () => {\n            req.destroy();\n            reject(new Error('Request timeout'));\n        });\n        \n        req.on('error', (error) => {\n            reject(error);\n        });\n        \n        req.setTimeout(timeout);\n        req.end();\n    });\n}\n\n/**\n * Generate comprehensive summary statistics\n */\nfunction generateSummary(results, totalDuration) {\n    const successful = results.filter(r => r.success);\n    const failed = results.filter(r => !r.success);\n    const paymentRequired = results.filter(r => r.isPaymentRequired);\n    const authRequired = results.filter(r => r.isAuthRequired);\n    \n    // Group by country\n    const byCountry = results.reduce((acc, result) => {\n        const country = result.country || 'Unknown';\n        if (!acc[country]) {\n            acc[country] = { total: 0, working: 0, failed: 0 };\n        }\n        acc[country].total++;\n        if (result.success) {\n            acc[country].working++;\n        } else {\n            acc[country].failed++;\n        }\n        return acc;\n    }, {});\n    \n    // Group by connection type\n    const byConnectionType = results.reduce((acc, result) => {\n        const type = result.connectionType || 'Unknown';\n        if (!acc[type]) {\n            acc[type] = { total: 0, working: 0, failed: 0 };\n        }\n        acc[type].total++;\n        if (result.success) {\n            acc[type].working++;\n        } else {\n            acc[type].failed++;\n        }\n        return acc;\n    }, {});\n    \n    return {\n        total: results.length,\n        successful: successful.length,\n        failed: failed.length,\n        paymentRequired: paymentRequired.length,\n        authRequired: authRequired.length,\n        successRate: (successful.length / results.length * 100),\n        byCountry,\n        byConnectionType,\n        avgLatency: successful.length > 0 ? successful.reduce((sum, r) => sum + (r.latency || 0), 0) / successful.length : 0,\n        totalDuration,\n        timestamp: new Date().toISOString()\n    };\n}\n\n/**\n * Display summary to console\n */\nfunction displaySummary(summary) {\n    console.log(`\\n✅ Working: ${summary.successful}/${summary.total} (${summary.successRate.toFixed(1)}%)`);\n    console.log(`❌ Failed: ${summary.failed}/${summary.total}`);\n    console.log(`💳 Payment Required: ${summary.paymentRequired}/${summary.total}`);\n    console.log(`🔐 Auth Required: ${summary.authRequired}/${summary.total}`);\n    \n    if (summary.successful > 0) {\n        console.log(`⚡ Average Latency: ${summary.avgLatency.toFixed(0)}ms`);\n    }\n    \n    console.log(`⏱️  Total Duration: ${(summary.totalDuration / 1000).toFixed(1)}s`);\n    \n    // Country breakdown\n    console.log('\\n🌍 By Country:');\n    Object.entries(summary.byCountry)\n        .sort(([,a], [,b]) => b.working - a.working)\n        .slice(0, 10)\n        .forEach(([country, stats]) => {\n            const rate = (stats.working / stats.total * 100).toFixed(1);\n            console.log(`   ${country}: ${stats.working}/${stats.total} (${rate}%)`);\n        });\n    \n    // Connection type breakdown\n    console.log('\\n🔗 By Connection Type:');\n    Object.entries(summary.byConnectionType).forEach(([type, stats]) => {\n        const rate = (stats.working / stats.total * 100).toFixed(1);\n        console.log(`   ${type}: ${stats.working}/${stats.total} (${rate}%)`);\n    });\n}\n\n/**\n * Save results to files\n */\nasync function saveResults(results, summary, config) {\n    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');\n    const outputDir = './output';\n    \n    await fs.ensureDir(outputDir);\n    \n    // Save detailed results\n    const detailedFile = `${outputDir}/proxy-sweep-${timestamp}.json`;\n    await fs.writeJson(detailedFile, {\n        summary,\n        results,\n        config\n    }, { spaces: 2 });\n    \n    // Save working proxies list\n    const workingProxies = results.filter(r => r.success);\n    const workingFile = `${outputDir}/working-proxies-${timestamp}.json`;\n    await fs.writeJson(workingFile, workingProxies, { spaces: 2 });\n    \n    // Save CSV for analysis\n    const csvFile = `${outputDir}/proxy-sweep-${timestamp}.csv`;\n    const csvHeader = 'customName,country,host,port,connectionType,success,ip,latency,error,isPaymentRequired,isAuthRequired\\n';\n    const csvRows = results.map(r => [\n        r.customName,\n        r.country,\n        r.host,\n        r.port,\n        r.connectionType,\n        r.success,\n        r.ip || '',\n        r.latency || '',\n        (r.error || '').replace(/,/g, ';'),\n        r.isPaymentRequired,\n        r.isAuthRequired\n    ].join(','));\n    \n    await fs.writeFile(csvFile, csvHeader + csvRows.join('\\n'));\n    \n    console.log(`\\n💾 Results saved:`);\n    console.log(`   Detailed: ${detailedFile}`);\n    console.log(`   Working: ${workingFile}`);\n    console.log(`   CSV: ${csvFile}`);\n}\n\n// CLI usage\nif (import.meta.url === `file://${process.argv[1]}`) {\n    const args = process.argv.slice(2);\n    const options = {\n        timeout: 8000,\n        maxConcurrent: 50,\n        jitterMs: 100,\n        saveResults: true,\n        onlyTestWorking: false\n    };\n    \n    // Parse command line arguments\n    for (let i = 0; i < args.length; i++) {\n        switch (args[i]) {\n            case '--timeout':\n                options.timeout = parseInt(args[++i]) || 8000;\n                break;\n            case '--concurrent':\n                options.maxConcurrent = parseInt(args[++i]) || 50;\n                break;\n            case '--jitter':\n                options.jitterMs = parseInt(args[++i]) || 100;\n                break;\n            case '--working-only':\n                options.onlyTestWorking = true;\n                break;\n            case '--all':\n                options.onlyTestWorking = false;\n                break;\n            case '--no-save':\n                options.saveResults = false;\n                break;\n            case '--help':\n                console.log(`\nUsage: node proxy-sweep.js [options]\n\nOptions:\n  --timeout <ms>       Request timeout in milliseconds (default: 8000)\n  --concurrent <n>     Max concurrent tests (default: 50)\n  --jitter <ms>        Random delay between requests (default: 100)\n  --working-only       Only test proxies marked as working\n  --all               Test all proxies (default)\n  --no-save           Don't save results to files\n  --help              Show this help\n\nExamples:\n  node proxy-sweep.js\n  node proxy-sweep.js --concurrent 30 --timeout 10000\n  node proxy-sweep.js --working-only --jitter 200\n`);\n                process.exit(0);\n                break;\n        }\n    }\n    \n    sweepProxyValidation(options)\n        .then(({ summary }) => {\n            const successRate = summary.successRate.toFixed(1);\n            console.log(`\\n🎉 Proxy validation sweep complete!`);\n            console.log(`✅ ${summary.successful}/${summary.total} proxies working (${successRate}%)`);\n            \n            if (summary.failed > 0) {\n                console.log(`⚠️  ${summary.failed} proxies failed (${summary.paymentRequired} payment required, ${summary.authRequired} auth required)`);\n            }\n            \n            process.exit(summary.successful > 0 ? 0 : 1);\n        })\n        .catch(error => {\n            console.error('💥 Error during proxy sweep:', error.message);\n            process.exit(1);\n        });\n}\n\nexport { sweepProxyValidation };