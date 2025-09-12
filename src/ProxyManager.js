import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProxyManager {
    constructor(options = {}) {
        this.proxiesDir = options.proxiesDir || path.join(__dirname, '../proxies');
        this.httpProxiesFile = path.join(this.proxiesDir, 'http.proxies.json');
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
            // Load HTTP proxies
            if (await fs.pathExists(this.httpProxiesFile)) {
                const httpData = await fs.readJson(this.httpProxiesFile);
                this.loadedProxies.http = Array.isArray(httpData) ? httpData : [];
                console.log(`📡 Loaded ${this.loadedProxies.http.length} HTTP proxies`);
            }

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
     * Filter out proxies with ERROR status
     */
    filterWorkingProxies() {
        const httpWorking = this.loadedProxies.http.filter(proxy => proxy.status === 'OK');
        const socks5Working = this.loadedProxies.socks5.filter(proxy => proxy.status === 'OK');
        
        if (httpWorking.length < this.loadedProxies.http.length) {
            console.log(`🔍 Filtered HTTP proxies: ${httpWorking.length}/${this.loadedProxies.http.length} working`);
        }
        if (socks5Working.length < this.loadedProxies.socks5.length) {
            console.log(`🔍 Filtered SOCKS5 proxies: ${socks5Working.length}/${this.loadedProxies.socks5.length} working`);
        }

        this.loadedProxies.http = httpWorking;
        this.loadedProxies.socks5 = socks5Working;
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
            const found = this.loadedProxies[type]?.find(proxy => 
                proxy.label?.toLowerCase() === label.toLowerCase()
            );
            return found ? { ...found, type } : null;
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
    getRandomProxy(type = null) {
        let availableProxies = [];
        
        if (type && this.loadedProxies[type]) {
            availableProxies = this.loadedProxies[type].map(proxy => ({ ...proxy, type }));
        } else {
            // Get from all types
            availableProxies = [
                ...this.loadedProxies.http.map(proxy => ({ ...proxy, type: 'http' })),
                ...this.loadedProxies.socks5.map(proxy => ({ ...proxy, type: 'socks5' }))
            ];
        }

        if (availableProxies.length === 0) {
            return null;
        }

        const randomIndex = Math.floor(Math.random() * availableProxies.length);
        return availableProxies[randomIndex];
    }

    /**
     * Get next proxy in round-robin fashion
     */
    getNextProxy(type = null) {
        if (type && this.loadedProxies[type]) {
            const proxies = this.loadedProxies[type];
            if (proxies.length === 0) return null;
            
            this.lastProxyIndex[type] = (this.lastProxyIndex[type] + 1) % proxies.length;
            return { ...proxies[this.lastProxyIndex[type]], type };
        }

        // Round-robin across all types
        const allProxies = [
            ...this.loadedProxies.http.map(proxy => ({ ...proxy, type: 'http' })),
            ...this.loadedProxies.socks5.map(proxy => ({ ...proxy, type: 'socks5' }))
        ];

        if (allProxies.length === 0) return null;

        if (!this.lastGlobalIndex) this.lastGlobalIndex = -1;
        this.lastGlobalIndex = (this.lastGlobalIndex + 1) % allProxies.length;
        return allProxies[this.lastGlobalIndex];
    }

    /**
     * Get fastest proxy (lowest latency)
     */
    getFastestProxy(type = null) {
        let candidates = [];
        
        if (type && this.loadedProxies[type]) {
            candidates = this.loadedProxies[type].map(proxy => ({ ...proxy, type }));
        } else {
            candidates = [
                ...this.loadedProxies.http.map(proxy => ({ ...proxy, type: 'http' })),
                ...this.loadedProxies.socks5.map(proxy => ({ ...proxy, type: 'socks5' }))
            ];
        }

        if (candidates.length === 0) return null;

        // Filter out proxies without latency data
        const proxiesWithLatency = candidates.filter(proxy => 
            proxy.avgLatencyMs && proxy.avgLatencyMs > 0
        );

        if (proxiesWithLatency.length === 0) {
            // Fallback to random if no latency data
            return this.getRandomProxy(type);
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
        // Derive scheme; default to http if missing/unknown
        let scheme = 'http';
        if (proxy.type === 'socks5' || proxy.type === 'socks5h') scheme = 'socks5';
        else if (proxy.type === 'http' || proxy.type === 'https') scheme = 'http';
        else if (!proxy.type) {
            console.warn(`⚠️  Proxy '${proxy.label}' missing type, defaulting to http`);
        } else {
            console.warn(`⚠️  Unrecognized proxy type '${proxy.type}' for '${proxy.label}', defaulting to http`);
        }

        const config = { server: `${scheme}://${proxy.host}:${proxy.port}` };

        // Add authentication if available
        if (proxy.username || proxy.login) {
            config.username = proxy.username || proxy.login;
        }
        if (proxy.password) {
            config.password = proxy.password;
        }

        return config;
    }

    /**
     * Get proxy configuration for Playwright context
     */
    async getProxyConfig(selection = 'round-robin', type = null) {
        // Ensure proxies are loaded
        if (this.loadedProxies.http.length === 0 && this.loadedProxies.socks5.length === 0) {
            await this.loadProxies();
        }

        let selectedProxy = null;

        switch (selection) {
            case 'auto': // legacy alias
            case 'round-robin':
                selectedProxy = this.getNextProxy(type);
                break;
            case 'random':
                selectedProxy = this.getRandomProxy(type);
                break;
            case 'fastest':
                selectedProxy = this.getFastestProxy(type);
                break;
            default:
                // Assume it's a label/name
                selectedProxy = this.getProxyByLabel(selection, type);
                break;
        }

        if (!selectedProxy) {
            console.warn(`⚠️  No proxy found for selection: ${selection} (type: ${type || 'any'})`);
            return null;
        }

        const config = this.toPlaywrightProxy(selectedProxy);
    console.log(`🌐 Selected proxy: ${selectedProxy.label} (${selectedProxy.type || 'auto-detected'}) - ${selectedProxy.host}:${selectedProxy.port}`);
        
        if (selectedProxy.avgLatencyMs) {
            console.log(`   📊 Average latency: ${selectedProxy.avgLatencyMs}ms`);
        }

        return config;
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
}