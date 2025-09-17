import https from 'https';
import http from 'http';
import { SocksProxyAgent } from 'socks-proxy-agent';

export class IPTracker {
    constructor(options = {}) {
        this.ipHistory = new Map(); // proxyLabel -> Set of IPs seen
        this.currentBatchIPs = new Map(); // proxyLabel -> current IP
        this.proxyUsageCount = new Map(); // proxyLabel -> usage count in current batch
        this.globalIPUsage = new Map(); // IP -> usage count across all proxies
        this.globalIPToProxies = new Map(); // IP -> Set of proxy labels using this IP
        this.maxProfilesPerIP = 5;

        // IP check behavior
        this.ipCheckTimeoutMs = options.ipCheckTimeoutMs || 10000; // per-request timeout
        this.ipCheckMaxAttempts = options.ipCheckMaxAttempts || 3; // how many endpoints to try
        this.skipIPCheck = options.skipIPCheck || false; // global skip toggle
    }

    /**
     * Get current IP address using proxy
     */
    async getCurrentIP(proxyConfig, overrides = {}) {
        if (this.skipIPCheck || overrides.skipIPCheck) {
            console.log(`🟡 Skipping IP check (configured to skip)`);
            return null;
        }
    
        // Multiple reliable IP echo services with rotation
        // Prioritize HTTP services to avoid HTTPS through HTTP proxy issues
        const ipServices = [
            // Primary: HTTP services (work better with HTTP proxies)
            'http://icanhazip.com',
            'http://ipv4.icanhazip.com', 
            'http://checkip.amazonaws.com',
            // Secondary: HTTPS services (may have issues with some HTTP proxies)
            'https://api.ipify.org?format=text',
            'https://ipinfo.io/ip',
            'https://ident.me',
            // Backup services
            'https://ipecho.net/plain',
            'https://postman-echo.com/ip',
            'https://api.myip.com',
            'https://wtfismyip.com/text'
        ];
    
        const errors = [];
        const timeoutMs = overrides.timeoutMs || this.ipCheckTimeoutMs;
        const maxAttempts = Math.max(1, overrides.maxAttempts || this.ipCheckMaxAttempts);
    
        let attempts = 0;
        for (const service of ipServices) {
            if (attempts >= maxAttempts) break;
            attempts++;
    
            try {
                console.log(`Trying IP service: ${service} with proxy: ${proxyConfig.server}`);
                const result = await this.fetchIPFromURL(service, proxyConfig, timeoutMs);
                
                if (result.isProxyError) {
                    // Mark proxy as problematic and continue to next service
                    console.log(`⚠️ Proxy issue detected with ${service}: ${result.error}`);
                    errors.push(`${service}: ${result.error} (proxy issue)`);
                    continue;
                }
                
                console.log(`Got IP: ${result.ip} from ${service}`);
                return result.ip;
            } catch (error) {
                console.log(`Failed to get IP from ${service}:`, error.message);
                errors.push(`${service}: ${error.message}`);
                continue;
            }
        }
        
        throw new Error(`All IP services failed (${attempts} attempt${attempts !== 1 ? 's' : ''}): ${errors.join(', ')}`);
    }

