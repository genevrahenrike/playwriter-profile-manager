import { IPTracker } from './IPTracker.js';

/**
 * Geographic Proxy Rotator with weighted distribution and even usage
 * 
 * This rotator allows specifying geographic ratios (e.g., "US:50,Other:50") while
 * ensuring even usage of all proxies within each geographic region using round-robin.
 * 
 * Features:
 * - Weighted geographic distribution (customizable ratios)
 * - Even proxy usage within each region (round-robin per region)
 * - Special handling for US (includes datacenter) vs other countries (resident only)
 * - Australia proxy reduction (50% usage compared to other regions)
 * - IP uniqueness tracking and limits
 * - Compatible with existing IP tracking system
 */
export class GeographicProxyRotator {
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
        
        // Geographic distribution settings
        this.geographicRatio = this.parseGeographicRatio(options.geographicRatio || 'US:45,Other:55');
        this.australiaReductionFactor = options.australiaReductionFactor || 0.5; // Use 50% of Australia proxies
        
        // Region management
        this.regions = new Map(); // region name -> { proxies: [], currentIndex: number, cycleCount: number }
        this.regionWeights = new Map(); // region name -> weight (0-1)
        this.totalAllocations = 0; // Track total profiles allocated so far
        this.regionAllocations = new Map(); // region name -> number of profiles allocated
        
