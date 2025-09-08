import fs from 'fs-extra';
import path from 'path';

export class FingerprintTester {
    constructor() {
        this.testSites = [
            'https://mixvisit.com',
            'https://iphey.com',
            'https://amiunique.org/fp',
            'https://coveryourtracks.eff.org/',
            'https://browserleaks.com/webgl',
            'https://audiofingerprint.openwpm.com/',
            'https://webbrowsertools.com'
        ];
    }

    /**
     * Test browser fingerprint using MixVisit library
     * @param {Object} page - Playwright page object
     * @returns {Object} Fingerprint results
     */
    async testWithMixVisit(page) {
        try {
            console.log('🔍 Testing fingerprint with MixVisit...');
            
            // Navigate to a test page
            await page.goto('data:text/html,<html><body><h1>Fingerprint Test</h1></body></html>');
            
            // Inject MixVisit library and run fingerprint test
            const fingerprintResult = await page.evaluate(async () => {
                // Import MixVisit dynamically
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/@mix-visit/lite@latest/dist/index.umd.js';
                document.head.appendChild(script);
                
                return new Promise((resolve) => {
                    script.onload = async () => {
                        try {
                            const { MixVisit } = window.MixVisitLite;
                            const mixvisit = new MixVisit();
                            await mixvisit.load();
                            
                            resolve({
                                loadTime: mixvisit.loadTime,
                                fingerprintHash: mixvisit.fingerprintHash,
                                results: mixvisit.get()
                            });
                        } catch (error) {
                            resolve({ error: error.message });
                        }
                    };
                    
                    script.onerror = () => {
                        resolve({ error: 'Failed to load MixVisit library' });
                    };
                });
            });
            
            return fingerprintResult;
        } catch (error) {
            console.error('Error testing fingerprint:', error);
            return { error: error.message };
        }
    }

    /**
     * Test browser fingerprint on multiple sites
     * @param {Object} page - Playwright page object
     * @param {Array} sites - Array of sites to test (optional)
     * @returns {Object} Test results from multiple sites
     */
    async testMultipleSites(page, sites = this.testSites.slice(0, 3)) {
        const results = {};
        
        console.log(`🌐 Testing fingerprint on ${sites.length} sites...`);
        
        for (const site of sites) {
            try {
                console.log(`   Testing: ${site}`);
                await page.goto(site, { waitUntil: 'networkidle' });
                
                // Wait a bit for the site to load and analyze
                await page.waitForTimeout(3000);
                
                // Capture basic information
                const siteResult = await page.evaluate(() => {
                    return {
                        userAgent: navigator.userAgent,
                        languages: navigator.languages,
                        platform: navigator.platform,
                        hardwareConcurrency: navigator.hardwareConcurrency,
                        deviceMemory: navigator.deviceMemory,
                        screen: {
                            width: screen.width,
                            height: screen.height,
                            colorDepth: screen.colorDepth,
                            pixelDepth: screen.pixelDepth
                        },
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        webgl: (() => {
                            try {
                                const canvas = document.createElement('canvas');
                                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                                if (!gl) return null;
                                
                                return {
                                    vendor: gl.getParameter(gl.VENDOR),
                                    renderer: gl.getParameter(gl.RENDERER),
                                    version: gl.getParameter(gl.VERSION),
                                    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
                                };
                            } catch (e) {
                                return { error: e.message };
                            }
                        })(),
                        canvas: (() => {
                            try {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                ctx.textBaseline = 'top';
                                ctx.font = '14px Arial';
                                ctx.fillText('Fingerprint test 123', 2, 2);
                                return canvas.toDataURL().substring(0, 50);
                            } catch (e) {
                                return { error: e.message };
                            }
                        })(),
                        audio: (() => {
                            try {
                                if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
                                    return { disabled: true };
                                }
                                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                                const audioCtx = new AudioCtx();
                                return {
                                    sampleRate: audioCtx.sampleRate,
                                    state: audioCtx.state,
                                    maxChannelCount: audioCtx.destination.maxChannelCount
                                };
                            } catch (e) {
                                return { error: e.message };
                            }
                        })()
                    };
                });
                
                results[site] = {
                    success: true,
                    data: siteResult,
                    timestamp: new Date().toISOString()
                };
                
            } catch (error) {
                console.error(`   Error testing ${site}:`, error.message);
                results[site] = {
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
            }
        }
        
        return results;
    }

