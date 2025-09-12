import https from 'https';
import http from 'http';
import { SocksProxyAgent } from 'socks-proxy-agent';

export class IPTracker {
    constructor() {
        this.ipHistory = new Map(); // proxyLabel -> Set of IPs seen
        this.currentBatchIPs = new Map(); // proxyLabel -> current IP
        this.proxyUsageCount = new Map(); // proxyLabel -> usage count in current batch
        this.globalIPUsage = new Map(); // IP -> usage count across all proxies
        this.globalIPToProxies = new Map(); // IP -> Set of proxy labels using this IP
        this.maxProfilesPerIP = 5;
    }

    /**
     * Get current IP address using proxy
     */
    async getCurrentIP(proxyConfig) {
        // Use HTTP-only endpoints for simpler testing
        const ipServices = [
            'http://httpbin.org/ip',
            'http://icanhazip.com',
            'http://ipinfo.io/ip'
        ];

        const errors = [];
        
        for (const service of ipServices) {
            try {
                console.log(`Trying IP service: ${service} with proxy: ${proxyConfig.server}`);
                const ip = await this.fetchIPFromURL(service, proxyConfig);
                console.log(`Got IP: ${ip} from ${service}`);
                return ip;
            } catch (error) {
                console.log(`Failed to get IP from ${service}:`, error.message);
                errors.push(`${service}: ${error.message}`);
                continue;
            }
        }
        
        throw new Error(`All IP services failed: ${errors.join(', ')}`);
    }

