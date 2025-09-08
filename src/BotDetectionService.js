import fs from 'fs-extra';
import path from 'path';

export class BotDetectionService {
    constructor() {
        this.services = {
            // Free/Open source services
            botd: {
                name: 'FingerprintJS BotD',
                type: 'client',
                enabled: true,
                url: 'https://cdn.jsdelivr.net/npm/@fingerprintjs/botd@latest/dist/botd.min.js'
            },
            
            // Client-side detection libraries
            botChecker: {
                name: 'BotChecker',
                type: 'client',
                enabled: true,
                script: this.getBotCheckerScript()
            },
            
            // API-based services (require API keys)
            overpoweredjs: {
                name: 'OverpoweredJS API',
                type: 'api',
                enabled: false, // Enable when API key is provided
                endpoint: 'https://api.overpoweredjs.com/fingerprint',
                providesScore: true
            },
            
            ipqualityscore: {
                name: 'IPQualityScore',
                type: 'api', 
                enabled: false,
                endpoint: 'https://ipqualityscore.com/api/json/device-fingerprint',
                providesScore: true
            }
        };
        
        this.testSites = [
            'https://mixvisit.com',
            'https://iphey.com', 
            'https://amiunique.org/fp',
            'https://coveryourtracks.eff.org/',
            'https://browserleaks.com/webgl',
            'https://audiofingerprint.openwpm.com/'
        ];
    }

    /**
     * Run comprehensive bot detection tests
     * @param {Object} page - Playwright page object
     * @param {Object} options - Test options
     * @returns {Object} Bot detection results with trust scores
     */
    async runBotDetectionTests(page, options = {}) {
        const {
            includeClientSide = true,
            includeAPIs = false,
            includeSiteTests = true,
            apiKeys = {}
        } = options;

        console.log('🤖 Running comprehensive bot detection tests...');
        
        const results = {
            timestamp: new Date().toISOString(),
            userAgent: await page.evaluate(() => navigator.userAgent),
            tests: {},
            overallScore: null,
            authenticity: 'unknown',
            recommendations: []
        };

        // 1. Client-side bot detection
        if (includeClientSide) {
            results.tests.clientSide = await this.runClientSideDetection(page);
        }

        // 2. API-based detection (if API keys provided)
        if (includeAPIs && Object.keys(apiKeys).length > 0) {
            results.tests.apiServices = await this.runAPIDetection(page, apiKeys);
        }

        // 3. Site-based testing
        if (includeSiteTests) {
            results.tests.siteTests = await this.runSiteTests(page);
        }

        // 4. Calculate overall authenticity score
        results.overallScore = this.calculateOverallScore(results.tests);
        results.authenticity = this.getAuthenticityRating(results.overallScore);
        results.recommendations = this.generateRecommendations(results.tests, results.overallScore);

        return results;
    }

    /**
     * Run client-side bot detection tests
     * @param {Object} page - Playwright page object
     * @returns {Object} Client-side test results
     */
    async runClientSideDetection(page) {
        console.log('  🔍 Running client-side detection...');
        
        return await page.evaluate(async () => {
            const results = {
                botd: null,
                botChecker: null,
                customChecks: null
            };

            // 1. FingerprintJS BotD
            try {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@fingerprintjs/botd@latest/dist/botd.min.js';
                document.head.appendChild(script);
                
                await new Promise((resolve) => {
                    script.onload = resolve;
                    script.onerror = resolve;
                });

                if (window.BotD) {
                    const botd = await window.BotD.load();
                    const botResult = await botd.detect();
                    results.botd = {
                        bot: botResult.bot,
                        components: botResult.components,
                        score: botResult.bot ? 0.1 : 0.9 // Convert boolean to score
                    };
                }
            } catch (error) {
                results.botd = { error: error.message };
            }

            // 2. Custom bot detection checks
            results.customChecks = {
                // WebDriver detection
                webdriver: {
                    present: navigator.webdriver === true,
                    score: navigator.webdriver === true ? 0.1 : 0.9
                },
                
                // Automation flags
                automation: {
                    chromeRuntime: window.chrome && window.chrome.runtime,
                    phantomJS: window._phantom || window.phantom,
                    nightmare: window.__nightmare,
                    selenium: window._selenium || document.$cdc_asdjflasutopfhvcZLmcfl_,
                    score: 0.9
                },
                
                // Plugin consistency
                plugins: {
                    count: navigator.plugins.length,
                    suspicious: navigator.plugins.length === 0 || navigator.plugins.length > 50,
                    score: navigator.plugins.length === 0 ? 0.3 : 0.8
                },
                
                // Language consistency
                languages: {
                    count: navigator.languages.length,
                    consistent: navigator.language === navigator.languages[0],
                    score: navigator.languages.length === 0 ? 0.2 : 0.8
                },
                
                // Screen consistency
                screen: {
                    width: screen.width,
                    height: screen.height,
                    suspicious: screen.width === 1024 && screen.height === 768, // Common headless size
                    score: (screen.width === 1024 && screen.height === 768) ? 0.4 : 0.8
                },
                
                // Timing attacks
                performance: {
                    now: performance.now(),
                    timing: performance.timing ? performance.timing.loadEventEnd - performance.timing.navigationStart : null,
                    score: 0.7 // Neutral for now
                }
            };

            // Calculate automation score
            const automationFlags = [
                results.customChecks.automation.chromeRuntime,
                results.customChecks.automation.phantomJS,
                results.customChecks.automation.nightmare,
                results.customChecks.automation.selenium
            ].filter(Boolean).length;
            
            results.customChecks.automation.score = automationFlags > 0 ? 0.1 : 0.9;

            return results;
        });
    }

