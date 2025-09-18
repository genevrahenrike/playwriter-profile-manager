import { getNextBatchProxy } from '../simple-batch-proxy.js';

/**
 * Timezone-Aware Proxy Rotator for Batch Automation
 * Integrates with existing ProxyRotator interface but uses timezone-aware logic
 */
export class TimezoneAwareProxyRotator {
    constructor(proxyManager, options = {}) {
        this.proxyManager = proxyManager;
        this.options = options;
        this.batchIndex = 0;
        this.startTime = Date.now();
        
        console.log('🕐 Timezone-aware proxy rotation enabled');
        console.log('⚠️  Geographic and IP tracking disabled in favor of timezone logic');
    }

    /**
     * Get next proxy using timezone-aware cycling
     * Compatible with existing GeographicProxyRotator interface
     */
    async getNextProxy() {
        try {
            // Get proxy using timezone-aware logic
            const batchProxy = getNextBatchProxy(this.batchIndex, {
                showDetails: false // Keep quiet in batch mode
            });

            if (!batchProxy) {
                console.log('🛑 No more timezone-aware proxies available');
                return null;
            }

            // Convert to format expected by batch system
            const result = {
                proxy: {
                    label: `${batchProxy.country}-${this.batchIndex}`, // Create unique label
                    type: 'http',
                    host: batchProxy.proxy.host,
                    port: batchProxy.proxy.port,
                    username: batchProxy.proxy.username,
                    password: batchProxy.proxy.password,
                    country: batchProxy.country,
                    weight: batchProxy.weight,
                    timezoneOffset: batchProxy.proxy.timezoneOffset,
                    estimatedDelay: batchProxy.estimatedDelayMinutes
                },
                proxyConfig: {
                    server: `${batchProxy.proxy.host}:${batchProxy.proxy.port}`,
                    username: batchProxy.proxy.username,
                    password: batchProxy.proxy.password
                },
                region: batchProxy.country,
                batchIndex: this.batchIndex,
                timezoneInfo: {
                    hourOffset: batchProxy.hourOffset,
                    runInHour: batchProxy.runInHour,
                    weight: batchProxy.weight,
                    estimatedDelayMinutes: batchProxy.estimatedDelayMinutes
                }
            };

            // Increment for next call
            this.batchIndex++;

            // Log timezone-aware selection
            const currentTime = new Date();
            const proxyLocalTime = new Date(currentTime.getTime() + (batchProxy.proxy.timezoneOffset * 3600000));
            
            console.log(`🌍 Selected ${batchProxy.country} proxy (weight: ${batchProxy.weight.toFixed(2)}, local time: ${proxyLocalTime.toLocaleTimeString()})`);
            
            if (batchProxy.estimatedDelayMinutes > 0) {
                console.log(`⏰ Scheduled for ${batchProxy.estimatedDelayMinutes} minutes from batch start`);
            }

            return result;
        } catch (error) {
            console.error('❌ Timezone proxy selection error:', error.message);
            return null;
        }
    }

    /**
     * Get statistics (compatible with existing interface)
     */
    getStats() {
        const elapsed = Math.round((Date.now() - this.startTime) / 1000);
        
        return {
            rotatorType: 'timezone-aware',
            batchIndex: this.batchIndex,
            elapsedSeconds: elapsed,
            proxyCycle: Math.floor(this.batchIndex / 10), // Rough estimate
            totalRuns: this.batchIndex,
            message: `Timezone-aware rotation: ${this.batchIndex} runs in ${elapsed}s`
        };
    }

    /**
     * Reset batch (compatible with existing interface)  
     */
    resetBatch() {
        console.log('🔄 Resetting timezone-aware proxy rotator for new batch');
        this.batchIndex = 0;
        this.startTime = Date.now();
    }

    /**
     * Check if batch should continue (always true for timezone mode)
     */
    shouldContinueBatch() {
        return true; // Timezone mode can handle any batch size with proxy reuse
    }
}