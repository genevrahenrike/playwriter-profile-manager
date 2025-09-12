import { IPTracker } from './IPTracker.js';

export class ProxyRotator {
    constructor(proxyManager, options = {}) {
        this.proxyManager = proxyManager;
        this.ipTracker = new IPTracker();
        this.maxProfilesPerIP = options.maxProfilesPerIP || 5;
        this.currentProxyIndex = -1;
        this.proxyCycle = 0; // Track how many complete cycles we've done
        this.workingProxies = [];
    }

    /**
     * Initialize the rotator with working proxies
     */
    async initialize() {
        await this.proxyManager.loadProxies();
        this.workingProxies = [
            ...this.proxyManager.loadedProxies.http.map(p => ({ ...p, type: 'http' })),
            ...this.proxyManager.loadedProxies.socks5.map(p => ({ ...p, type: 'socks5' }))
        ];
        
        console.log(`🔄 ProxyRotator initialized with ${this.workingProxies.length} working proxies`);
        return this.workingProxies.length > 0;
    }

    /**
     * Get the next available proxy with IP tracking
     */
    async getNextProxy() {
        if (this.workingProxies.length === 0) {
            throw new Error('No working proxies available');
        }

        // Track IPs we've already used in this rotation pass to avoid duplicate IPs (different labels, same exit IP)
        const seenIPsThisPass = new Set();
        let attempts = 0;

        while (attempts < this.workingProxies.length) {
            attempts++;
            this.currentProxyIndex = (this.currentProxyIndex + 1) % this.workingProxies.length;
            const proxy = this.workingProxies[this.currentProxyIndex];

            // Skip if usage cap reached for this proxy
            if (!this.ipTracker.canUseProxy(proxy.label)) {
                continue;
            }

            const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);

            try {
                // Fetch IP first (so we can detect duplicates before counting usage)
                const currentIP = await this.ipTracker.getCurrentIP(proxyConfig, proxy.label);
                console.log(`🔎 Rotation probe: ${proxy.label} (${proxy.type}) -> IP ${currentIP}`);

                if (seenIPsThisPass.has(currentIP)) {
                    console.log(`⏭️  Skipping proxy ${proxy.label} (${proxy.type}) duplicate IP ${currentIP}`);
                    continue; // Don't count usage, skip silently
                }

                // Mark IP as seen and record usage with pre-fetched IP to avoid double lookup
                seenIPsThisPass.add(currentIP);
                await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, currentIP);
                return { proxy, proxyConfig };
            } catch (error) {
                console.warn(`⚠️  Failed to use proxy ${proxy.label}: ${error.message}`);
                continue;
            }
        }

        // If we get here, all proxies have hit their limit
        console.log('🔄 All proxies have reached their limit, checking for IP changes...');
        
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
        return await this.getNextProxy();
    }

    /**
     * Check if any proxies have new IPs since last cycle
     */
    async checkForNewIPs() {
        let foundNewIP = false;
        
        console.log('🔍 Checking all proxies for IP changes...');
        const seenIPs = new Set();
        
        for (const proxy of this.workingProxies) {
            const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
            
            try {
                const currentIP = await this.ipTracker.getCurrentIP(proxyConfig, proxy.label);
                const duplicate = seenIPs.has(currentIP);
                if (!duplicate) {
                    seenIPs.add(currentIP);
                }
                const lastKnownIP = this.ipTracker.currentBatchIPs.get(proxy.label);
                const changed = lastKnownIP && currentIP !== lastKnownIP;
                if (changed && !duplicate) {
                    console.log(`✅ Proxy ${proxy.label} has a new unique IP ${currentIP}`);
                    foundNewIP = true;
                } else if (duplicate) {
                    console.log(`🔁 Proxy ${proxy.label} shares IP ${currentIP} (duplicate)`);
                } else {
                    console.log(`❌ Proxy ${proxy.label} still has the same IP ${currentIP}`);
                }
            } catch (error) {
                console.warn(`⚠️  Could not check IP for ${proxy.label}: ${error.message}`);
            }
        }

        return foundNewIP;
    }

    /**
     * Get current rotation statistics
     */
    getStats() {
        const ipStats = this.ipTracker.getStats();
        
        return {
            ...ipStats,
            proxyCycle: this.proxyCycle,
            totalProxies: this.workingProxies.length,
            currentProxyIndex: this.currentProxyIndex,
            maxProfilesPerIP: this.maxProfilesPerIP
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
            await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label);
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