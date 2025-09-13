import { IPTracker } from './IPTracker.js';

export class ProxyRotator {
    constructor(proxyManager, options = {}) {
        this.proxyManager = proxyManager;
        this.skipIPCheck = !!options.skipIPCheck;
        this.ipCheckTimeoutMs = options.ipCheckTimeoutMs || 10000;
        this.ipCheckMaxAttempts = options.ipCheckMaxAttempts || 3;
        this.ipTracker = new IPTracker({
            skipIPCheck: this.skipIPCheck,
            ipCheckTimeoutMs: this.ipCheckTimeoutMs,
            ipCheckMaxAttempts: this.ipCheckMaxAttempts
        });
        this.maxProfilesPerIP = options.maxProfilesPerIP || 5;
        this.currentProxyIndex = -1;
        this.proxyCycle = 0; // Track how many complete cycles we've done
        this.workingProxies = [];
        this.strategy = options.strategy || 'round-robin'; // Default to round-robin
        this.startProxyLabel = options.startProxyLabel || null; // Specific proxy to start from
        this.proxyType = options.proxyType || null; // Filter by proxy type: 'http', 'socks5', or null for all
        this.connectionType = options.connectionType || null; // Filter by connection type: 'resident', 'datacenter', 'mobile'
        this.country = options.country || null; // Filter by country code or name
    }

    /**
     * Initialize the rotator with working proxies
     */
    async initialize() {
        await this.proxyManager.loadProxies();
        
        // SOCKS5 proxies are not supported due to Playwright/Chromium limitations
        if (this.proxyType === 'socks5') {
            console.log(`❌ SOCKS5 proxies are not supported due to Playwright/Chromium limitations:`);
            console.log(`   • Chromium doesn't support SOCKS5 proxy authentication`);
            console.log(`   • SOCKS5 connections often fail (ERR_SOCKS_CONNECTION_FAILED)`);
            console.log(`   • SOCKS5 proxies have connection limits that conflict with IP checking`);
            console.log(`🔄 Falling back to HTTP proxies for reliable operation`);
            this.proxyType = 'http'; // Fall back to HTTP
        }
        
        // Get filtered proxies based on all criteria
        this.workingProxies = this.proxyManager.getFilteredProxies({
            type: this.proxyType,
            connectionType: this.connectionType,
            country: this.country
        });
        
        // Set starting position if specified
        if (this.startProxyLabel) {
            const startIndex = this.workingProxies.findIndex(p => p.label === this.startProxyLabel);
            if (startIndex !== -1) {
                this.currentProxyIndex = startIndex - 1; // Will be incremented to startIndex on first call
                console.log(`🎯 Starting proxy rotation from: ${this.startProxyLabel} (index ${startIndex})`);
            } else {
                console.warn(`⚠️  Start proxy '${this.startProxyLabel}' not found, starting from beginning`);
            }
        }
        
        const filters = [];
        if (this.proxyType) filters.push(`type: ${this.proxyType}`);
        if (this.connectionType) filters.push(`connectionType: ${this.connectionType}`);
        if (this.country) filters.push(`country: ${this.country}`);
        const filterDesc = filters.length > 0 ? ` (${filters.join(', ')})` : '';
        console.log(`🔄 ProxyRotator initialized with ${this.workingProxies.length} working proxies (strategy: ${this.strategy}${filterDesc})`);
        return this.workingProxies.length > 0;
    }

    /**
     * Get the next available proxy with IP tracking using specified strategy
     */
    async getNextProxy() {
        if (this.workingProxies.length === 0) {
            throw new Error('No working proxies available');
        }

        // Use strategy-specific selection
        switch (this.strategy) {
            case 'round-robin':
                return await this.getNextRoundRobinProxy();
            case 'auto':
            case 'random':
                return await this.getRandomProxy();
            case 'fastest':
                return await this.getFastestProxy();
            default:
                // Treat as specific proxy label
                return await this.getSpecificProxy(this.strategy);
        }
    }

