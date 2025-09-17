#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Analyze unique IP usage across all profile creations
 */
async function analyzeUniqueIPs() {
    console.log('🔍 Analyzing unique IP usage across all profile creations...\n');

    // Step 1: Load proxy configurations to map proxy labels to IPs
    const proxyToIPMap = await loadProxyToIPMap();
    console.log(`📋 Loaded ${Object.keys(proxyToIPMap).length} proxy configurations\n`);

    // Step 2: Process all batch log files
    const automationResultsDir = path.join(__dirname, 'automation-results');
    const logFiles = await fs.readdir(automationResultsDir);
    const batchLogFiles = logFiles.filter(file => file.startsWith('batch-') && file.endsWith('.jsonl'));

    console.log(`📁 Found ${batchLogFiles.length} batch log files to analyze\n`);

    const ipUsageMap = new Map(); // IP -> { count, profiles[], proxyLabels[] }
    const profileToIPMap = new Map(); // profileName -> IP
    const unknownProxyLabels = new Set();
    let totalProfiles = 0;
    let profilesWithKnownIPs = 0;

    for (const logFile of batchLogFiles) {
        try {
            const logPath = path.join(automationResultsDir, logFile);
            const logContent = await fs.readFile(logPath, 'utf-8');
            const logLines = logContent.trim().split('\n').filter(line => line.trim());

            for (const line of logLines) {
                try {
                    const entry = JSON.parse(line);
                    if (!entry.proxy || !entry.profileName) continue;

                    totalProfiles++;
                    const proxyLabel = entry.proxy.label;
                    const profileName = entry.profileName;

                    // Map proxy label to IP
                    let ip = null;
                    if (proxyToIPMap[proxyLabel]) {
                        ip = proxyToIPMap[proxyLabel];
                        profilesWithKnownIPs++;
                    } else {
                        unknownProxyLabels.add(proxyLabel);
                    }

                    if (ip) {
                        profileToIPMap.set(profileName, ip);

                        if (!ipUsageMap.has(ip)) {
                            ipUsageMap.set(ip, {
                                count: 0,
                                profiles: [],
                                proxyLabels: new Set()
                            });
                        }

                        const ipData = ipUsageMap.get(ip);
                        ipData.count++;
                        ipData.profiles.push(profileName);
                        ipData.proxyLabels.add(proxyLabel);
                    }
                } catch (err) {
                    // Skip malformed JSON lines
                    continue;
                }
            }
        } catch (err) {
            console.error(`❌ Error processing ${logFile}:`, err.message);
        }
    }

    // Step 3: Generate comprehensive report
    console.log('📊 IP Usage Analysis Report');
    console.log('=' .repeat(50));
    console.log(`Total profiles analyzed: ${totalProfiles}`);
    console.log(`Profiles with known IPs: ${profilesWithKnownIPs}`);
    console.log(`Unique IPs used: ${ipUsageMap.size}`);
    console.log(`Coverage: ${((profilesWithKnownIPs / totalProfiles) * 100).toFixed(1)}%\n`);

    if (unknownProxyLabels.size > 0) {
        console.log(`❓ Unknown proxy labels (${unknownProxyLabels.size}):`);
        Array.from(unknownProxyLabels).sort().forEach(label => {
            console.log(`   - ${label}`);
        });
        console.log();
    }

    // Step 4: Detailed IP usage breakdown
    const sortedIPs = Array.from(ipUsageMap.entries()).sort((a, b) => b[1].count - a[1].count);
    
    console.log('🌐 Unique IPs Usage Breakdown:');
    console.log('-'.repeat(80));
    sortedIPs.forEach(([ip, data], index) => {
        const proxyLabelsStr = Array.from(data.proxyLabels).sort().join(', ');
        console.log(`${(index + 1).toString().padStart(2)}.  ${ip.padEnd(15)} | ${data.count.toString().padStart(3)} profiles | Labels: ${proxyLabelsStr}`);
    });

    // Step 5: Statistics summary
    console.log('\n📈 Statistics Summary:');
    console.log('-'.repeat(40));
    const usageCounts = sortedIPs.map(([_, data]) => data.count);
    const avgUsage = usageCounts.reduce((a, b) => a + b, 0) / usageCounts.length;
    const maxUsage = Math.max(...usageCounts);
    const minUsage = Math.min(...usageCounts);

    console.log(`Average profiles per IP: ${avgUsage.toFixed(1)}`);
    console.log(`Maximum profiles per IP: ${maxUsage}`);
    console.log(`Minimum profiles per IP: ${minUsage}`);
    
    // Distribution analysis
    const distributionBuckets = {
        '1 profile': usageCounts.filter(count => count === 1).length,
        '2-5 profiles': usageCounts.filter(count => count >= 2 && count <= 5).length,
        '6-10 profiles': usageCounts.filter(count => count >= 6 && count <= 10).length,
        '11-20 profiles': usageCounts.filter(count => count >= 11 && count <= 20).length,
        '20+ profiles': usageCounts.filter(count => count > 20).length,
    };

    console.log('\n🎯 Usage Distribution:');
    Object.entries(distributionBuckets).forEach(([range, count]) => {
        if (count > 0) {
            console.log(`   ${range}: ${count} IPs`);
        }
    });

    // Step 6: Export detailed data
    const exportData = {
        summary: {
            totalProfiles,
            profilesWithKnownIPs,
            uniqueIPs: ipUsageMap.size,
            coverage: ((profilesWithKnownIPs / totalProfiles) * 100),
            unknownProxyLabels: Array.from(unknownProxyLabels).sort()
        },
        ipUsage: Object.fromEntries(
            sortedIPs.map(([ip, data]) => [
                ip,
                {
                    count: data.count,
                    proxyLabels: Array.from(data.proxyLabels).sort(),
                    profilesSample: data.profiles.slice(0, 5) // First 5 profiles as sample
                }
            ])
        ),
        statistics: {
            avgUsage,
            maxUsage,
            minUsage,
            distribution: distributionBuckets
        }
    };

    const exportPath = path.join(__dirname, 'unique-ip-analysis.json');
    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
    console.log(`\n💾 Detailed analysis exported to: ${exportPath}`);

    return {
        uniqueIPs: ipUsageMap.size,
        totalProfiles,
        profilesWithKnownIPs,
        coverage: ((profilesWithKnownIPs / totalProfiles) * 100),
        topIPs: sortedIPs.slice(0, 10).map(([ip, data]) => ({
            ip,
            count: data.count,
            labels: Array.from(data.proxyLabels)
        }))
    };
}