    /**
     * Fetch IP from a specific URL using proxy with enhanced error detection
     */
    async fetchIPFromURL(url, proxyConfig, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            try {
                const timeout = timeoutMs;
                const targetUrl = new URL(url);

                // Choose protocol module for direct/SOCKS5 requests
                const isHttpsTarget = targetUrl.protocol === 'https:';
                const httpModule = isHttpsTarget ? https : http;

                // Base options
                const options = {
                    timeout,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate',
                        'Cache-Control': 'no-cache'
                    },
                    method: 'GET'
                };

                // Defensive: ensure proxyConfig is sane
                if (!proxyConfig || !proxyConfig.server) {
                    return reject(new Error('Invalid proxy configuration: missing server'));
                }

                // Proxy handling
                const server = String(proxyConfig.server || '');
                if (server.startsWith('socks5://')) {
                    // SOCKS5 agent handles both http and https targets
                    options.agent = new SocksProxyAgent(server);
                    options.hostname = targetUrl.hostname;
                    options.port = targetUrl.port || (isHttpsTarget ? 443 : 80);
                    options.path = targetUrl.pathname + targetUrl.search;
                } else if (server.startsWith('http://')) {
                    // HTTP proxy: handle both HTTP and HTTPS targets
                    const proxyUrl = new URL(server);
                    if (isHttpsTarget) {
                        // For HTTPS targets through HTTP proxy, use CONNECT method
                        options.agent = new (isHttpsTarget ? https : http).Agent({
                            host: proxyUrl.hostname,
                            port: proxyUrl.port || 80,
                            auth: proxyConfig.username && proxyConfig.password 
                                ? `${proxyConfig.username}:${proxyConfig.password}` 
                                : undefined
                        });
                        options.hostname = targetUrl.hostname;
                        options.port = targetUrl.port || 443;
                        options.path = targetUrl.pathname + targetUrl.search;
                    } else {
                        // For HTTP targets, request absolute URL through proxy
                        options.hostname = proxyUrl.hostname;
                        options.port = proxyUrl.port || 80;
                        options.path = url; // absolute URL for proxy
                        // Proxy auth
                        if (proxyConfig.username && proxyConfig.password) {
                            const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64');
                            options.headers['Proxy-Authorization'] = `Basic ${auth}`;
                        }
                    }
                } else {
                    // Direct request (no proxy)
                    options.hostname = targetUrl.hostname;
                    options.port = targetUrl.port || (isHttpsTarget ? 443 : 80);
                    options.path = targetUrl.pathname + targetUrl.search;
                }

                const req = httpModule.request(options, (res) => {
                    let data = '';
                    res.setEncoding('utf8');

                    res.on('data', (chunk) => { data += chunk; });

                    res.on('aborted', () => {
                        reject(new Error('Response aborted'));
                    });

                    res.on('error', (err) => {
                        reject(new Error(`Response error: ${err.message}`));
                    });

                    res.on('end', () => {
                        try {
                            // Check for proxy authentication or payment errors
                            if (res.statusCode === 401) {
                                const errorMsg = 'Proxy requires authentication (401 Unauthorized)';
                                return resolve({ isProxyError: true, error: errorMsg, statusCode: 401 });
                            }
                            if (res.statusCode === 402) {
                                const errorMsg = 'Proxy requires payment (402 Payment Required)';
                                return resolve({ isProxyError: true, error: errorMsg, statusCode: 402 });
                            }
                            if (res.statusCode === 403) {
                                const errorMsg = 'Proxy access forbidden (403 Forbidden)';
                                return resolve({ isProxyError: true, error: errorMsg, statusCode: 403 });
                            }
                            if (res.statusCode === 407) {
                                const errorMsg = 'Proxy authentication required (407)';
                                return resolve({ isProxyError: true, error: errorMsg, statusCode: 407 });
                            }
                            if (res.statusCode >= 500) {
                                const errorMsg = `Proxy server error (${res.statusCode})`;
                                return resolve({ isProxyError: true, error: errorMsg, statusCode: res.statusCode });
                            }
                            
                            // Check for common proxy error pages in response body
                            if (data.toLowerCase().includes('payment required') || 
                                data.toLowerCase().includes('upgrade your plan') ||
                                data.toLowerCase().includes('subscription expired') ||
                                data.toLowerCase().includes('insufficient funds')) {
                                const errorMsg = 'Proxy subscription/payment required';
                                return resolve({ isProxyError: true, error: errorMsg, statusCode: res.statusCode });
                            }
                            
                            if (res.statusCode !== 200) {
                                reject(new Error(`HTTP ${res.statusCode}: ${data?.slice(0, 200) || 'No response body'}`));
                                return;
                            }

                            let ip;
                            // Handle different response formats from various services
                            try {
                                // Try JSON first (ipify, postman-echo, etc.)
                                const parsed = JSON.parse(data);
                                ip = parsed.ip || parsed.origin?.split(',')[0]?.trim();
                            } catch {
                                // Fallback to plain text (icanhazip, ident.me, etc.)
                                ip = (data || '').trim();
                                
                                // Handle potential multi-line responses
                                const lines = ip.split('\n').map(l => l.trim()).filter(l => l);
                                if (lines.length > 0) {
                                    ip = lines[0]; // Take first non-empty line
                                }
                            }

                            // Validate IPv4 format
                            if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
                                // Additional validation: check if octets are in valid range
                                const octets = ip.split('.').map(Number);
                                if (octets.every(octet => octet >= 0 && octet <= 255)) {
                                    return resolve({ ip, isProxyError: false });
                                }
                            }
                            
                            reject(new Error(`Invalid IP response: ${data?.slice(0, 200) || 'Empty response'}`));
                        } catch (error) {
                            reject(error);
                        }
                    });
                });

                // Enhanced error handling
                req.on('timeout', () => {
                    try { req.destroy(); } catch (_) {}
                    reject(new Error('Request timeout'));
                });

                req.on('abort', () => {
                    reject(new Error('Request aborted'));
                });