    /**
     * Get next proxy using round-robin strategy
     */
    async getNextRoundRobinProxy() {
        // First, try to find a proxy that hasn't hit the limit (both per-proxy and global IP limits)
        for (let i = 0; i < this.workingProxies.length; i++) {
            this.currentProxyIndex = (this.currentProxyIndex + 1) % this.workingProxies.length;
            const proxy = this.workingProxies[this.currentProxyIndex];
            
            if (this.ipTracker.canUseProxy(proxy.label)) {
                const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
                
                try {
                    // Fast path: skip all IP checking if configured
                    if (this.skipIPCheck) {
                        await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { skipIPCheck: true });
                        return { proxy, proxyConfig };
                    }
    
                    // For SOCKS5 proxies, skip IP duplicate checking to avoid connection exhaustion
                    if (proxy.type === 'socks5') {
                        await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type);
                        return { proxy, proxyConfig };
                    }
                    
                    // For HTTP proxies, check for IP duplicates (REST-based, no page open), with timeouts
                    const testIP = await this.ipTracker.getCurrentIP(proxyConfig, {
                        timeoutMs: this.ipCheckTimeoutMs,
                        maxAttempts: this.ipCheckMaxAttempts
                    });
                    const existingProxies = this.ipTracker.getProxiesUsingIP(testIP);
                    
                    if (existingProxies.length > 0 && !existingProxies.includes(proxy.label)) {
                        console.log(`🔄 Skipping proxy ${proxy.label} - IP ${testIP} already used by: ${existingProxies.join(', ')}`);
                        continue;
                    }
                    
                    // Record usage and reuse the IP we already resolved to avoid a second network call
                    await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { knownIP: testIP });
                    return { proxy, proxyConfig };
                } catch (error) {
                    console.warn(`⚠️  Failed to use proxy ${proxy.label}: ${error.message}`);
                    continue;
                }
            } else {
                const currentIP = this.ipTracker.currentBatchIPs.get(proxy.label);
                const globalUsage = currentIP ? (this.ipTracker.globalIPUsage.get(currentIP) || 0) : 0;
                const proxyUsage = this.ipTracker.proxyUsageCount.get(proxy.label) || 0;
                
                if (currentIP && globalUsage >= this.maxProfilesPerIP) {
                    const proxiesUsingIP = this.ipTracker.getProxiesUsingIP(currentIP);
                    console.log(`🚫 Proxy ${proxy.label} blocked - IP ${currentIP} at global limit (${globalUsage}/${this.maxProfilesPerIP}, used by: ${proxiesUsingIP.join(', ')})`);
                } else if (proxyUsage >= this.maxProfilesPerIP) {
                    console.log(`🚫 Proxy ${proxy.label} blocked - proxy usage limit reached (${proxyUsage}/${this.maxProfilesPerIP})`);
                }
            }
        }
    
        // If we get here, all proxies have hit their limit or would result in duplicate IPs
        console.log('🔄 All proxies have reached their limit or would create duplicate IPs, checking for IP changes...');
        
        // Reset counts and start a new cycle
        this.ipTracker.resetBatchCounts();
        this.proxyCycle++;
        
        console.log(`🔄 Starting proxy cycle ${this.proxyCycle}`);
    
        // Check if any proxies have new IPs
        const hasNewIPs = await this.checkForNewIPs();
        
        if (!hasNewIPs) {
            console.log('🛑 All proxies still have the same IPs, stopping batch');
            return null; // Signal to stop the batch
        }
    
        // Try again with reset counts
        return await this.getNextRoundRobinProxy();
    }

    /**
     * Get random proxy that meets IP uniqueness requirements
     */
    async getRandomProxy() {
        const availableProxies = this.workingProxies.filter(proxy => this.ipTracker.canUseProxy(proxy.label));
        
        if (availableProxies.length === 0) {
            return null;
        }
        
        const shuffled = [...availableProxies].sort(() => Math.random() - 0.5);
        
        for (const proxy of shuffled) {
            const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
            
            try {
                if (this.skipIPCheck) {
                    await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { skipIPCheck: true });
                    return { proxy, proxyConfig };
                }
    
                if (proxy.type === 'socks5') {
                    await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type);
                    return { proxy, proxyConfig };
                }
                
                const testIP = await this.ipTracker.getCurrentIP(proxyConfig, {
                    timeoutMs: this.ipCheckTimeoutMs,
                    maxAttempts: this.ipCheckMaxAttempts
                });
                const existingProxies = this.ipTracker.getProxiesUsingIP(testIP);
                
                if (existingProxies.length > 0 && !existingProxies.includes(proxy.label)) {
                    console.log(`🔄 Skipping random proxy ${proxy.label} - IP ${testIP} already used by: ${existingProxies.join(', ')}`);
                    continue;
                }
                
                await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { knownIP: testIP });
                return { proxy, proxyConfig };
            } catch (error) {
                console.warn(`⚠️  Failed to use random proxy ${proxy.label}: ${error.message}`);
                continue;
            }
        }
        
        return null;
    }

    /**
     * Get fastest proxy that meets IP uniqueness requirements
     */
    async getFastestProxy() {
        const availableProxies = this.workingProxies
            .filter(proxy => this.ipTracker.canUseProxy(proxy.label))
            .filter(proxy => proxy.avgLatencyMs && proxy.avgLatencyMs > 0)
            .sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
        
        if (availableProxies.length === 0) {
            return await this.getRandomProxy();
        }
        
        for (const proxy of availableProxies) {
            const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
            
            try {
                if (this.skipIPCheck) {
                    await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { skipIPCheck: true });
                    return { proxy, proxyConfig };
                }
    
                if (proxy.type === 'socks5') {
                    await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type);
                    return { proxy, proxyConfig };
                }
                
                const testIP = await this.ipTracker.getCurrentIP(proxyConfig, {
                    timeoutMs: this.ipCheckTimeoutMs,
                    maxAttempts: this.ipCheckMaxAttempts
                });
                const existingProxies = this.ipTracker.getProxiesUsingIP(testIP);
                
                if (existingProxies.length > 0 && !existingProxies.includes(proxy.label)) {
                    console.log(`🔄 Skipping fastest proxy ${proxy.label} - IP ${testIP} already used by: ${existingProxies.join(', ')}`);
                    continue;
                }
                
                await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { knownIP: testIP });
                return { proxy, proxyConfig };
            } catch (error) {
                console.warn(`⚠️  Failed to use fastest proxy ${proxy.label}: ${error.message}`);
                continue;
            }
        }
        
        return null;
    }

    /**
     * Get specific proxy by label
     */
    async getSpecificProxy(label) {
        const proxy = this.workingProxies.find(p => p.label === label);
        if (!proxy) {
            throw new Error(`Proxy with label '${label}' not found`);
        }
    
        if (!this.ipTracker.canUseProxy(proxy.label)) {
            const currentIP = this.ipTracker.currentBatchIPs.get(proxy.label);
            const globalUsage = currentIP ? (this.ipTracker.globalIPUsage.get(currentIP) || 0) : 0;
            const proxyUsage = this.ipTracker.proxyUsageCount.get(proxy.label) || 0;
            
            if (currentIP && globalUsage >= this.maxProfilesPerIP) {
                const proxiesUsingIP = this.ipTracker.getProxiesUsingIP(currentIP);
                throw new Error(`Proxy ${label} blocked - IP ${currentIP} at global limit (${globalUsage}/${this.maxProfilesPerIP}, used by: ${proxiesUsingIP.join(', ')})`);
            } else {
                throw new Error(`Proxy ${label} blocked - proxy usage limit reached (${proxyUsage}/${this.maxProfilesPerIP})`);
            }
        }
    
        const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
        
        try {
            if (this.skipIPCheck) {
                await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { skipIPCheck: true });
                return { proxy, proxyConfig };
            }
    
            if (proxy.type === 'socks5') {
                await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type);
                return { proxy, proxyConfig };
            }
            
            const testIP = await this.ipTracker.getCurrentIP(proxyConfig, {
                timeoutMs: this.ipCheckTimeoutMs,
                maxAttempts: this.ipCheckMaxAttempts
            });
            const existingProxies = this.ipTracker.getProxiesUsingIP(testIP);
            
            if (existingProxies.length > 0 && !existingProxies.includes(proxy.label)) {
                throw new Error(`Proxy ${label} would create duplicate IP ${testIP} (already used by: ${existingProxies.join(', ')})`);
            }
            
            await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { knownIP: testIP });
            return { proxy, proxyConfig };
        } catch (error) {
            throw new Error(`Failed to use specific proxy ${label}: ${error.message}`);
        }
    }

    /**
     * Check if any proxies have new IPs since last cycle
     */
    async checkForNewIPs() {
        if (this.skipIPCheck) {
            console.log('🟡 Skipping IP change scan (configured to skip)');
            return true;
        }
    
        let foundNewIP = false;
        
        console.log('🔍 Checking all proxies for IP changes...');
        
        for (const proxy of this.workingProxies) {
            const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
            
            try {
                if (await this.ipTracker.hasNewIP(proxyConfig, proxy.label, proxy.type, {
                    timeoutMs: this.ipCheckTimeoutMs,
                    maxAttempts: this.ipCheckMaxAttempts
                })) {
                    console.log(`✅ Proxy ${proxy.label} has a new IP`);
                    foundNewIP = true;
                } else {
                    console.log(`❌ Proxy ${proxy.label} still has the same IP`);
                }
            } catch (error) {
                console.warn(`⚠️  Could not check IP for ${proxy.label}: ${error.message}`);
            }
        }
    
        return foundNewIP;
    }

    /**
     * Get current rotation statistics with global IP tracking
     */
    getStats() {
        const ipStats = this.ipTracker.getStats();
        
        return {
            ...ipStats,
            proxyCycle: this.proxyCycle,
            totalProxies: this.workingProxies.length,
            currentProxyIndex: this.currentProxyIndex,
            maxProfilesPerIP: this.maxProfilesPerIP,
            globalIPsAtLimit: Object.values(ipStats.globalIPStats || {}).filter(stat => stat.atLimit).length,
            totalGlobalIPs: Object.keys(ipStats.globalIPStats || {}).length
        };
    }

    /**
     * Reset all tracking for a new batch session
     */
    reset() {
        this.currentProxyIndex = -1;
        this.proxyCycle = 0;
        this.ipTracker = new IPTracker();
        console.log('🔄 ProxyRotator reset for new batch session');
    }

    /**
     * Get specific proxy by label (for testing)
     */
    async getProxyByLabel(label) {
        const proxy = this.workingProxies.find(p => p.label === label);
        if (!proxy) {
            throw new Error(`Proxy with label '${label}' not found`);
        }

        const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
        
        // Record usage but don't enforce limits for manual selection
        try {
            await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type);
        } catch (error) {
            console.warn(`⚠️  Could not record usage for ${label}: ${error.message}`);
        }

        return { proxy, proxyConfig };
    }

    /**
     * Check if batch should continue based on proxy availability
     */
    async shouldContinueBatch() {
        if (this.proxyCycle === 0) {
            return true; // First cycle, always continue
        }

        // Check if we have any proxies with new IPs
        return await this.checkForNewIPs();
    }
}