    /**
     * Fetch IP from a specific URL using proxy
     */
    async fetchIPFromURL(url, proxyConfig) {
        return new Promise((resolve, reject) => {
            const timeout = 10000; // 10 second timeout
            
            // Parse the target URL
            const targetUrl = new URL(url);
            
            let options = {
                timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Host': targetUrl.hostname
                }
            };

            // Handle different proxy types
            if (proxyConfig.server.startsWith('socks5://')) {
                // For SOCKS5, use the agent
                options.agent = new SocksProxyAgent(proxyConfig.server);
                options.hostname = targetUrl.hostname;
                options.port = targetUrl.port || 80;
                options.path = targetUrl.pathname + targetUrl.search;
                options.method = 'GET';
            } else if (proxyConfig.server.startsWith('http://')) {
                // For HTTP proxy, connect to proxy and request full URL
                const proxyUrl = new URL(proxyConfig.server);
                options.hostname = proxyUrl.hostname;
                options.port = proxyUrl.port;
                options.path = url; // Full URL for HTTP proxy
                options.method = 'GET';
                
                // Add proxy authentication if available
                if (proxyConfig.username && proxyConfig.password) {
                    const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64');
                    options.headers['Proxy-Authorization'] = `Basic ${auth}`;
                }
            } else {
                // Direct connection (no proxy)
                options.hostname = targetUrl.hostname;
                options.port = targetUrl.port || 80;
                options.path = targetUrl.pathname + targetUrl.search;
                options.method = 'GET';
            }

            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        // Try to parse as JSON first
                        let ip;
                        try {
                            const parsed = JSON.parse(data);
                            ip = parsed.ip || parsed.origin?.split(',')[0]?.trim();
                        } catch {
                            // If not JSON, assume the response body is the IP
                            ip = data.trim();
                        }
                        
                        if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                            resolve(ip);
                        } else {
                            reject(new Error(`Invalid IP response: ${data}`));
                        }
                    } catch (error) {
                        reject(error);
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
     * Check if we can use a proxy (hasn't hit the 5-profile limit per proxy OR globally per IP)
     */
    canUseProxy(proxyLabel) {
        const usageCount = this.proxyUsageCount.get(proxyLabel) || 0;
        if (usageCount >= this.maxProfilesPerIP) {
            return false;
        }
        
        // Also check if the current IP for this proxy has reached global limit
        const currentIP = this.currentBatchIPs.get(proxyLabel);
        if (currentIP) {
            const globalUsage = this.globalIPUsage.get(currentIP) || 0;
            if (globalUsage >= this.maxProfilesPerIP) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Record proxy usage and IP with global IP tracking
     */
    async recordProxyUsage(proxyConfig, proxyLabel) {
        try {
            // Get current IP
            const currentIP = await this.getCurrentIP(proxyConfig, proxyLabel);
            
            // Check if this IP is already at global limit
            const globalUsage = this.globalIPUsage.get(currentIP) || 0;
            if (globalUsage >= this.maxProfilesPerIP) {
                throw new Error(`IP ${currentIP} has reached global usage limit (${this.maxProfilesPerIP})`);
            }
            
            // Initialize tracking for this proxy if needed
            if (!this.ipHistory.has(proxyLabel)) {
                this.ipHistory.set(proxyLabel, new Set());
            }
            if (!this.globalIPToProxies.has(currentIP)) {
                this.globalIPToProxies.set(currentIP, new Set());
            }
            
            // Record IP in history
            this.ipHistory.get(proxyLabel).add(currentIP);
            this.currentBatchIPs.set(proxyLabel, currentIP);
            this.globalIPToProxies.get(currentIP).add(proxyLabel);
            
            // Increment usage counts
            const currentCount = this.proxyUsageCount.get(proxyLabel) || 0;
            this.proxyUsageCount.set(proxyLabel, currentCount + 1);
            
            const newGlobalUsage = globalUsage + 1;
            this.globalIPUsage.set(currentIP, newGlobalUsage);
            
            const proxiesUsingIP = Array.from(this.globalIPToProxies.get(currentIP));
            console.log(`📊 Proxy ${proxyLabel}: IP ${currentIP}, usage ${currentCount + 1}/${this.maxProfilesPerIP} (global: ${newGlobalUsage}/${this.maxProfilesPerIP}, used by: ${proxiesUsingIP.join(', ')})`);
            
            return currentIP;
        } catch (error) {
            console.warn(`⚠️  Could not record proxy usage for ${proxyLabel}: ${error.message}`);
            // Still increment usage count to avoid infinite retries
            const currentCount = this.proxyUsageCount.get(proxyLabel) || 0;
            this.proxyUsageCount.set(proxyLabel, currentCount + 1);
            throw error;
        }
    }

    /**
     * Check if proxy has a new IP compared to last batch
     */
    async hasNewIP(proxyConfig, proxyLabel) {
        try {
            const currentIP = await this.getCurrentIP(proxyConfig, proxyLabel);
            const lastKnownIP = this.currentBatchIPs.get(proxyLabel);
            
            if (!lastKnownIP) {
                return true; // First time using this proxy
            }
            
            const hasChanged = currentIP !== lastKnownIP;
            console.log(`🔄 IP change check for ${proxyLabel}: ${lastKnownIP} -> ${currentIP} (${hasChanged ? 'CHANGED' : 'SAME'})`);
            
            return hasChanged;
        } catch (error) {
            console.warn(`⚠️  Could not check IP for ${proxyLabel}: ${error.message}`);
            return false; // Assume no change if we can't check
        }
    }

    /**
     * Check if an IP is already being used by any proxy (for preventing duplicates across labels)
     */
    isIPAlreadyUsed(ip) {
        const globalUsage = this.globalIPUsage.get(ip) || 0;
        return globalUsage > 0;
    }

    /**
     * Get proxies currently using a specific IP
     */
    getProxiesUsingIP(ip) {
        return Array.from(this.globalIPToProxies.get(ip) || []);
    }

    /**
     * Reset usage counts for next batch cycle
     */
    resetBatchCounts() {
        console.log('🔄 Resetting batch proxy usage counts and global IP tracking');
        this.proxyUsageCount.clear();
        this.globalIPUsage.clear();
        this.globalIPToProxies.clear();
    }

    /**
     * Get usage statistics including global IP tracking
     */
    getStats() {
        const stats = {
            totalUniqueIPs: 0,
            globallyUniqueIPs: new Set(),
            proxyStats: {},
            globalIPStats: {}
        };

        // Calculate proxy-specific stats
        for (const [proxyLabel, ips] of this.ipHistory.entries()) {
            stats.proxyStats[proxyLabel] = {
                uniqueIPs: ips.size,
                ips: Array.from(ips),
                currentUsage: this.proxyUsageCount.get(proxyLabel) || 0,
                currentIP: this.currentBatchIPs.get(proxyLabel)
            };
            
            // Add to global unique IPs
            for (const ip of ips) {
                stats.globallyUniqueIPs.add(ip);
            }
        }

        // Calculate global IP stats
        for (const [ip, usage] of this.globalIPUsage.entries()) {
            const proxiesUsingIP = Array.from(this.globalIPToProxies.get(ip) || []);
            stats.globalIPStats[ip] = {
                usage,
                proxies: proxiesUsingIP,
                atLimit: usage >= this.maxProfilesPerIP
            };
        }

        stats.totalUniqueIPs = stats.globallyUniqueIPs.size;
        
        return stats;
    }

    /**
     * Check if we've exhausted all usable IPs
     */
    async checkAllProxiesExhausted(proxyManager) {
        const workingProxies = [
            ...proxyManager.loadedProxies.http.map(p => ({ ...p, type: 'http' })),
            ...proxyManager.loadedProxies.socks5.map(p => ({ ...p, type: 'socks5' }))
        ];

        let hasNewIPs = false;

        for (const proxy of workingProxies) {
            const proxyConfig = proxyManager.toPlaywrightProxy(proxy);
            try {
                if (await this.hasNewIP(proxyConfig, proxy.label)) {
                    hasNewIPs = true;
                    break;
                }
            } catch (error) {
                // Continue checking other proxies
                continue;
            }
        }

        return !hasNewIPs;
    }
}