/**
 * Load proxy configurations and create label -> IP mapping
 */
async function loadProxyToIPMap() {
    const proxyToIPMap = {};
    const proxiesDir = path.join(__dirname, 'proxies');

    try {
        // Try v2 format first (preferred)
        const v2Path = path.join(proxiesDir, 'http.proxies.v2.json');
        try {
            const v2Content = await fs.readFile(v2Path, 'utf-8');
            const v2Proxies = JSON.parse(v2Content);
            
            for (const proxy of v2Proxies) {
                if (proxy.customName && proxy.host) {
                    proxyToIPMap[proxy.customName] = proxy.host;
                }
            }
            console.log(`📋 Loaded ${Object.keys(proxyToIPMap).length} v2 HTTP proxies`);
        } catch (err) {
            console.log('⚠️  v2 HTTP proxy file not found, trying v1 format...');
        }

        // Try v1 format if v2 not available or incomplete
        if (Object.keys(proxyToIPMap).length === 0) {
            const v1Path = path.join(proxiesDir, 'http.proxies.json');
            try {
                const v1Content = await fs.readFile(v1Path, 'utf-8');
                const v1Proxies = JSON.parse(v1Content);
                
                for (const proxy of v1Proxies) {
                    if (proxy.label && proxy.host) {
                        proxyToIPMap[proxy.label] = proxy.host;
                    }
                }
                console.log(`📋 Loaded ${Object.keys(proxyToIPMap).length} v1 HTTP proxies`);
            } catch (err) {
                console.log('⚠️  v1 HTTP proxy file not found');
            }
        }

        // Load SOCKS5 proxies as well
        const socks5Path = path.join(proxiesDir, 'socks5.proxies.json');
        try {
            const socks5Content = await fs.readFile(socks5Path, 'utf-8');
            const socks5Proxies = JSON.parse(socks5Content);
            
            let socks5Count = 0;
            for (const proxy of socks5Proxies) {
                if (proxy.label && proxy.host) {
                    proxyToIPMap[proxy.label] = proxy.host;
                    socks5Count++;
                }
            }
            console.log(`📋 Loaded ${socks5Count} SOCKS5 proxies`);
        } catch (err) {
            console.log('⚠️  SOCKS5 proxy file not found');
        }

    } catch (err) {
        console.error('❌ Error loading proxy configurations:', err.message);
    }

    return proxyToIPMap;
}

// Run the analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    analyzeUniqueIPs()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Analysis failed:', err);
            process.exit(1);
        });
}

export { analyzeUniqueIPs };