                req.on('error', (error) => {
                    // Check for common proxy connection errors
                    if (error.code === 'ECONNREFUSED') {
                        error.message += ' (proxy connection refused)';
                    } else if (error.code === 'ETIMEDOUT') {
                        error.message += ' (proxy connection timeout)';
                    } else if (error.code === 'ENOTFOUND') {
                        error.message += ' (proxy host not found)';
                    }
                    reject(error);
                });

                req.on('socket', (socket) => {
                    // Prevent unhandled socket errors from crashing the process
                    const onSockErr = (err) => {
                        try { req.destroy(err); } catch (_) {}
                    };
                    socket.on('error', onSockErr);
                });

                req.setTimeout(timeout);
                req.end();
            } catch (outerErr) {
                reject(outerErr);
            }
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
    async recordProxyUsage(proxyConfig, proxyLabel, proxyType = null, options = {}) {
        try {
            // Configured skip path (no IP calls)
            if (this.skipIPCheck || options.skipIPCheck) {
                const currentCount = this.proxyUsageCount.get(proxyLabel) || 0;
                this.proxyUsageCount.set(proxyLabel, currentCount + 1);
                this.currentBatchIPs.set(proxyLabel, null);
                if (!this.ipHistory.has(proxyLabel)) {
                    this.ipHistory.set(proxyLabel, new Set());
                }
                console.log(`📊 Proxy ${proxyLabel}: usage ${currentCount + 1}/${this.maxProfilesPerIP} (IP check skipped)`);
                return null;
            }
    
            // For SOCKS5 proxies, skip IP checking to avoid connection exhaustion
            if (proxyType === 'socks5' || proxyConfig.server.startsWith('socks5://')) {
                const uniqueIP = `socks5-${proxyLabel}`;
                if (!this.ipHistory.has(proxyLabel)) {
                    this.ipHistory.set(proxyLabel, new Set());
                }
                if (!this.globalIPToProxies.has(uniqueIP)) {
                    this.globalIPToProxies.set(uniqueIP, new Set());
                }
                this.ipHistory.get(proxyLabel).add(uniqueIP);
                this.currentBatchIPs.set(proxyLabel, uniqueIP);
                this.globalIPToProxies.get(uniqueIP).add(proxyLabel);
    
                const currentCount = this.proxyUsageCount.get(proxyLabel) || 0;
                this.proxyUsageCount.set(proxyLabel, currentCount + 1);
    
                const newGlobalUsage = 1; // treat as unique
                this.globalIPUsage.set(uniqueIP, newGlobalUsage);
    
                console.log(`📊 SOCKS5 Proxy ${proxyLabel}: unique connection, usage ${currentCount + 1}/${this.maxProfilesPerIP}`);
                return uniqueIP;
            }
            
            // For HTTP proxies, use known IP if provided to avoid duplicate network call
            let currentIP = options.knownIP || null;
            if (!currentIP) {
                currentIP = await this.getCurrentIP(proxyConfig, {
                    timeoutMs: options.timeoutMs || this.ipCheckTimeoutMs,
                    maxAttempts: options.maxAttempts || this.ipCheckMaxAttempts
                });
            }
            
            const globalUsage = this.globalIPUsage.get(currentIP) || 0;
            if (globalUsage >= this.maxProfilesPerIP) {
                throw new Error(`IP ${currentIP} has reached global usage limit (${this.maxProfilesPerIP})`);
            }
            
            if (!this.ipHistory.has(proxyLabel)) {
                this.ipHistory.set(proxyLabel, new Set());
            }
            if (!this.globalIPToProxies.has(currentIP)) {
                this.globalIPToProxies.set(currentIP, new Set());
            }
            
            this.ipHistory.get(proxyLabel).add(currentIP);
            this.currentBatchIPs.set(proxyLabel, currentIP);
            this.globalIPToProxies.get(currentIP).add(proxyLabel);
            
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
    async hasNewIP(proxyConfig, proxyLabel, proxyType = null, options = {}) {
        try {
            if (this.skipIPCheck || options.skipIPCheck) {
                console.log(`🟡 Skipping IP change check for ${proxyLabel} (configured to skip)`);
                return true;
            }
    
            // For SOCKS5 proxies, skip IP checking to avoid connection exhaustion
            if (proxyType === 'socks5' || proxyConfig.server.startsWith('socks5://')) {
                console.log(`🧦 SOCKS5 proxy ${proxyLabel}: skipping IP check (always unique)`);
                return true; // SOCKS5 proxies are always considered to have unique IPs
            }
            
            // For HTTP proxies, use the original IP checking logic
            const currentIP = await this.getCurrentIP(proxyConfig, {
                timeoutMs: options.timeoutMs || this.ipCheckTimeoutMs,
                maxAttempts: options.maxAttempts || this.ipCheckMaxAttempts
            });
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