    /**
     * Run API-based bot detection
     * @param {Object} page - Playwright page object
     * @param {Object} apiKeys - API keys for services
     * @returns {Object} API test results
     */
    async runAPIDetection(page, apiKeys) {
        console.log('  🌐 Running API-based detection...');
        
        const results = {};
        
        // Get fingerprint data to send to APIs
        const fingerprintData = await page.evaluate(() => ({
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            hardwareConcurrency: navigator.hardwareConcurrency,
            maxTouchPoints: navigator.maxTouchPoints,
            deviceMemory: navigator.deviceMemory,
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }));

        // OverpoweredJS API (if API key provided)
        if (apiKeys.overpoweredjs) {
            try {
                const response = await fetch('https://api.overpoweredjs.com/fingerprint', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKeys.overpoweredjs}`
                    },
                    body: JSON.stringify(fingerprintData)
                });
                
                if (response.ok) {
                    results.overpoweredjs = await response.json();
                } else {
                    results.overpoweredjs = { error: `API error: ${response.status}` };
                }
            } catch (error) {
                results.overpoweredjs = { error: error.message };
            }
        }

        return results;
    }

    /**
     * Test fingerprinting sites for authenticity feedback
     * @param {Object} page - Playwright page object
     * @returns {Object} Site test results
     */
    async runSiteTests(page) {
        console.log('  🌐 Testing fingerprinting sites...');
        
        const results = {};
        
        // Test a few key sites
        const sitesToTest = this.testSites.slice(0, 2); // Limit for performance
        
        for (const site of sitesToTest) {
            try {
                console.log(`    Testing: ${site}`);
                await page.goto(site, { waitUntil: 'networkidle', timeout: 10000 });
                await page.waitForTimeout(3000);
                
                // Try to extract any bot/trust indicators from the site
                const siteResult = await page.evaluate((siteName) => {
                    const result = {
                        site: siteName,
                        title: document.title,
                        timestamp: new Date().toISOString()
                    };
                    
                    // Look for common bot detection indicators
                    const indicators = [
                        'bot', 'robot', 'automated', 'suspicious', 'trust', 'score', 
                        'authentic', 'human', 'detection', 'risk', 'fraud'
                    ];
                    
                    const pageText = document.body.textContent.toLowerCase();
                    result.indicators = indicators.filter(indicator => 
                        pageText.includes(indicator)
                    );
                    
                    // Try to find numeric scores or ratings
                    const scorePatterns = [
                        /score[:\s]*(\d+(?:\.\d+)?)/gi,
                        /trust[:\s]*(\d+(?:\.\d+)?)/gi,
                        /risk[:\s]*(\d+(?:\.\d+)?)/gi,
                        /(\d+(?:\.\d+)?)%/gi
                    ];
                    
                    result.possibleScores = [];
                    scorePatterns.forEach(pattern => {
                        const matches = pageText.match(pattern);
                        if (matches) {
                            result.possibleScores.push(...matches);
                        }
                    });
                    
                    return result;
                }, site);
                
                results[site] = siteResult;
                
            } catch (error) {
                results[site] = { error: error.message };
            }
        }
        
        return results;
    }

    /**
     * Calculate overall authenticity score
     * @param {Object} tests - All test results
     * @returns {number} Score from 0-100 (100 = most authentic)
     */
    calculateOverallScore(tests) {
        const scores = [];
        
        // Client-side scores
        if (tests.clientSide) {
            if (tests.clientSide.botd && tests.clientSide.botd.score !== undefined) {
                scores.push(tests.clientSide.botd.score * 100);
            }
            
            if (tests.clientSide.customChecks) {
                const customScores = Object.values(tests.clientSide.customChecks)
                    .filter(check => check.score !== undefined)
                    .map(check => check.score * 100);
                scores.push(...customScores);
            }
        }
        
        // API scores
        if (tests.apiServices) {
            Object.values(tests.apiServices).forEach(apiResult => {
                if (apiResult.botScore !== undefined) {
                    // Convert bot score to authenticity score (invert)
                    scores.push((5 - apiResult.botScore) * 20); // 1-5 scale to 0-100
                }
                if (apiResult.trustScore !== undefined) {
                    scores.push(apiResult.trustScore);
                }
            });
        }
        
        // If no scores available, return neutral
        if (scores.length === 0) return 50;
        
        // Calculate weighted average
        return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }

    /**
     * Get authenticity rating based on score
     * @param {number} score - Overall score 0-100
     * @returns {string} Authenticity rating
     */
    getAuthenticityRating(score) {
        if (score >= 80) return 'highly_authentic';
        if (score >= 60) return 'likely_authentic';
        if (score >= 40) return 'uncertain';
        if (score >= 20) return 'likely_bot';
        return 'highly_suspicious';
    }

    /**
     * Generate recommendations based on test results
     * @param {Object} tests - Test results
     * @param {number} score - Overall score
     * @returns {Array} Array of recommendation strings
     */
    generateRecommendations(tests, score) {
        const recommendations = [];
        
        if (score < 60) {
            recommendations.push('Consider using a more conservative stealth preset');
        }
        
        if (tests.clientSide?.customChecks?.webdriver?.present) {
            recommendations.push('WebDriver property detected - this is a major bot indicator');
        }
        
        if (tests.clientSide?.customChecks?.plugins?.count === 0) {
            recommendations.push('No browser plugins detected - consider allowing some plugins');
        }
        
        if (tests.clientSide?.customChecks?.screen?.suspicious) {
            recommendations.push('Screen size appears suspicious - consider using real screen dimensions');
        }
        
        if (tests.clientSide?.customChecks?.automation?.score < 0.5) {
            recommendations.push('Automation tools detected - stealth configuration may need improvement');
        }
        
        if (score >= 80) {
            recommendations.push('Fingerprint appears highly authentic - good stealth configuration');
        }
        
        return recommendations;
    }

    /**
     * Get BotChecker script (simple client-side bot detection)
     * @returns {string} BotChecker JavaScript code
     */
    getBotCheckerScript() {
        return `
        function botChecker() {
            let score = 1.0;
            const checks = {};
            
            // Check for webdriver
            checks.webdriver = navigator.webdriver === undefined;
            if (!checks.webdriver) score -= 0.3;
            
            // Check for common automation properties
            checks.automation = !window._phantom && !window.phantom && !window.__nightmare;
            if (!checks.automation) score -= 0.4;
            
            // Check plugins
            checks.plugins = navigator.plugins.length > 0;
            if (!checks.plugins) score -= 0.2;
            
            // Check languages
            checks.languages = navigator.languages.length > 0;
            if (!checks.languages) score -= 0.1;
            
            return {
                score: Math.max(0, score),
                checks: checks,
                isBot: score < 0.5
            };
        }
        `;
    }

    /**
     * Save bot detection results
     * @param {Object} results - Detection results
     * @param {string} filePath - File path to save
     */
    async saveResults(results, filePath) {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, results, { spaces: 2 });
    }

    /**
     * Generate summary report
     * @param {Object} results - Detection results
     * @returns {string} Summary report
     */
    generateSummaryReport(results) {
        let report = '\n🤖 BOT DETECTION SUMMARY\n';
        report += '=' .repeat(50) + '\n\n';
        
        report += `📅 Test Date: ${results.timestamp}\n`;
        report += `🌐 User Agent: ${results.userAgent}\n`;
        report += `📊 Overall Score: ${results.overallScore}/100\n`;
        report += `🎯 Authenticity: ${results.authenticity.replace('_', ' ').toUpperCase()}\n\n`;
        
        if (results.tests.clientSide) {
            report += '🔍 Client-Side Detection:\n';
            
            if (results.tests.clientSide.botd) {
                report += `   🤖 BotD: ${results.tests.clientSide.botd.bot ? '❌ BOT DETECTED' : '✅ HUMAN'}\n`;
            }
            
            if (results.tests.clientSide.customChecks) {
                const checks = results.tests.clientSide.customChecks;
                report += `   🌐 WebDriver: ${checks.webdriver?.present ? '❌ DETECTED' : '✅ CLEAN'}\n`;
                report += `   �� Plugins: ${checks.plugins?.count || 0} plugins\n`;
                report += `   📺 Screen: ${checks.screen?.width}x${checks.screen?.height}${checks.screen?.suspicious ? ' (suspicious)' : ''}\n`;
            }
            
            report += '\n';
        }
        
        if (results.tests.apiServices && Object.keys(results.tests.apiServices).length > 0) {
            report += '🌐 API Services:\n';
            Object.entries(results.tests.apiServices).forEach(([service, result]) => {
                if (result.error) {
                    report += `   ❌ ${service}: Error - ${result.error}\n`;
                } else {
                    report += `   ✅ ${service}: Score available\n`;
                }
            });
            report += '\n';
        }
        
        if (results.recommendations.length > 0) {
            report += '💡 Recommendations:\n';
            results.recommendations.forEach(rec => {
                report += `   • ${rec}\n`;
            });
            report += '\n';
        }
        
        return report;
    }
}
