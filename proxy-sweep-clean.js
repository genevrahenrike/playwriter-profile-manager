#!/usr/bin/env node

import fs from 'fs-extra';
import http from 'http';

/**
 * Comprehensive proxy validation        console.log(`
📦 Batch ${batchIndex + 1}/${batches.length}: Testing ${batch.length} proxies...`);sweep with parallel processing and jitter
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
        console.log(`\\n📦 Batch ${batchIndex + 1}/${batches.length}: Testing ${batch.length} proxies...`);
        
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
    console.log('\\n' + '━'.repeat(80));
    console.log('📊 Proxy Validation Sweep Results');
    console.log('━'.repeat(80));
    
    const summary = generateSummary(results, totalDuration);
    displaySummary(summary);
    
    // Save detailed results
    if (saveResults) {
        await saveResultsToFiles(results, summary, {
            timeout,
            maxConcurrent,
            jitterMs,
            onlyTestWorking
        });
    }
    
    return { results, summary };
}

/**
 * Test individual proxy connectivity
 */
async function testProxyConnectivity(proxy, timeout) {
    const testServices = [
        'http://icanhazip.com',
        'http://ipv4.icanhazip.com',
        'http://checkip.amazonaws.com'
    ];
    
    for (const service of testServices) {
        try {
            const result = await makeProxyRequest(service, proxy, timeout);
            
            if (result.isProxyError) {
                const isPaymentRequired = result.statusCode === 401 || result.statusCode === 402 ||
                                        result.error.toLowerCase().includes('payment') ||
                                        result.error.toLowerCase().includes('subscription');
                                        
                const isAuthRequired = result.statusCode === 407 ||
                                     result.error.toLowerCase().includes('authentication');
                
                return {
                    success: false,
                    error: result.error,
                    statusCode: result.statusCode,
                    isPaymentRequired,
                    isAuthRequired,
                    service
                };
            }
            
            return {
                success: true,
                ip: result.ip,
                service,
                latency: result.latency
            };
            
        } catch (error) {
            // Try next service
            continue;
        }
    }
    
    return {
        success: false,
        error: 'All test services failed',
        isPaymentRequired: false,
        isAuthRequired: false
    };
}

/**
 * Make HTTP request through proxy
 */
async function makeProxyRequest(url, proxy, timeout) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const options = {
            hostname: proxy.host,
            port: proxy.port,
            path: url,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': '*/*',
                'Connection': 'close'
            },
            timeout
        };
        
        // Add proxy authentication
        if (proxy.username && proxy.password) {
            const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
            options.headers['Proxy-Authorization'] = `Basic ${auth}`;
        }
        
        const req = http.request(options, (res) => {
            let data = '';
            res.setEncoding('utf8');
            
            res.on('data', (chunk) => { data += chunk; });
            
            res.on('end', () => {
                const latency = Date.now() - startTime;
                
                // Check for proxy errors
                if (res.statusCode === 407) {
                    return resolve({
                        isProxyError: true,
                        error: 'Proxy authentication required (407)',
                        statusCode: res.statusCode
                    });
                }
                
                if (res.statusCode === 401 || res.statusCode === 402) {
                    return resolve({
                        isProxyError: true,
                        error: `Proxy requires payment/auth (${res.statusCode})`,
                        statusCode: res.statusCode
                    });
                }
                
                if (res.statusCode >= 400) {
                    return resolve({
                        isProxyError: true,
                        error: `HTTP ${res.statusCode}: ${data.slice(0, 100)}`,
                        statusCode: res.statusCode
                    });
                }
                
                // Extract IP from response
                const ip = data.trim().split('\n')[0];
                
                if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
                    resolve({ ip, latency, isProxyError: false });
                } else {
                    reject(new Error(`Invalid IP response: ${data.slice(0, 100)}`));
                }
            });
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(timeout);
        req.end();
    });
}

/**
 * Generate comprehensive summary statistics
 */
function generateSummary(results, totalDuration) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const paymentRequired = results.filter(r => r.isPaymentRequired);
    const authRequired = results.filter(r => r.isAuthRequired);
    
    // Group by country
    const byCountry = results.reduce((acc, result) => {
        const country = result.country || 'Unknown';
        if (!acc[country]) {
            acc[country] = { total: 0, working: 0, failed: 0 };
        }
        acc[country].total++;
        if (result.success) {
            acc[country].working++;
        } else {
            acc[country].failed++;
        }
        return acc;
    }, {});
    
    // Group by connection type
    const byConnectionType = results.reduce((acc, result) => {
        const type = result.connectionType || 'Unknown';
        if (!acc[type]) {
            acc[type] = { total: 0, working: 0, failed: 0 };
        }
        acc[type].total++;
        if (result.success) {
            acc[type].working++;
        } else {
            acc[type].failed++;
        }
        return acc;
    }, {});
    
    return {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        paymentRequired: paymentRequired.length,
        authRequired: authRequired.length,
        successRate: (successful.length / results.length * 100),
        byCountry,
        byConnectionType,
        avgLatency: successful.length > 0 ? successful.reduce((sum, r) => sum + (r.latency || 0), 0) / successful.length : 0,
        totalDuration,
        timestamp: new Date().toISOString()
    };
}