        this.proxyCycle = 0;
        console.log(`🌍 Geographic distribution: ${this.formatGeographicRatio()}`);
    }

    /**
     * Parse geographic ratio string like "US:45,EU:25,Other:30" or "US:50,Other:50"
     */
    parseGeographicRatio(ratioString) {
        const ratios = new Map();
        const parts = ratioString.split(',');
        
        let totalWeight = 0;
        for (const part of parts) {
            const [region, weight] = part.split(':');
            const numWeight = parseFloat(weight);
            ratios.set(region.trim(), numWeight);
            totalWeight += numWeight;
        }
        
        // Normalize to percentages
        if (totalWeight !== 100) {
            console.log(`⚠️  Geographic ratios sum to ${totalWeight}, normalizing to 100%`);
            for (const [region, weight] of ratios) {
                ratios.set(region, (weight / totalWeight) * 100);
            }
        }
        
        return ratios;
    }

    /**
     * Format geographic ratio for display
     */
    formatGeographicRatio() {
        const parts = [];
        for (const [region, weight] of this.geographicRatio) {
            parts.push(`${region}:${weight.toFixed(1)}%`);
        }
        return parts.join(', ');
    }

    /**
     * Categorize proxies into geographic regions
     */
    categorizeProxies(proxies) {
        const regions = {
            US: [],
            EU: [],
            Other: []
        };
        
        for (const proxy of proxies) {
            const country = proxy.customName || proxy.country;
            const connectionType = proxy.connectionType;
            
            if (country === 'United States') {
                // For US: include both resident and datacenter
                regions.US.push(proxy);
            } else if (['United Kingdom', 'Germany', 'France'].includes(country)) {
                // European countries - only resident
                if (connectionType === 'resident') {
                    regions.EU.push(proxy);
                }
            } else if (country === 'Australia') {
                // Australia - only resident, and reduce by factor
                if (connectionType === 'resident') {
                    regions.Other.push(proxy);
                }
            } else {
                // Other countries - only resident
                if (connectionType === 'resident') {
                    regions.Other.push(proxy);
                }
            }
        }
        
        // Apply Australia reduction factor
        const australiaProxies = regions.Other.filter(p => (p.customName || p.country) === 'Australia');
        const nonAustraliaOther = regions.Other.filter(p => (p.customName || p.country) !== 'Australia');
        const reducedAustralia = australiaProxies.slice(0, Math.ceil(australiaProxies.length * this.australiaReductionFactor));
        
        regions.Other = [...nonAustraliaOther, ...reducedAustralia];
        
        return regions;
    }

    /**
     * Initialize the geographic rotator
     */
    async initialize() {
        await this.proxyManager.loadProxies();
        
        // Get all available proxies (no type filtering for geographic distribution)
        const allProxies = this.proxyManager.getFilteredProxies();
        
        // Categorize into regions
        const categorizedProxies = this.categorizeProxies(allProxies);
        
        // Set up regions based on geographic ratio
        for (const [regionKey, weight] of this.geographicRatio) {
            let proxies = [];
            
            if (regionKey === 'US') {
                proxies = categorizedProxies.US;
            } else if (regionKey === 'EU') {
                proxies = categorizedProxies.EU;
            } else if (regionKey === 'Other') {
                proxies = categorizedProxies.Other;
            } else if (regionKey === 'UK') {
                proxies = categorizedProxies.EU.filter(p => (p.customName || p.country) === 'United Kingdom');
            } else if (regionKey === 'DE' || regionKey === 'Germany') {
                proxies = categorizedProxies.EU.filter(p => (p.customName || p.country) === 'Germany');
            } else if (regionKey === 'FR' || regionKey === 'France') {
                proxies = categorizedProxies.EU.filter(p => (p.customName || p.country) === 'France');
            } else if (regionKey === 'AU' || regionKey === 'Australia') {
                proxies = categorizedProxies.Other.filter(p => (p.customName || p.country) === 'Australia');
            }
            
            if (proxies.length > 0) {
                this.regions.set(regionKey, {
                    proxies,
                    currentIndex: -1,
                    cycleCount: 0
                });
                this.regionWeights.set(regionKey, weight / 100);
                this.regionAllocations.set(regionKey, 0);
                
                console.log(`🌍 Region ${regionKey}: ${proxies.length} proxies (${weight.toFixed(1)}% target)`);
            } else {
                console.warn(`⚠️  Region ${regionKey} has no available proxies`);
            }
        }
        
        const totalProxies = Array.from(this.regions.values()).reduce((sum, region) => sum + region.proxies.length, 0);
        console.log(`🔄 GeographicProxyRotator initialized with ${totalProxies} total proxies across ${this.regions.size} regions`);
        
        return totalProxies > 0;
    }

    /**
     * Get the next proxy using geographic distribution and regional round-robin
     */
    async getNextProxy() {
        if (this.regions.size === 0) {
            throw new Error('No geographic regions configured');
        }

        // Determine which region should provide the next proxy based on allocation targets
        const targetRegion = this.selectNextRegion();
        if (!targetRegion) {
            console.log('🛑 All regions have reached their allocation limits or are exhausted');
            return null;
        }

        // Get next proxy from the selected region using round-robin
        const result = await this.getNextProxyFromRegion(targetRegion);
        
        if (result) {
            // Update allocation tracking
            this.totalAllocations++;
            const currentAllocation = this.regionAllocations.get(targetRegion) || 0;
            this.regionAllocations.set(targetRegion, currentAllocation + 1);
            
            console.log(`🌍 Selected proxy from ${targetRegion}: ${result.proxy.label} (Region: ${currentAllocation + 1} allocated)`);
        }

        return result;
    }

    /**
     * Select which region should provide the next proxy based on geographic ratios
     */
    selectNextRegion() {
        let bestRegion = null;
        let biggestDeficit = -1;

        for (const [regionName, weight] of this.regionWeights) {
            const region = this.regions.get(regionName);
            if (!region || region.proxies.length === 0) continue;

            const currentAllocation = this.regionAllocations.get(regionName) || 0;
            const targetAllocation = this.totalAllocations * weight;
            const deficit = targetAllocation - currentAllocation;

            // Also check if region has available proxies
            const hasAvailableProxies = region.proxies.some(proxy => 
                this.ipTracker.canUseProxy(proxy.label)
            );

            if (deficit > biggestDeficit && hasAvailableProxies) {
                biggestDeficit = deficit;
                bestRegion = regionName;
            }
        }

        return bestRegion;
    }

    /**
     * Get the next proxy from a specific region using round-robin
     */
    async getNextProxyFromRegion(regionName) {
        const region = this.regions.get(regionName);
        if (!region) {
            throw new Error(`Region ${regionName} not found`);
        }

        const { proxies } = region;
        if (proxies.length === 0) {
            return null;
        }

        // Try each proxy in the region using round-robin
        for (let i = 0; i < proxies.length; i++) {
            region.currentIndex = (region.currentIndex + 1) % proxies.length;
            const proxy = proxies[region.currentIndex];
            
            if (this.ipTracker.canUseProxy(proxy.label)) {
                const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
                
                try {
                    // Fast path: skip all IP checking if configured
                    if (this.skipIPCheck) {
                        await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { skipIPCheck: true });
                        return { proxy, proxyConfig, region: regionName };
                    }

                    // For SOCKS5 proxies, skip IP duplicate checking
                    if (proxy.type === 'socks5') {
                        await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type);
                        return { proxy, proxyConfig, region: regionName };
                    }
                    
                    // For HTTP proxies, check for IP duplicates
                    const testIP = await this.ipTracker.getCurrentIP(proxyConfig, {
                        timeoutMs: this.ipCheckTimeoutMs,
                        maxAttempts: this.ipCheckMaxAttempts
                    });
                    const existingProxies = this.ipTracker.getProxiesUsingIP(testIP);
                    
                    if (existingProxies.length > 0 && !existingProxies.includes(proxy.label)) {
                        console.log(`🔄 Skipping proxy ${proxy.label} (${regionName}) - IP ${testIP} already used by: ${existingProxies.join(', ')}`);
                        continue;
                    }
                    
                    await this.ipTracker.recordProxyUsage(proxyConfig, proxy.label, proxy.type, { knownIP: testIP });
                    return { proxy, proxyConfig, region: regionName };
                } catch (error) {
                    console.warn(`⚠️  Failed to use proxy ${proxy.label} (${regionName}): ${error.message}`);
                    continue;
                }
            } else {
                const currentIP = this.ipTracker.currentBatchIPs.get(proxy.label);
                const globalUsage = currentIP ? (this.ipTracker.globalIPUsage.get(currentIP) || 0) : 0;
                const proxyUsage = this.ipTracker.proxyUsageCount.get(proxy.label) || 0;
                
                if (currentIP && globalUsage >= this.maxProfilesPerIP) {
                    const proxiesUsingIP = this.ipTracker.getProxiesUsingIP(currentIP);
                    console.log(`🚫 Proxy ${proxy.label} (${regionName}) blocked - IP ${currentIP} at global limit (${globalUsage}/${this.maxProfilesPerIP}, used by: ${proxiesUsingIP.join(', ')})`);
                } else if (proxyUsage >= this.maxProfilesPerIP) {
                    console.log(`🚫 Proxy ${proxy.label} (${regionName}) blocked - proxy usage limit reached (${proxyUsage}/${this.maxProfilesPerIP})`);
                }
            }
        }

        // All proxies in this region are exhausted
        console.log(`🔄 All proxies in region ${regionName} are exhausted, starting new cycle`);
        region.cycleCount++;
        
        // Check if any proxies in this region have new IPs
        const hasNewIPs = await this.checkRegionForNewIPs(regionName);
        if (!hasNewIPs) {
            console.log(`🛑 Region ${regionName} has no new IPs available`);
            return null;
        }

        // Reset counts for this region and try again
        this.ipTracker.resetBatchCounts();
        console.log(`🔄 Starting cycle ${region.cycleCount} for region ${regionName}`);
        
        return await this.getNextProxyFromRegion(regionName);
    }

    /**
     * Check if any proxies in a specific region have new IPs
     */
    async checkRegionForNewIPs(regionName) {
        if (this.skipIPCheck) {
            console.log(`🟡 Skipping IP change scan for region ${regionName} (configured to skip)`);
            return true;
        }

        const region = this.regions.get(regionName);
        if (!region) return false;

        let foundNewIP = false;
        
        console.log(`🔍 Checking region ${regionName} for IP changes...`);
        
        for (const proxy of region.proxies) {
            const proxyConfig = this.proxyManager.toPlaywrightProxy(proxy);
            
            try {
                if (await this.ipTracker.hasNewIP(proxyConfig, proxy.label, proxy.type, {
                    timeoutMs: this.ipCheckTimeoutMs,
                    maxAttempts: this.ipCheckMaxAttempts
                })) {
                    console.log(`✅ Proxy ${proxy.label} (${regionName}) has a new IP`);
                    foundNewIP = true;
                } else {
                    console.log(`❌ Proxy ${proxy.label} (${regionName}) still has the same IP`);
                }
            } catch (error) {
                console.warn(`⚠️  Could not check IP for ${proxy.label} (${regionName}): ${error.message}`);
            }
        }

        return foundNewIP;
    }

    /**
     * Get current statistics including geographic distribution
     */
    getStats() {
        const ipStats = this.ipTracker.getStats();
        const regionStats = {};
        
        for (const [regionName, region] of this.regions) {
            const allocated = this.regionAllocations.get(regionName) || 0;
            const targetWeight = this.regionWeights.get(regionName) || 0;
            const targetAllocated = this.totalAllocations * targetWeight;
            
            regionStats[regionName] = {
                totalProxies: region.proxies.length,
                allocated,
                targetAllocated: Math.round(targetAllocated),
                targetPercentage: (targetWeight * 100).toFixed(1),
                actualPercentage: this.totalAllocations > 0 ? ((allocated / this.totalAllocations) * 100).toFixed(1) : '0.0',
                cycleCount: region.cycleCount,
                currentIndex: region.currentIndex
            };
        }
        
        return {
            ...ipStats,
            totalAllocations: this.totalAllocations,
            regionStats,
            geographicRatio: this.formatGeographicRatio(),
            totalRegions: this.regions.size,
            totalProxiesInRotation: Array.from(this.regions.values()).reduce((sum, region) => sum + region.proxies.length, 0)
        };
    }

    /**
     * Print detailed statistics
     */
    printStats() {
        const stats = this.getStats();
        
        console.log('\n🌍 Geographic Distribution Statistics:');
        console.log('='.repeat(80));
        console.log(`Total profiles allocated: ${stats.totalAllocations}`);
        console.log(`Total proxies in rotation: ${stats.totalProxiesInRotation} across ${stats.totalRegions} regions`);
        console.log(`Geographic ratio target: ${stats.geographicRatio}`);
        console.log('');
        
        for (const [regionName, regionStat] of Object.entries(stats.regionStats)) {
            const deviation = parseFloat(regionStat.actualPercentage) - parseFloat(regionStat.targetPercentage);
            const deviationStr = deviation >= 0 ? `+${deviation.toFixed(1)}` : deviation.toFixed(1);
            
            console.log(`${regionName.padEnd(10)} | Target: ${regionStat.targetPercentage.padStart(5)}% | Actual: ${regionStat.actualPercentage.padStart(5)}% (${deviationStr.padStart(6)}%) | Allocated: ${regionStat.allocated.toString().padStart(3)}/${regionStat.targetAllocated.toString().padStart(3)} | Proxies: ${regionStat.totalProxies.toString().padStart(3)} | Cycles: ${regionStat.cycleCount}`);
        }
        
        console.log('='.repeat(80));
        
        if (stats.globalIPStats) {
            console.log(`Global IPs in use: ${Object.keys(stats.globalIPStats).length}`);
            console.log(`IPs at limit: ${Object.values(stats.globalIPStats).filter(stat => stat.atLimit).length}`);
        }
    }

    /**
     * Reset all tracking for a new batch session
     */
    reset() {
        this.proxyCycle = 0;
        this.totalAllocations = 0;
        this.regionAllocations.clear();
        
        // Reset region indices
        for (const region of this.regions.values()) {
            region.currentIndex = -1;
            region.cycleCount = 0;
        }
        
        this.ipTracker = new IPTracker({
            skipIPCheck: this.skipIPCheck,
            ipCheckTimeoutMs: this.ipCheckTimeoutMs,
            ipCheckMaxAttempts: this.ipCheckMaxAttempts
        });
        
        console.log('🔄 GeographicProxyRotator reset for new batch session');
    }

    /**
     * Check if batch should continue based on proxy availability across all regions
     */
    async shouldContinueBatch() {
        // Check if any region has available proxies
        for (const [regionName, region] of this.regions) {
            const hasAvailableProxies = region.proxies.some(proxy => 
                this.ipTracker.canUseProxy(proxy.label)
            );
            
            if (hasAvailableProxies) {
                return true;
            }
        }

        // No regions have available proxies, check for new IPs
        console.log('🔍 No available proxies in any region, checking for new IPs...');
        
        let hasAnyNewIPs = false;
        for (const regionName of this.regions.keys()) {
            if (await this.checkRegionForNewIPs(regionName)) {
                hasAnyNewIPs = true;
            }
        }

        return hasAnyNewIPs;
    }
}