    /**
     * Run comprehensive fingerprint test
     * @param {Object} page - Playwright page object
     * @param {Object} options - Test options
     * @returns {Object} Comprehensive test results
     */
    async runComprehensiveTest(page, options = {}) {
        const {
            includeMixVisit = true,
            includeMultipleSites = true,
            sitesToTest = 2,
            saveResults = false,
            outputPath = './fingerprint-test-results.json'
        } = options;
        
        console.log('🧪 Running comprehensive fingerprint test...');
        
        const testResults = {
            timestamp: new Date().toISOString(),
            userAgent: await page.evaluate(() => navigator.userAgent),
            tests: {}
        };
        
        // Test with MixVisit
        if (includeMixVisit) {
            testResults.tests.mixvisit = await this.testWithMixVisit(page);
        }
        
        // Test on multiple sites
        if (includeMultipleSites) {
            const sitesToUse = this.testSites.slice(0, sitesToTest);
            testResults.tests.multipleSites = await this.testMultipleSites(page, sitesToUse);
        }
        
        // Custom fingerprint analysis
        testResults.tests.custom = await this.runCustomTests(page);
        
        // Save results if requested
        if (saveResults) {
            await this.saveResults(testResults, outputPath);
            console.log(`📁 Results saved to: ${outputPath}`);
        }
        
        return testResults;
    }

    /**
     * Run custom fingerprint tests
     * @param {Object} page - Playwright page object
     * @returns {Object} Custom test results
     */
    async runCustomTests(page) {
        console.log('🔬 Running custom fingerprint tests...');
        
        return await page.evaluate(() => {
            const tests = {};
            
            // Test 1: Navigator properties
            tests.navigator = {
                userAgent: navigator.userAgent,
                language: navigator.language,
                languages: navigator.languages,
                platform: navigator.platform,
                cookieEnabled: navigator.cookieEnabled,
                doNotTrack: navigator.doNotTrack,
                hardwareConcurrency: navigator.hardwareConcurrency,
                maxTouchPoints: navigator.maxTouchPoints,
                deviceMemory: navigator.deviceMemory,
                webdriver: navigator.webdriver,
                plugins: Array.from(navigator.plugins).map(p => ({
                    name: p.name,
                    description: p.description,
                    filename: p.filename
                }))
            };
            
            // Test 2: Screen properties
            tests.screen = {
                width: screen.width,
                height: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth,
                orientation: screen.orientation ? screen.orientation.type : null
            };
            
            // Test 3: Timezone and locale
            tests.locale = {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                locale: Intl.DateTimeFormat().resolvedOptions().locale,
                dateTimeFormat: new Date().toLocaleString(),
                numberFormat: (1234.5).toLocaleString()
            };
            
            // Test 4: WebGL fingerprinting
            tests.webgl = (() => {
                try {
                    const canvas = document.createElement('canvas');
                    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                    if (!gl) return { error: 'WebGL not supported' };
                    
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    
                    return {
                        vendor: gl.getParameter(gl.VENDOR),
                        renderer: gl.getParameter(gl.RENDERER),
                        version: gl.getParameter(gl.VERSION),
                        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                        unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
                        unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
                        extensions: gl.getSupportedExtensions(),
                        parameters: {
                            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                            maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
                            maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                            maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
                            maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
                            maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS)
                        }
                    };
                } catch (e) {
                    return { error: e.message };
                }
            })();
            
            // Test 5: Canvas fingerprinting
            tests.canvas = (() => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Draw text
                    ctx.textBaseline = 'top';
                    ctx.font = '14px Arial';
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                    ctx.fillRect(0, 0, 100, 50);
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
                    ctx.fillRect(50, 25, 100, 50);
                    ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
                    ctx.fillRect(25, 12, 100, 50);
                    ctx.fillStyle = 'black';
                    ctx.fillText('Canvas fingerprint test 🎨', 2, 2);
                    
                    // Draw some shapes
                    ctx.beginPath();
                    ctx.arc(75, 75, 50, 0, 2 * Math.PI);
                    ctx.stroke();
                    
                    return {
                        dataURL: canvas.toDataURL(),
                        hash: canvas.toDataURL().slice(-50) // Last 50 characters as a simple hash
                    };
                } catch (e) {
                    return { error: e.message };
                }
            })();
            
