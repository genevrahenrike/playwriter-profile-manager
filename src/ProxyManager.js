import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProxyManager {
    constructor(options = {}) {
        this.proxiesDir = options.proxiesDir || path.join(__dirname, '../proxies');
        this.httpProxiesFile = path.join(this.proxiesDir, 'http.proxies.json');
        // New Decodo style colon-delimited list (host:port:user:pass) - now the preferred default
        this.colonListFile = path.join(this.proxiesDir, 'decode-proxies-global-5k.txt');
    // Accept either the newer v2 filename or the common `http.proxies.v2.json`
    this.httpProxiesV2File = path.join(this.proxiesDir, 'http.proxies.v2new.json');
    this.httpProxiesV2AltFile = path.join(this.proxiesDir, 'http.proxies.v2.json');
        this.socks5ProxiesFile = path.join(this.proxiesDir, 'socks5.proxies.json');
        this.loadedProxies = {
            http: [],
            socks5: []
        };
        this.lastProxyIndex = {
            http: -1,
            socks5: -1
        };
    }

    /**
     * Load proxy configurations from files
     */
    async loadProxies() {
        try {
            // Load HTTP proxies - try new colon list first, then v2 formats, then (disabled) v1
            if (await fs.pathExists(this.colonListFile)) {
                const raw = await fs.readFile(this.colonListFile, 'utf8');
                const parsed = this.parseColonList(raw);
                this.loadedProxies.http = parsed;
                console.log(`📡 Loaded ${this.loadedProxies.http.length} HTTP proxies (colon list)`);
            } else if (await fs.pathExists(this.httpProxiesV2File)) {
                const httpV2Data = await fs.readJson(this.httpProxiesV2File);
                this.loadedProxies.http = Array.isArray(httpV2Data) ? this.convertV2ToV1Format(httpV2Data) : [];
                console.log(`📡 Loaded ${this.loadedProxies.http.length} HTTP proxies (v2 format: v2new)`);
            } else if (await fs.pathExists(this.httpProxiesV2AltFile)) {
                const httpV2Data = await fs.readJson(this.httpProxiesV2AltFile);
                this.loadedProxies.http = Array.isArray(httpV2Data) ? this.convertV2ToV1Format(httpV2Data) : [];
                console.log(`📡 Loaded ${this.loadedProxies.http.length} HTTP proxies (v2 format: v2)`);
            } /* else if (await fs.pathExists(this.httpProxiesFile)) {
                const httpData = await fs.readJson(this.httpProxiesFile);
                this.loadedProxies.http = Array.isArray(httpData) ? httpData : [];
                console.log(`📡 Loaded ${this.loadedProxies.http.length} HTTP proxies (v1 format)`);
            } */

            // Load SOCKS5 proxies
            if (await fs.pathExists(this.socks5ProxiesFile)) {
                const socks5Data = await fs.readJson(this.socks5ProxiesFile);
                this.loadedProxies.socks5 = Array.isArray(socks5Data) ? socks5Data : [];
                console.log(`📡 Loaded ${this.loadedProxies.socks5.length} SOCKS5 proxies`);
            }

            // Filter out non-working proxies
            this.filterWorkingProxies();

        } catch (error) {
            console.warn(`⚠️  Could not load proxies: ${error.message}`);
        }
    }

    /**
     * Parse colon-delimited proxy list (host:port:username:password per line)
     * Returns array in internal v1-compatible shape
     */
    parseColonList(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        const proxies = [];
        let count = 0;
        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length < 4) continue; // skip invalid lines
            const [host, portStr, username, password] = parts;
            const port = parseInt(portStr, 10);
            if (!host || !port || !username || !password) continue;
            count += 1;
            const label = `Decodo${count}`; // simple incremental label
            proxies.push({
                label,
                host,
                port,
                login: username,
                username,
                password,
                url: `http://${username}:${encodeURIComponent(password)}@${host}:${port}`,
                status: 'OK',
                lastChecked: null,
                // Provide baseline fields expected by filters
                country: null,
                connectionType: 'datacenter',
                mode: 'http',
                profiles: [],
                profilesCount: 0,
                checkDate: null,
                createdAt: null,
                timezone: null,
                isPaymentRequired: false,
                isAuthRequired: false,
                lastResult: null,
                latency: null,
                checkedService: null
            });
        }
        return proxies;
    }

    /**
     * Convert v2 proxy format to v1 format for compatibility
     */
    convertV2ToV1Format(v2Proxies) {
        return v2Proxies.map((proxy, index) => {
            // Generate a label based on country and connection type
            const countryName = this.getCountryName(proxy.country);
            const connectionTypeSuffix = proxy.connectionType === 'datacenter' ? '-DC' : '';
            
            // Count how many proxies we've seen for this country to create unique labels
            const countryCount = v2Proxies.slice(0, index + 1)
                .filter(p => p.country === proxy.country && p.connectionType === proxy.connectionType)
                .length;
            
            const label = `${countryName}${countryCount}${connectionTypeSuffix}`;

            return {
                // v1 format fields
                label: label,
                host: proxy.host,
                port: proxy.port,
                login: proxy.username, // v2 uses 'username', v1 uses 'login'
                username: proxy.username, // Keep both for compatibility
                password: proxy.password,
                url: `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`,
                status: proxy.status === true ? 'OK' : 'ERROR',
                lastChecked: proxy.checkDate,
                
                // v2 format fields (preserved for filtering)
                _id: proxy._id,
                id: proxy.id,
                customName: proxy.customName,
                country: proxy.country,
                connectionType: proxy.connectionType,
                mode: proxy.mode,
                profiles: proxy.profiles,
                profilesCount: proxy.profilesCount,
                checkDate: proxy.checkDate,
                createdAt: proxy.createdAt,
                timezone: proxy.timezone,
                
                // Sweep result fields (preserved for filtering)
                isPaymentRequired: proxy.isPaymentRequired || false,
                isAuthRequired: proxy.isAuthRequired || false,
                lastResult: proxy.lastResult,
                lastChecked: proxy.lastChecked,
                latency: proxy.latency,
                checkedService: proxy.checkedService
            };
        });
    }

    /**
     * Get country name from ISO code
     */
    getCountryName(countryCode) {
        const countryMap = {
            'US': 'US',
            'GB': 'UK',
            'DE': 'Germany',
            'FR': 'France',
            'AU': 'Australia',
            'CA': 'Canada',
            'JP': 'Japan',
            'NL': 'Netherlands',
            'IT': 'Italy',
            'ES': 'Spain'
        };
        return countryMap[countryCode] || countryCode;
    }

    /**
     * Filter out proxies with ERROR status, payment requirements, auth issues, or other failures
     */
    filterWorkingProxies() {
        const httpWorking = this.loadedProxies.http.filter(proxy => 
            proxy.status === 'OK' && 
            !proxy.isPaymentRequired && 
            !proxy.isAuthRequired &&
            // Skip proxies that failed the sweep (have lastResult but it's not 'OK')
            (!proxy.lastResult || proxy.lastResult === 'OK')
        );
        const socks5Working = this.loadedProxies.socks5.filter(proxy => 
            proxy.status === 'OK' && 
            !proxy.isPaymentRequired && 
            !proxy.isAuthRequired &&
            // Skip proxies that failed the sweep (have lastResult but it's not 'OK')
            (!proxy.lastResult || proxy.lastResult === 'OK')
        );
        
        // Log detailed filtering results
        const httpFiltered = this.loadedProxies.http.length - httpWorking.length;
        const socks5Filtered = this.loadedProxies.socks5.length - socks5Working.length;
        
        if (httpFiltered > 0) {
            const paymentRequired = this.loadedProxies.http.filter(p => p.isPaymentRequired).length;
            const authRequired = this.loadedProxies.http.filter(p => p.isAuthRequired).length;
            const sweepFailed = this.loadedProxies.http.filter(p => p.lastResult && p.lastResult !== 'OK').length;
            const statusError = this.loadedProxies.http.filter(p => p.status !== 'OK').length;
            console.log(`🔍 Filtered HTTP proxies: ${httpWorking.length}/${this.loadedProxies.http.length} working`);
            console.log(`   Filtered: ${httpFiltered} total (${paymentRequired} payment required, ${authRequired} auth required, ${sweepFailed} sweep failed, ${statusError} status error)`);
        }
        if (socks5Filtered > 0) {
            const paymentRequired = this.loadedProxies.socks5.filter(p => p.isPaymentRequired).length;
            const authRequired = this.loadedProxies.socks5.filter(p => p.isAuthRequired).length;
            const sweepFailed = this.loadedProxies.socks5.filter(p => p.lastResult && p.lastResult !== 'OK').length;
            const statusError = this.loadedProxies.socks5.filter(p => p.status !== 'OK').length;
            console.log(`🔍 Filtered SOCKS5 proxies: ${socks5Working.length}/${this.loadedProxies.socks5.length} working`);
            console.log(`   Filtered: ${socks5Filtered} total (${paymentRequired} payment required, ${authRequired} auth required, ${sweepFailed} sweep failed, ${statusError} status error)`);
        }

        this.loadedProxies.http = httpWorking;
        this.loadedProxies.socks5 = socks5Working;
    }

    /**
     * Filter proxies by connection type (resident, datacenter, mobile)
     */
    filterByConnectionType(proxies, connectionType) {
        if (!connectionType) return proxies;
        return proxies.filter(proxy => proxy.connectionType === connectionType);
    }

    /**
     * Filter proxies by country
     */
    filterByCountry(proxies, country) {
        if (!country) return proxies;
        const countryLower = country.toLowerCase();
        return proxies.filter(proxy => {
            // Exact match on country code
            if (proxy.country === country) return true;
            
            // Exact match on custom name (avoid partial matches like "US" in "Australia")
            if (proxy.customName) {
                const customNameLower = proxy.customName.toLowerCase();
                // Check for exact word match to avoid "US" matching "Australia"
                const words = customNameLower.split(/\s+/);
                return words.includes(countryLower) || customNameLower === countryLower;
            }
            
            return false;
        });
    }

    /**
     * Get filtered proxies based on criteria
     */
    getFilteredProxies(options = {}) {
        const { type, connectionType, country } = options;
        let proxies = [];

        if (type && this.loadedProxies[type]) {
            proxies = this.loadedProxies[type].map(proxy => ({ ...proxy, type }));
        } else {
            proxies = [
                ...this.loadedProxies.http.map(proxy => ({ ...proxy, type: 'http' })),
                ...this.loadedProxies.socks5.map(proxy => ({ ...proxy, type: 'socks5' }))
            ];
        }

        // Apply filters
        if (connectionType) {
            proxies = this.filterByConnectionType(proxies, connectionType);
        }
        if (country) {
            proxies = this.filterByCountry(proxies, country);
        }

        return proxies;
    }

    /**
     * Get all available proxies
     */
    getAllProxies() {
        return {
            http: [...this.loadedProxies.http],
            socks5: [...this.loadedProxies.socks5],
            total: this.loadedProxies.http.length + this.loadedProxies.socks5.length
        };
    }

    /**
     * Get proxy by label/name
     */
    getProxyByLabel(label, type = null) {
        if (type) {
            const proxy = this.loadedProxies[type]?.find(proxy => 
                proxy.label?.toLowerCase() === label.toLowerCase()
            );
            return proxy ? { ...proxy, type } : null;
        }

        // Search in both types if type not specified
        for (const proxyType of ['http', 'socks5']) {
            const proxy = this.loadedProxies[proxyType].find(proxy => 
                proxy.label?.toLowerCase() === label.toLowerCase()
            );
            if (proxy) {
                return { ...proxy, type: proxyType };
            }
        }
        return null;
    }

    /**
     * Get random proxy of specified type or any type
     */
    getRandomProxy(type = null, options = {}) {
        const availableProxies = this.getFilteredProxies({ type, ...options });

        if (availableProxies.length === 0) {
            return null;
        }

        const randomIndex = Math.floor(Math.random() * availableProxies.length);
        return availableProxies[randomIndex];
    }

    /**
     * Get next proxy in round-robin fashion
     */
    getNextProxy(type = null, options = {}) {
        const candidateProxies = this.getFilteredProxies({ type, ...options });

        if (candidateProxies.length === 0) return null;

        if (!this.lastGlobalIndex) this.lastGlobalIndex = -1;
        this.lastGlobalIndex = (this.lastGlobalIndex + 1) % candidateProxies.length;
        return candidateProxies[this.lastGlobalIndex];
    }

    /**
     * Get fastest proxy (lowest latency)
     */
    getFastestProxy(type = null, options = {}) {
        const candidates = this.getFilteredProxies({ type, ...options });

        if (candidates.length === 0) return null;

        // Filter out proxies without latency data
        const proxiesWithLatency = candidates.filter(proxy =>
            proxy.avgLatencyMs && proxy.avgLatencyMs > 0
        );

        if (proxiesWithLatency.length === 0) {
            // Fallback to random if no latency data
            return this.getRandomProxy(type, options);
        }

        // Sort by average latency (ascending)
        proxiesWithLatency.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
        return proxiesWithLatency[0];
    }

    /**
     * Convert proxy to Playwright format
     */
    toPlaywrightProxy(proxy) {
        if (!proxy) return null;

        // Only support HTTP proxies due to Playwright/Chromium limitations with SOCKS5
        const protocol = 'http';

        const config = {
            server: `${protocol}://${proxy.host}:${proxy.port}`
        };

        // Add authentication for HTTP proxies
        if (proxy.username || proxy.login) {
            config.username = proxy.username || proxy.login;
        }
        if (proxy.password) {
            config.password = proxy.password;
        }

        // Debug: Log the proxy configuration being generated
        console.log(`🔧 Generated proxy config:`, {
            server: config.server,
            username: config.username ? '***' : undefined,
            password: config.password ? '***' : undefined
        });

        return config;
    }

    /**
     * Get proxy configuration for Playwright context
     */
    async getProxyConfig(selection = 'auto', type = null, options = {}) {
        // Ensure proxies are loaded
        if (this.loadedProxies.http.length === 0 && this.loadedProxies.socks5.length === 0) {
            await this.loadProxies();
        }

        let selectedProxy = null;

        // SOCKS5 proxies are not supported due to Playwright/Chromium limitations:
        // 1. Chromium doesn't support SOCKS5 proxy authentication
        // 2. SOCKS5 connections often fail with ERR_SOCKS_CONNECTION_FAILED
        // 3. SOCKS5 proxies have connection limits that conflict with IP checking
        if (type === 'socks5') {
            console.log(`❌ SOCKS5 proxies are not supported due to Playwright/Chromium limitations:`);
            console.log(`   • Chromium doesn't support SOCKS5 proxy authentication`);
            console.log(`   • SOCKS5 connections often fail (ERR_SOCKS_CONNECTION_FAILED)`);
            console.log(`   • SOCKS5 proxies have connection limits that conflict with IP checking`);
            console.log(`🔄 Falling back to HTTP proxies for reliable operation`);
            type = 'http'; // Fall back to HTTP proxies
        }

        switch (selection) {
            case 'auto':
            case 'random':
                selectedProxy = this.getRandomProxy(type, options);
                break;
            case 'fastest':
                selectedProxy = this.getFastestProxy(type, options);
                break;
            case 'round-robin':
                selectedProxy = this.getNextProxy(type, options);
                break;
            default:
                // Assume it's a label/name
                selectedProxy = this.getProxyByLabel(selection, type);
                break;
        }

        if (!selectedProxy) {
            const filterDesc = this.getFilterDescription(options);
            console.warn(`⚠️  No proxy found for selection: ${selection} (type: ${type || 'any'}${filterDesc})`);
            return null;
        }

        const config = this.toPlaywrightProxy(selectedProxy);
        // Attach metadata for debugging and downstream logic (non-Playwright fields start with underscore)
        if (config) {
            config._label = selectedProxy.label;
            config._country = selectedProxy.country;
            config._connectionType = selectedProxy.connectionType;
        }
        const connectionInfo = selectedProxy.connectionType ? ` [${selectedProxy.connectionType}]` : '';
        const countryInfo = selectedProxy.country ? ` (${selectedProxy.country})` : '';
        console.log(`🌐 Selected proxy: ${selectedProxy.label}${connectionInfo}${countryInfo} - ${selectedProxy.host}:${selectedProxy.port}`);
        
        if (selectedProxy.avgLatencyMs) {
            console.log(`   📊 Average latency: ${selectedProxy.avgLatencyMs}ms`);
        }

        return config;
    }

    /**
     * Get human-readable filter description
     */
    getFilterDescription(options) {
        const filters = [];
        if (options.connectionType) filters.push(`connectionType: ${options.connectionType}`);
        if (options.country) filters.push(`country: ${options.country}`);
        return filters.length > 0 ? `, ${filters.join(', ')}` : '';
    }

    /**
     * List all available proxies with status
     */
    listProxies() {
        const all = this.getAllProxies();
        
        console.log('\n📡 Available Proxies:');
        console.log(`Total: ${all.total} (${all.http.length} HTTP, ${all.socks5.length} SOCKS5)\n`);

        if (all.http.length > 0) {
            console.log('🔗 HTTP Proxies:');
            all.http.forEach((proxy, i) => {
                const latency = proxy.avgLatencyMs ? `${proxy.avgLatencyMs}ms` : 'unknown';
                console.log(`  ${i + 1}. ${proxy.label} - ${proxy.host}:${proxy.port} (${latency})`);
            });
            console.log('');
        }

        if (all.socks5.length > 0) {
            console.log('🧦 SOCKS5 Proxies:');
            all.socks5.forEach((proxy, i) => {
                const latency = proxy.avgLatencyMs ? `${proxy.avgLatencyMs}ms` : 'unknown';
                console.log(`  ${i + 1}. ${proxy.label} - ${proxy.host}:${proxy.port} (${latency})`);
            });
            console.log('');
        }

        return all;
    }

    /**
     * Test proxy connectivity (basic validation)
     */
    validateProxyConfig(proxy) {
        const required = ['host', 'port'];
        const missing = required.filter(field => !proxy[field]);
        
        if (missing.length > 0) {
            throw new Error(`Proxy missing required fields: ${missing.join(', ')}`);
        }

        if (proxy.port < 1 || proxy.port > 65535) {
            throw new Error(`Invalid proxy port: ${proxy.port}`);
        }

        return true;
    }

    /**
     * Test proxy functionality using IP echo services
     */
    async testProxy(proxy, timeout = 10000) {
        const proxyConfig = this.toPlaywrightProxy(proxy);
        if (!proxyConfig) {
            return { success: false, error: 'Could not generate proxy config', isPaymentRequired: false };
        }

        // Use a simple HTTP service for testing
        const testServices = [
            'http://icanhazip.com',
            'https://api.ipify.org?format=text',
            'http://ipv4.icanhazip.com'
        ];

        for (const service of testServices) {
            try {
                const result = await this.fetchIPThroughProxy(service, proxyConfig, timeout);
                
                if (result.isProxyError) {
                    const isPaymentRequired = result.statusCode === 401 || result.statusCode === 402 || 
                                            result.statusCode === 407 || 
                                            result.error.toLowerCase().includes('payment') ||
                                            result.error.toLowerCase().includes('subscription');
                    
                    return {
                        success: false,
                        error: result.error,
                        statusCode: result.statusCode,
                        isPaymentRequired,
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
            isPaymentRequired: false
        };
    }

    /**
     * Fetch IP through proxy for testing purposes
     */
    async fetchIPThroughProxy(url, proxyConfig, timeout = 10000) {
        const https = await import('https');
        const http = await import('http');
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const targetUrl = new URL(url);
            const isHttpsTarget = targetUrl.protocol === 'https:';

            // Configure proxy from proxyConfig.server
            if (!proxyConfig.server.startsWith('http://')) {
                return reject(new Error('Only HTTP proxies are supported'));
            }

            const proxyUrl = new URL(proxyConfig.server);
            const proxyAuth = proxyConfig.username && proxyConfig.password ? 
                Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64') : null;

            if (isHttpsTarget) {
                // HTTPS through HTTP proxy requires CONNECT tunneling
                this.fetchHTTPSThroughProxy(targetUrl, proxyUrl, proxyAuth, timeout)
                    .then(result => resolve({ ...result, latency: Date.now() - startTime }))
                    .catch(reject);
            } else {
                // HTTP through HTTP proxy
                const options = {
                    hostname: proxyUrl.hostname,
                    port: proxyUrl.port || 80,
                    path: url, // Full URL for HTTP proxy
                    method: 'GET',
                    timeout,
                    headers: {
                        'Host': targetUrl.host,
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        'Accept': 'text/plain, */*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Proxy-Connection': 'keep-alive'
                    }
                };

                // Add proxy authentication if available
                if (proxyAuth) {
                    options.headers['Proxy-Authorization'] = `Basic ${proxyAuth}`;
                }

                const req = http.default.request(options, (res) => {
                    this.handleProxyResponse(res, startTime, resolve, reject);
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
            }
        });
    }

    /**
     * Fetch HTTPS through HTTP proxy using CONNECT method
     */
    async fetchHTTPSThroughProxy(targetUrl, proxyUrl, proxyAuth, timeout) {
        const https = await import('https');
        const http = await import('http');
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            // First, establish CONNECT tunnel to proxy
            const connectOptions = {
                hostname: proxyUrl.hostname,
                port: proxyUrl.port || 80,
                method: 'CONNECT',
                path: `${targetUrl.hostname}:${targetUrl.port || 443}`,
                timeout: timeout / 2, // Use half timeout for CONNECT
                headers: {
                    'Host': `${targetUrl.hostname}:${targetUrl.port || 443}`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Proxy-Connection': 'keep-alive'
                }
            };

            // Add proxy authentication if available
            if (proxyAuth) {
                connectOptions.headers['Proxy-Authorization'] = `Basic ${proxyAuth}`;
            }

            const connectReq = http.default.request(connectOptions);

            connectReq.on('connect', (res, socket, head) => {
                if (res.statusCode !== 200) {
                    socket.destroy();
                    if (res.statusCode === 407) {
                        return resolve({
                            isProxyError: true,
                            error: 'Proxy authentication required',
                            statusCode: res.statusCode
                        });
                    }
                    if (res.statusCode === 402) {
                        return resolve({
                            isProxyError: true,
                            error: 'Proxy payment required',
                            statusCode: res.statusCode
                        });
                    }
                    return reject(new Error(`CONNECT failed: ${res.statusCode}`));
                }

                // Now make HTTPS request through the tunnel
                const httpsOptions = {
                    socket: socket,
                    servername: targetUrl.hostname,
                    path: targetUrl.pathname + targetUrl.search,
                    method: 'GET',
                    timeout: timeout / 2, // Use remaining half timeout
                    headers: {
                        'Host': targetUrl.host,
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        'Accept': 'text/plain, */*',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                };

                const httpsReq = https.default.request(httpsOptions, (httpsRes) => {
                    this.handleProxyResponse(httpsRes, startTime, resolve, reject);
                });

                httpsReq.on('timeout', () => {
                    socket.destroy();
                    reject(new Error('HTTPS request timeout'));
                });

                httpsReq.on('error', (error) => {
                    socket.destroy();
                    reject(error);
                });

                httpsReq.setTimeout(timeout / 2);
                httpsReq.end();
            });

            connectReq.on('error', (error) => {
                reject(error);
            });

            connectReq.on('timeout', () => {
                connectReq.destroy();
                reject(new Error('CONNECT timeout'));
            });

            connectReq.setTimeout(timeout / 2);
            connectReq.end();
        });
    }

    /**
     * Handle proxy response for both HTTP and HTTPS requests
     */
    handleProxyResponse(res, startTime, resolve, reject) {
        let data = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            const latency = Date.now() - startTime;
            
            // Check for proxy errors
            if (res.statusCode === 401 || res.statusCode === 407) {
                return resolve({
                    isProxyError: true,
                    error: 'Proxy authentication required',
                    statusCode: res.statusCode
                });
            }
            
            if (res.statusCode === 402) {
                return resolve({
                    isProxyError: true,
                    error: 'Proxy payment required',
                    statusCode: res.statusCode
                });
            }
            
            if (res.statusCode >= 500) {
                return resolve({
                    isProxyError: true,
                    error: `Proxy server error (${res.statusCode})`,
                    statusCode: res.statusCode
                });
            }
            
            // Check response content for payment messages
            if (data.toLowerCase().includes('payment required') ||
                data.toLowerCase().includes('upgrade your plan') ||
                data.toLowerCase().includes('subscription expired')) {
                return resolve({
                    isProxyError: true,
                    error: 'Proxy subscription/payment required',
                    statusCode: res.statusCode
                });
            }
            
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            // Extract IP from response
            let ip;
            try {
                const parsed = JSON.parse(data);
                ip = parsed.ip;
            } catch {
                ip = data.trim();
            }

            if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
                resolve({ ip, latency, isProxyError: false });
            } else {
                reject(new Error(`Invalid IP response: ${data.slice(0, 100)}`));
            }
        });
    }

    /**
     * Mark proxy as bad and update its status
     */
    markProxyAsBad(proxyLabel, reason = 'Failed validation', isPaymentRequired = false, isAuthRequired = false) {
        // Find proxy in loaded proxies and mark it
        for (const type of ['http', 'socks5']) {
            const proxy = this.loadedProxies[type].find(p => p.label === proxyLabel);
            if (proxy) {
                proxy.status = 'ERROR';
                proxy.errorReason = reason;
                proxy.isPaymentRequired = isPaymentRequired;
                proxy.isAuthRequired = isAuthRequired;
                proxy.lastResult = reason;
                proxy.lastChecked = new Date().toISOString();
                console.log(`🚫 Marked proxy ${proxyLabel} as bad: ${reason}`);
                return true;
            }
        }
        return false;
    }

    /**
     * Get statistics about proxy validation
     */
    getProxyStats() {
        const stats = {
            total: 0,
            working: 0,
            failed: 0,
            paymentRequired: 0,
            byType: { http: { total: 0, working: 0, failed: 0 }, socks5: { total: 0, working: 0, failed: 0 } }
        };

        for (const type of ['http', 'socks5']) {
            for (const proxy of this.loadedProxies[type]) {
                stats.total++;
                stats.byType[type].total++;
                
                if (proxy.status === 'OK') {
                    stats.working++;
                    stats.byType[type].working++;
                } else {
                    stats.failed++;
                    stats.byType[type].failed++;
                    
                    if (proxy.isPaymentRequired) {
                        stats.paymentRequired++;
                    }
                }
            }
        }

        return stats;
    }
}