/**
 * Display summary to console
 */
function displaySummary(summary) {
    console.log(`\n✅ Working: ${summary.successful}/${summary.total} (${summary.successRate.toFixed(1)}%)`);
    console.log(`❌ Failed: ${summary.failed}/${summary.total}`);
    console.log(`💳 Payment Required: ${summary.paymentRequired}/${summary.total}`);
    console.log(`🔐 Auth Required: ${summary.authRequired}/${summary.total}`);
    
    if (summary.successful > 0) {
        console.log(`⚡ Average Latency: ${summary.avgLatency.toFixed(0)}ms`);
    }
    
    console.log(`⏱️  Total Duration: ${(summary.totalDuration / 1000).toFixed(1)}s`);
    
    // Country breakdown
    console.log('\n🌍 By Country:');
    Object.entries(summary.byCountry)
        .sort(([,a], [,b]) => b.working - a.working)
        .slice(0, 10)
        .forEach(([country, stats]) => {
            const rate = (stats.working / stats.total * 100).toFixed(1);
            console.log(`   ${country}: ${stats.working}/${stats.total} (${rate}%)`);
        });
    
    // Connection type breakdown
    console.log('\n🔗 By Connection Type:');
    Object.entries(summary.byConnectionType).forEach(([type, stats]) => {
        const rate = (stats.working / stats.total * 100).toFixed(1);
        console.log(`   ${type}: ${stats.working}/${stats.total} (${rate}%)`);
    });
}

/**
 * Save results to files
 */
async function saveResultsToFiles(results, summary, config) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = './output';
    
    await fs.ensureDir(outputDir);
    
    // Save detailed results
    const detailedFile = `${outputDir}/proxy-sweep-${timestamp}.json`;
    await fs.writeJson(detailedFile, {
        summary,
        results,
        config
    }, { spaces: 2 });
    
    // Save working proxies list
    const workingProxies = results.filter(r => r.success);
    const workingFile = `${outputDir}/working-proxies-${timestamp}.json`;
    await fs.writeJson(workingFile, workingProxies, { spaces: 2 });
    
    console.log(`\n💾 Results saved:`);
    console.log(`   Detailed: ${detailedFile}`);
    console.log(`   Working: ${workingFile}`);
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {
        timeout: 8000,
        maxConcurrent: 50,
        jitterMs: 100,
        saveResults: true,
        onlyTestWorking: false
    };
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--timeout':
                options.timeout = parseInt(args[++i]) || 8000;
                break;
            case '--concurrent':
                options.maxConcurrent = parseInt(args[++i]) || 50;
                break;
            case '--jitter':
                options.jitterMs = parseInt(args[++i]) || 100;
                break;
            case '--working-only':
                options.onlyTestWorking = true;
                break;
            case '--all':
                options.onlyTestWorking = false;
                break;
            case '--no-save':
                options.saveResults = false;
                break;
            case '--help':
                console.log(`
Usage: node proxy-sweep.js [options]

Options:
  --timeout <ms>       Request timeout in milliseconds (default: 8000)
  --concurrent <n>     Max concurrent tests (default: 50)
  --jitter <ms>        Random delay between requests (default: 100)
  --working-only       Only test proxies marked as working
  --all               Test all proxies (default)
  --no-save           Don't save results to files
  --help              Show this help

Examples:
  node proxy-sweep.js
  node proxy-sweep.js --concurrent 30 --timeout 10000
  node proxy-sweep.js --working-only --jitter 200
`);
                process.exit(0);
                break;
        }
    }
    
    sweepProxyValidation(options)
        .then(({ summary }) => {
            const successRate = summary.successRate.toFixed(1);
            console.log(`\n🎉 Proxy validation sweep complete!`);
            console.log(`✅ ${summary.successful}/${summary.total} proxies working (${successRate}%)`);
            
            if (summary.failed > 0) {
                console.log(`⚠️  ${summary.failed} proxies failed (${summary.paymentRequired} payment required, ${summary.authRequired} auth required)`);
            }
            
            process.exit(summary.successful > 0 ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Error during proxy sweep:', error.message);
            process.exit(1);
        });
}

export { sweepProxyValidation };