            // Test 6: Audio fingerprinting
            tests.audio = (() => {
                try {
                    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
                        return { disabled: true };
                    }
                    
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    const audioCtx = new AudioCtx();
                    
                    return {
                        sampleRate: audioCtx.sampleRate,
                        state: audioCtx.state,
                        baseLatency: audioCtx.baseLatency,
                        outputLatency: audioCtx.outputLatency,
                        destination: {
                            maxChannelCount: audioCtx.destination.maxChannelCount,
                            numberOfInputs: audioCtx.destination.numberOfInputs,
                            numberOfOutputs: audioCtx.destination.numberOfOutputs
                        }
                    };
                } catch (e) {
                    return { error: e.message };
                }
            })();
            
            // Test 7: Performance and memory
            tests.performance = {
                memory: window.performance && window.performance.memory ? {
                    jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit,
                    totalJSHeapSize: window.performance.memory.totalJSHeapSize,
                    usedJSHeapSize: window.performance.memory.usedJSHeapSize
                } : null,
                timing: window.performance && window.performance.timing ? {
                    navigationStart: window.performance.timing.navigationStart,
                    domContentLoadedEventStart: window.performance.timing.domContentLoadedEventStart,
                    loadEventStart: window.performance.timing.loadEventStart
                } : null
            };
            
            // Test 8: Battery API (if available)
            tests.battery = (() => {
                if (!navigator.getBattery) return { notSupported: true };
                
                return navigator.getBattery().then(battery => ({
                    charging: battery.charging,
                    chargingTime: battery.chargingTime,
                    dischargingTime: battery.dischargingTime,
                    level: battery.level
                })).catch(e => ({ error: e.message }));
            })();
            
            return tests;
        });
    }

    /**
     * Compare fingerprint results
     * @param {Object} results1 - First fingerprint results
     * @param {Object} results2 - Second fingerprint results
     * @returns {Object} Comparison results
     */
    compareResults(results1, results2) {
        const comparison = {
            timestamp: new Date().toISOString(),
            differences: [],
            similarities: [],
            score: 0 // 0-100, higher means more similar
        };
        
        // Compare basic properties
        const props = ['userAgent', 'languages', 'platform', 'hardwareConcurrency', 'deviceMemory'];
        let matches = 0;
        
        for (const prop of props) {
            const val1 = this.getNestedValue(results1, prop);
            const val2 = this.getNestedValue(results2, prop);
            
            if (JSON.stringify(val1) === JSON.stringify(val2)) {
                matches++;
                comparison.similarities.push(prop);
            } else {
                comparison.differences.push({
                    property: prop,
                    value1: val1,
                    value2: val2
                });
            }
        }
        
        comparison.score = Math.round((matches / props.length) * 100);
        
        return comparison;
    }

    /**
     * Get nested value from object
     * @param {Object} obj - Object to search
     * @param {string} path - Dot-separated path
     * @returns {*} Value at path
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    /**
     * Save test results to file
     * @param {Object} results - Test results
     * @param {string} filePath - File path to save
     */
    async saveResults(results, filePath) {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, results, { spaces: 2 });
    }

    /**
     * Load test results from file
     * @param {string} filePath - File path to load
     * @returns {Object} Test results
     */
    async loadResults(filePath) {
        if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
        }
        throw new Error(`Results file not found: ${filePath}`);
    }

    /**
     * Generate a summary report of fingerprint test results
     * @param {Object} results - Test results
     * @returns {string} Summary report
     */
    generateSummaryReport(results) {
        let report = '\n🔍 FINGERPRINT TEST SUMMARY\n';
        report += '=' .repeat(50) + '\n\n';
        
        report += `📅 Test Date: ${results.timestamp}\n`;
        report += `🌐 User Agent: ${results.userAgent}\n\n`;
        
        if (results.tests.mixvisit) {
            report += '🎯 MixVisit Results:\n';
            if (results.tests.mixvisit.error) {
                report += `   ❌ Error: ${results.tests.mixvisit.error}\n`;
            } else {
                report += `   ⚡ Load Time: ${results.tests.mixvisit.loadTime}ms\n`;
                report += `   🔐 Fingerprint Hash: ${results.tests.mixvisit.fingerprintHash}\n`;
            }
            report += '\n';
        }
        
        if (results.tests.custom) {
            report += '🔬 Custom Tests:\n';
            
            if (results.tests.custom.webgl && !results.tests.custom.webgl.error) {
                report += `   🎮 WebGL Vendor: ${results.tests.custom.webgl.vendor}\n`;
                report += `   🎮 WebGL Renderer: ${results.tests.custom.webgl.renderer}\n`;
            }
            
            if (results.tests.custom.canvas && !results.tests.custom.canvas.error) {
                report += `   🎨 Canvas Hash: ${results.tests.custom.canvas.hash}\n`;
            }
            
            if (results.tests.custom.audio && !results.tests.custom.audio.error && !results.tests.custom.audio.disabled) {
                report += `   🔊 Audio Sample Rate: ${results.tests.custom.audio.sampleRate}Hz\n`;
            } else if (results.tests.custom.audio && results.tests.custom.audio.disabled) {
                report += `   🔊 Audio: Disabled (Good for privacy)\n`;
            }
            
            report += '\n';
        }
        
        if (results.tests.multipleSites) {
            report += '🌐 Multi-Site Test Results:\n';
            Object.entries(results.tests.multipleSites).forEach(([site, result]) => {
                if (result.success) {
                    report += `   ✅ ${site}: Success\n`;
                } else {
                    report += `   ❌ ${site}: ${result.error}\n`;
                }
            });
        }
        
        return report;
    }
}

    /**
     * Run comprehensive authenticity test with bot detection
     * @param {Object} page - Playwright page object
     * @param {Object} options - Test options
     * @returns {Object} Comprehensive authenticity results
     */
    async runAuthenticityTest(page, options = {}) {
        const {
            includeFingerprint = true,
            includeBotDetection = true,
            includeAPIs = false,
            apiKeys = {},
            saveResults = false,
            outputPath = './authenticity-test-results.json'
        } = options;

        console.log('🔍 Running comprehensive authenticity test...');
        
        const results = {
            timestamp: new Date().toISOString(),
            userAgent: await page.evaluate(() => navigator.userAgent),
            tests: {},
            scores: {},
            overallAuthenticity: 'unknown',
            recommendations: []
        };

        // 1. Traditional fingerprint test
        if (includeFingerprint) {
            console.log('  📊 Running fingerprint analysis...');
            results.tests.fingerprint = await this.testWithMixVisit(page);
            results.tests.customFingerprint = await this.runCustomTests(page);
        }

        // 2. Bot detection tests
        if (includeBotDetection) {
            console.log('  🤖 Running bot detection tests...');
            
            // Import and use BotDetectionService
            const { BotDetectionService } = await import('./BotDetectionService.js');
            const botDetector = new BotDetectionService();
            
            results.tests.botDetection = await botDetector.runBotDetectionTests(page, {
                includeClientSide: true,
                includeAPIs: includeAPIs,
                includeSiteTests: false, // Skip for performance
                apiKeys: apiKeys
            });
            
            results.scores.botDetection = results.tests.botDetection.overallScore;
        }

        // 3. Calculate combined authenticity score
        results.scores.combined = this.calculateCombinedAuthenticityScore(results.tests);
        results.overallAuthenticity = this.getOverallAuthenticityRating(results.scores.combined);
        
        // 4. Generate comprehensive recommendations
        results.recommendations = this.generateAuthenticityRecommendations(results.tests, results.scores);

        // 5. Save results if requested
        if (saveResults) {
            await this.saveResults(results, outputPath);
            console.log(`📁 Authenticity results saved to: ${outputPath}`);
        }

        return results;
    }

    /**
     * Calculate combined authenticity score from all tests
     * @param {Object} tests - All test results
     * @returns {number} Combined score 0-100
     */
    calculateCombinedAuthenticityScore(tests) {
        const scores = [];
        const weights = [];

        // Bot detection score (high weight)
        if (tests.botDetection?.overallScore !== undefined) {
            scores.push(tests.botDetection.overallScore);
            weights.push(0.6); // 60% weight
        }

        // Fingerprint consistency score (medium weight)
        if (tests.customFingerprint) {
            let fingerprintScore = 70; // Base score
            
            // Check for inconsistencies that indicate bot behavior
            const fp = tests.customFingerprint;
            
            // WebGL consistency
            if (fp.webgl?.error) fingerprintScore -= 10;
            
            // Canvas consistency  
            if (fp.canvas?.error) fingerprintScore -= 5;
            
            // Navigator consistency
            if (fp.navigator) {
                if (!fp.navigator.languages || fp.navigator.languages.length === 0) fingerprintScore -= 15;
                if (fp.navigator.plugins?.length === 0) fingerprintScore -= 10;
                if (fp.navigator.webdriver === true) fingerprintScore -= 30;
            }
            
            // Screen consistency
            if (fp.screen) {
                if (fp.screen.width === 1024 && fp.screen.height === 768) fingerprintScore -= 10; // Common headless
            }
            
            scores.push(Math.max(0, fingerprintScore));
            weights.push(0.3); // 30% weight
        }

        // MixVisit score (low weight, if available)
        if (tests.fingerprint && !tests.fingerprint.error) {
            scores.push(60); // Neutral score for having fingerprint data
            weights.push(0.1); // 10% weight
        }

        if (scores.length === 0) return 50; // Neutral if no scores

        // Calculate weighted average
        const weightedSum = scores.reduce((sum, score, i) => sum + score * weights[i], 0);
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        
        return Math.round(weightedSum / totalWeight);
    }

    /**
     * Get overall authenticity rating
     * @param {number} score - Combined score 0-100
     * @returns {string} Authenticity rating
     */
    getOverallAuthenticityRating(score) {
        if (score >= 85) return 'highly_authentic';
        if (score >= 70) return 'likely_authentic';
        if (score >= 50) return 'uncertain';
        if (score >= 30) return 'likely_bot';
        return 'highly_suspicious';
    }

    /**
     * Generate authenticity recommendations
     * @param {Object} tests - All test results
     * @param {Object} scores - All scores
     * @returns {Array} Recommendations
     */
    generateAuthenticityRecommendations(tests, scores) {
        const recommendations = [];

        // Bot detection recommendations
        if (tests.botDetection?.recommendations) {
            recommendations.push(...tests.botDetection.recommendations);
        }

        // Fingerprint-based recommendations
        if (tests.customFingerprint) {
            const fp = tests.customFingerprint;
            
            if (fp.navigator?.webdriver === true) {
                recommendations.push('🚨 CRITICAL: WebDriver property detected - major bot indicator');
            }
            
            if (fp.navigator?.plugins?.length === 0) {
                recommendations.push('Consider enabling some browser plugins for authenticity');
            }
            
            if (fp.screen?.width === 1024 && fp.screen?.height === 768) {
                recommendations.push('Screen size matches common headless browser dimensions');
            }
            
            if (fp.webgl?.error || fp.canvas?.error) {
                recommendations.push('Graphics rendering issues detected - may indicate virtualized environment');
            }
        }

        // Overall score recommendations
        if (scores.combined >= 85) {
            recommendations.push('✅ Excellent authenticity score - profile appears very human-like');
        } else if (scores.combined >= 70) {
            recommendations.push('✅ Good authenticity score - minor improvements possible');
        } else if (scores.combined >= 50) {
            recommendations.push('⚠️ Moderate authenticity - consider adjusting stealth settings');
        } else {
            recommendations.push('🚨 Low authenticity score - significant stealth improvements needed');
        }

        return [...new Set(recommendations)]; // Remove duplicates
    }

    /**
     * Generate comprehensive authenticity report
     * @param {Object} results - Authenticity test results
     * @returns {string} Detailed report
     */
    generateAuthenticityReport(results) {
        let report = '\n🔍 COMPREHENSIVE AUTHENTICITY ANALYSIS\n';
        report += '=' .repeat(60) + '\n\n';
        
        report += `📅 Test Date: ${results.timestamp}\n`;
        report += `🌐 User Agent: ${results.userAgent}\n\n`;
        
        // Overall scores
        report += '📊 AUTHENTICITY SCORES:\n';
        report += `   Combined Score: ${results.scores.combined}/100\n`;
        if (results.scores.botDetection) {
            report += `   Bot Detection: ${results.scores.botDetection}/100\n`;
        }
        report += `   Overall Rating: ${results.overallAuthenticity.replace('_', ' ').toUpperCase()}\n\n`;
        
        // Bot detection details
        if (results.tests.botDetection) {
            report += '🤖 BOT DETECTION ANALYSIS:\n';
            const bd = results.tests.botDetection;
            
            if (bd.tests.clientSide?.botd) {
                report += `   FingerprintJS BotD: ${bd.tests.clientSide.botd.bot ? '❌ BOT' : '✅ HUMAN'}\n`;
            }
            
            if (bd.tests.clientSide?.customChecks) {
                const cc = bd.tests.clientSide.customChecks;
                report += `   WebDriver Detection: ${cc.webdriver?.present ? '❌ DETECTED' : '✅ CLEAN'}\n`;
                report += `   Automation Flags: ${cc.automation?.score < 0.5 ? '❌ DETECTED' : '✅ CLEAN'}\n`;
                report += `   Plugin Count: ${cc.plugins?.count || 0}\n`;
                report += `   Screen Size: ${cc.screen?.width}x${cc.screen?.height}${cc.screen?.suspicious ? ' (suspicious)' : ''}\n`;
            }
            report += '\n';
        }
        
        // Fingerprint analysis
        if (results.tests.customFingerprint) {
            report += '🔬 FINGERPRINT ANALYSIS:\n';
            const fp = results.tests.customFingerprint;
            
            report += `   WebGL: ${fp.webgl?.error ? '❌ ERROR' : '✅ OK'}\n`;
            report += `   Canvas: ${fp.canvas?.error ? '❌ ERROR' : '✅ OK'}\n`;
            report += `   Audio: ${fp.audio?.error ? '❌ ERROR' : fp.audio?.disabled ? '⚠️ DISABLED' : '✅ OK'}\n`;
            report += `   Languages: ${fp.navigator?.languages?.length || 0} configured\n`;
            report += `   Timezone: ${fp.locale?.timezone || 'unknown'}\n`;
            report += '\n';
        }
        
        // Recommendations
        if (results.recommendations.length > 0) {
            report += '💡 RECOMMENDATIONS:\n';
            results.recommendations.forEach(rec => {
                report += `   • ${rec}\n`;
            });
            report += '\n';
        }
        
        // Risk assessment
        report += '🎯 RISK ASSESSMENT:\n';
        const risk = results.scores.combined;
        if (risk >= 85) {
            report += '   🟢 LOW RISK - Profile appears authentic and human-like\n';
        } else if (risk >= 70) {
            report += '   🟡 MEDIUM RISK - Some minor bot indicators present\n';
        } else if (risk >= 50) {
            report += '   🟠 HIGH RISK - Multiple bot indicators detected\n';
        } else {
            report += '   🔴 CRITICAL RISK - Strong bot signatures present\n';
        }
        
        return report;
    }
