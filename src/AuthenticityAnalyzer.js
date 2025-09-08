import fs from 'fs-extra';
import path from 'path';

export class AuthenticityAnalyzer {
    constructor() {
        this.testSites = [
            {
                name: 'iphey.com',
                url: 'https://iphey.com',
                type: 'bot_detection',
                priority: 'primary',
                description: 'Professional bot detection and fingerprinting analysis'
            },
            {
                name: 'Pixelscan',
                url: 'https://pixelscan.net/fingerprint-check',
                type: 'bot_detection',
                priority: 'primary',
                description: 'Comprehensive browser fingerprint and bot detection'
            },
            {
                name: 'AmIUnique',
                url: 'https://amiunique.org/fingerprint',
                type: 'uniqueness_data',
                priority: 'data_only',
                description: 'Uniqueness data collection (consumer/privacy focused)'
            }
        ];

        // Authenticity scoring thresholds
        this.scoringCriteria = {
            // Lower scores are more suspicious
            consistency: {
                excellent: 0.95,
                good: 0.85,
                suspicious: 0.70,
                bot_likely: 0.50
            },
            uniqueness: {
                too_unique: 0.001,    // Extremely unique (suspicious)
                unique: 0.01,         // Reasonably unique
                common: 0.1,          // Common fingerprint
                too_common: 0.5       // Too common (suspicious)
            },
            behavioral: {
                human_like: 0.8,
                questionable: 0.6,
                bot_like: 0.3
            }
        };
    }

    /**
     * Run comprehensive authenticity analysis
     * @param {Object} page - Playwright page object
     * @param {Object} options - Analysis options
     * @returns {Object} Authenticity analysis results with scores
     */
    async analyzeAuthenticity(page, options = {}) {
        const {
            includeMultipleSites = true,
            includeBehavioralAnalysis = true,
            includeConsistencyCheck = true,
            saveResults = true,
            outputPath = './authenticity-analysis.json'
        } = options;

        console.log('🔍 Running comprehensive authenticity analysis...');

        const analysis = {
            timestamp: new Date().toISOString(),
            userAgent: await page.evaluate(() => navigator.userAgent),
            scores: {
                overall: 0,
                consistency: 0,
                uniqueness: 0,
                behavioral: 0,
                suspicion_flags: []
            },
            tests: {},
            recommendations: []
        };

        // 1. Enhanced MixVisit Analysis
        analysis.tests.mixvisit = await this.runEnhancedMixVisitTest(page);

        // 2. Multi-site fingerprint comparison
        if (includeMultipleSites) {
            analysis.tests.multisite = await this.runMultiSiteAnalysis(page);
        }

        // 3. Consistency analysis
        if (includeConsistencyCheck) {
            analysis.tests.consistency = await this.runConsistencyAnalysis(page);
        }

        // 4. Behavioral analysis
        if (includeBehavioralAnalysis) {
            analysis.tests.behavioral = await this.runBehavioralAnalysis(page);
        }

        // 5. Calculate authenticity scores
        this.calculateAuthenticityScores(analysis);

        // 6. Generate recommendations
        this.generateRecommendations(analysis);

        // 7. Save results if requested
        if (saveResults) {
            await this.saveAnalysis(analysis, outputPath);
            console.log(`📁 Analysis saved to: ${outputPath}`);
        }

        return analysis;
    }

    /**
     * Enhanced MixVisit test with additional analysis
     * @param {Object} page - Playwright page object
     * @returns {Object} Enhanced MixVisit results
     */
    async runEnhancedMixVisitTest(page) {
        try {
            console.log('🧪 Running enhanced MixVisit analysis...');
            
            await page.goto('data:text/html,<html><body><h1>Fingerprint Test</h1></body></html>');
            
            const result = await page.evaluate(async () => {
                // Load MixVisit
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/@mix-visit/lite@latest/dist/index.umd.js';
                document.head.appendChild(script);
                
                return new Promise((resolve) => {
                    script.onload = async () => {
                        try {
                            const { MixVisit } = window.MixVisitLite;
                            const mixvisit = new MixVisit();
                            await mixvisit.load();
                            
                            const results = mixvisit.get();
                            
                            // Enhanced analysis
                            const analysis = {
                                basic: {
                                    loadTime: mixvisit.loadTime,
                                    fingerprintHash: mixvisit.fingerprintHash,
                                    results: results
                                },
                                enhanced: {
                                    // Analyze fingerprint components for authenticity
                                    webgl_consistency: this.analyzeWebGLConsistency(results),
                                    canvas_authenticity: this.analyzeCanvasAuthenticity(results),
                                    audio_naturalness: this.analyzeAudioNaturalness(results),
                                    hardware_plausibility: this.analyzeHardwarePlausibility(results),
                                    timing_patterns: this.analyzeTimingPatterns(mixvisit.loadTime),
                                    entropy_analysis: this.analyzeEntropy(mixvisit.fingerprintHash)
                                }
                            };
                            
                            resolve(analysis);
                        } catch (error) {
                            resolve({ error: error.message });
                        }
                    };
                    
                    script.onerror = () => {
                        resolve({ error: 'Failed to load MixVisit library' });
                    };
                });
            });
            
            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Run multi-site fingerprint analysis
     * @param {Object} page - Playwright page object
     * @returns {Object} Multi-site analysis results
     */
    async runMultiSiteAnalysis(page) {
        console.log('🌐 Running multi-site fingerprint analysis...');
        
        const results = {
            sites_tested: [],
            consistency_score: 0,
            discrepancies: [],
            trust_indicators: [],
            primary_sites_results: {},
            bot_detection_scores: {}
        };

        // Prioritize primary bot detection sites
        const primarySites = this.testSites.filter(site => site.priority === 'primary');
        const secondarySites = this.testSites.filter(site => site.priority === 'secondary');
        
        // Test primary sites first (iphey.com and Pixelscan), plus AmIUnique for data
        const dataOnlySites = this.testSites.filter(site => site.priority === 'data_only');
        const sitesToTest = [...primarySites, ...dataOnlySites]; // Primary sites + AmIUnique for data
        
        for (const site of sitesToTest) {
            try {
                console.log(`   Testing: ${site.name}`);
                
                await page.goto(site.url, { 
                    waitUntil: 'networkidle',
                    timeout: 15000 
                });
                
                // Wait for site to load and analyze
                await page.waitForTimeout(3000);
                
                // Site-specific analysis based on type and priority
                let siteAnalysis;
                
                if (site.name === 'iphey.com') {
                    siteAnalysis = await this.analyzeIphey(page, site);
                } else if (site.name === 'Pixelscan') {
                    siteAnalysis = await this.analyzePixelscan(page, site);
                } else if (site.name === 'AmIUnique') {
                    siteAnalysis = await this.analyzeAmIUnique(page, site);
                } else {
                    // Generic analysis for other sites
                    siteAnalysis = await page.evaluate((siteName) => {
                        return {
                            siteName,
                            timestamp: Date.now(),
                            fingerprint_data: {
                                userAgent: navigator.userAgent,
                                platform: navigator.platform,
                                languages: navigator.languages,
                                hardwareConcurrency: navigator.hardwareConcurrency,
                                deviceMemory: navigator.deviceMemory,
                                screen: {
                                    width: screen.width,
                                    height: screen.height,
                                    colorDepth: screen.colorDepth
                                },
                                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                                webgl: (() => {
                                    try {
                                        const canvas = document.createElement('canvas');
                                        const gl = canvas.getContext('webgl');
                                        if (!gl) return null;
                                        return {
                                            vendor: gl.getParameter(gl.VENDOR),
                                            renderer: gl.getParameter(gl.RENDERER)
                                        };
                                    } catch (e) {
                                        return { error: e.message };
                                    }
                                })()
                            },
                            page_specific: {
                                title: document.title,
                                loaded_successfully: true,
                                response_time: Date.now() - performance.navigationStart
                            }
                        };
                    }, site.name);
                }
                
                results.sites_tested.push(siteAnalysis);
                
            } catch (error) {
                console.warn(`   Failed to test ${site.name}: ${error.message}`);
                results.sites_tested.push({
                    siteName: site.name,
                    error: error.message,
                    loaded_successfully: false
                });
            }
        }
        
        // Analyze consistency across sites
        this.analyzeMultiSiteConsistency(results);
        
        return results;
    }

    /**
     * Run consistency analysis across multiple tests
     * @param {Object} page - Playwright page object
     * @returns {Object} Consistency analysis
     */
    async runConsistencyAnalysis(page) {
        console.log('🔄 Running consistency analysis...');
        
        const tests = [];
        const numTests = 3;
        
        // Run the same test multiple times
        for (let i = 0; i < numTests; i++) {
            console.log(`   Running test ${i + 1}/${numTests}`);
            
            const testResult = await page.evaluate(() => {
                return {
                    timestamp: Date.now(),
                    userAgent: navigator.userAgent,
                    languages: navigator.languages,
                    platform: navigator.platform,
                    hardwareConcurrency: navigator.hardwareConcurrency,
                    deviceMemory: navigator.deviceMemory,
                    screen: {
                        width: screen.width,
                        height: screen.height,
                        colorDepth: screen.colorDepth
                    },
                    canvas: (() => {
                        try {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            ctx.fillText('Test', 10, 10);
                            return canvas.toDataURL().substring(0, 50);
                        } catch (e) {
                            return null;
                        }
                    })(),
                    webgl: (() => {
                        try {
                            const canvas = document.createElement('canvas');
                            const gl = canvas.getContext('webgl');
                            if (!gl) return null;
                            return {
                                vendor: gl.getParameter(gl.VENDOR),
                                renderer: gl.getParameter(gl.RENDERER)
                            };
                        } catch (e) {
                            return null;
                        }
                    })(),
                    performance: {
                        memory: performance.memory ? {
                            usedJSHeapSize: performance.memory.usedJSHeapSize,
                            totalJSHeapSize: performance.memory.totalJSHeapSize
                        } : null
                    }
                };
            });
            
            tests.push(testResult);
            
            // Small delay between tests
            await page.waitForTimeout(1000);
        }
        
        // Analyze consistency
        return this.analyzeConsistency(tests);
    }

    /**
     * Run behavioral analysis
     * @param {Object} page - Playwright page object
     * @returns {Object} Behavioral analysis
     */
    async runBehavioralAnalysis(page) {
        console.log('🎭 Running behavioral analysis...');
        
        const startTime = Date.now();
        
        // Test various behavioral patterns
        const behavioralData = await page.evaluate(() => {
            const startTime = performance.now();
            
            return new Promise((resolve) => {
                const data = {
                    timing: {
                        start: startTime,
                        events: []
                    },
                    interactions: {
                        mouse_events: 0,
                        keyboard_events: 0,
                        scroll_events: 0
                    },
                    automation_indicators: {
                        webdriver_detected: !!navigator.webdriver,
                        automation_extensions: [],
                        suspicious_properties: []
                    },
                    performance_patterns: {
                        execution_times: [],
                        memory_usage: []
                    }
                };
                
                // Check for automation indicators
                if (window.chrome && window.chrome.runtime && window.chrome.runtime.onConnect) {
                    data.automation_indicators.suspicious_properties.push('chrome.runtime.onConnect');
                }
                
                if (window.callPhantom || window._phantom) {
                    data.automation_indicators.suspicious_properties.push('phantom_detected');
                }
                
                if (navigator.plugins.length === 0) {
                    data.automation_indicators.suspicious_properties.push('no_plugins');
                }
                
                // Performance timing tests
                const performanceTest = () => {
                    const start = performance.now();
                    // Simple computation
                    let sum = 0;
                    for (let i = 0; i < 10000; i++) {
                        sum += Math.random();
                    }
                    const end = performance.now();
                    return end - start;
                };
                
                // Run performance tests
                for (let i = 0; i < 5; i++) {
                    data.performance_patterns.execution_times.push(performanceTest());
                }
                
                // Memory usage if available
                if (performance.memory) {
                    data.performance_patterns.memory_usage.push({
                        used: performance.memory.usedJSHeapSize,
                        total: performance.memory.totalJSHeapSize,
                        limit: performance.memory.jsHeapSizeLimit
                    });
                }
                
                data.timing.end = performance.now();
                data.timing.total_duration = data.timing.end - data.timing.start;
                
                resolve(data);
            });
        });
        
        const endTime = Date.now();
        
        return {
            ...behavioralData,
            analysis_duration: endTime - startTime,
            authenticity_indicators: this.analyzeBehavioralAuthenticity(behavioralData)
        };
    }

    /**
     * Calculate overall authenticity scores
     * @param {Object} analysis - Analysis results
     */
    calculateAuthenticityScores(analysis) {
        console.log('📊 Calculating authenticity scores...');
        
        const scores = analysis.scores;
        
        // 1. Consistency Score
        if (analysis.tests.consistency) {
            scores.consistency = this.calculateConsistencyScore(analysis.tests.consistency);
        }
        
        // 2. Uniqueness Score
        if (analysis.tests.mixvisit && analysis.tests.mixvisit.basic) {
            scores.uniqueness = this.calculateUniquenessScore(analysis.tests.mixvisit);
        }
        
        // 3. Behavioral Score
        if (analysis.tests.behavioral) {
            scores.behavioral = this.calculateBehavioralScore(analysis.tests.behavioral);
        }
        
        // 4. Primary Site Scores (iphey.com and Pixelscan)
        if (analysis.tests.multisite && analysis.tests.multisite.sites_tested) {
            const ipheyResult = analysis.tests.multisite.sites_tested.find(s => s.siteName === 'iphey.com');
            const pixelscanResult = analysis.tests.multisite.sites_tested.find(s => s.siteName === 'Pixelscan');
            const amiuResult = analysis.tests.multisite.sites_tested.find(s => s.siteName === 'AmIUnique');
            
            if (ipheyResult && ipheyResult.bot_detection_score !== null) {
                scores.iphey_score = ipheyResult.bot_detection_score;
            }
            
            if (pixelscanResult && pixelscanResult.consistency_score !== null) {
                scores.pixelscan_score = pixelscanResult.consistency_score;
            }
            
            if (amiuResult && amiuResult.uniqueness_score !== null) {
                scores.amiunique_score = amiuResult.uniqueness_score;
            }
            
            scores.multisite_consistency = analysis.tests.multisite.consistency_score;
        }
        
        // 5. Calculate Overall Score with Primary Site Priority
        const weights = {
            // Primary bot detection sites get highest weight
            iphey_score: 0.4,           // iphey.com gets 40% weight
            pixelscan_score: 0.3,       // Pixelscan gets 30% weight
            
            // Traditional metrics get lower weight
            consistency: 0.15,          // Reduced from 0.3
            behavioral: 0.15,           // Reduced from 0.3
            
            // AmIUnique for data validation only
            amiunique_score: 0.0,       // Data only, no scoring weight
            multisite_consistency: 0.0  // Covered by primary sites
        };
        
        let weightedSum = 0;
        let totalWeight = 0;
        
        Object.keys(weights).forEach(key => {
            if (scores[key] !== undefined) {
                weightedSum += scores[key] * weights[key];
                totalWeight += weights[key];
            }
        });
        
        scores.overall = totalWeight > 0 ? weightedSum / totalWeight : 0;
        
        // 6. Generate suspicion flags
        this.generateSuspicionFlags(analysis);
    }

    /**
     * Calculate consistency score
     * @param {Object} consistencyData - Consistency test data
     * @returns {number} Consistency score (0-1)
     */
    calculateConsistencyScore(consistencyData) {
        if (!consistencyData.tests || consistencyData.tests.length < 2) {
            return 0.5; // Neutral score if insufficient data
        }
        
        let totalConsistency = 0;
        let testCount = 0;
        
        // Check consistency of key properties
        const properties = ['userAgent', 'platform', 'hardwareConcurrency', 'deviceMemory'];
        
        properties.forEach(prop => {
            const values = consistencyData.tests.map(test => test[prop]).filter(v => v !== undefined);
            if (values.length > 1) {
                const uniqueValues = new Set(values);
                const consistency = uniqueValues.size === 1 ? 1.0 : 0.0;
                totalConsistency += consistency;
                testCount++;
            }
        });
        
        return testCount > 0 ? totalConsistency / testCount : 0.5;
    }

    /**
     * Calculate uniqueness score
     * @param {Object} mixvisitData - MixVisit test data
     * @returns {number} Uniqueness score (0-1)
     */
    calculateUniquenessScore(mixvisitData) {
        // This is a simplified uniqueness calculation
        // In practice, you'd compare against a database of known fingerprints
        
        const hash = mixvisitData.basic?.fingerprintHash;
        if (!hash) return 0.5;
        
        // Analyze hash entropy
        const entropy = this.calculateEntropy(hash);
        
        // Higher entropy generally means more unique
        // But extremely high entropy might be suspicious
        if (entropy > 4.5) return 0.8; // Good uniqueness
        if (entropy > 3.5) return 0.6; // Moderate uniqueness
        if (entropy > 2.0) return 0.4; // Low uniqueness
        return 0.2; // Very low uniqueness (suspicious)
    }

    /**
     * Calculate behavioral score
     * @param {Object} behavioralData - Behavioral test data
     * @returns {number} Behavioral score (0-1)
     */
    calculateBehavioralScore(behavioralData) {
        let score = 1.0;
        
        // Deduct points for automation indicators
        if (behavioralData.automation_indicators) {
            const indicators = behavioralData.automation_indicators;
            
            if (indicators.webdriver_detected) score -= 0.3;
            if (indicators.suspicious_properties.length > 0) {
                score -= 0.1 * indicators.suspicious_properties.length;
            }
        }
        
        // Check performance patterns
        if (behavioralData.performance_patterns) {
            const execTimes = behavioralData.performance_patterns.execution_times;
            if (execTimes && execTimes.length > 0) {
                const variance = this.calculateVariance(execTimes);
                // Very low variance might indicate automation
                if (variance < 0.1) score -= 0.2;
            }
        }
        
        return Math.max(0, Math.min(1, score));
    }

    /**
     * Generate suspicion flags based on analysis
     * @param {Object} analysis - Analysis results
     */
    generateSuspicionFlags(analysis) {
        const flags = analysis.scores.suspicion_flags;
        
        // Check overall score
        if (analysis.scores.overall < 0.3) {
            flags.push({
                level: 'HIGH',
                type: 'LOW_OVERALL_SCORE',
                message: 'Overall authenticity score is very low',
                score: analysis.scores.overall
            });
        }
        
        // Check consistency
        if (analysis.scores.consistency < 0.7) {
            flags.push({
                level: 'MEDIUM',
                type: 'INCONSISTENT_FINGERPRINT',
                message: 'Fingerprint shows inconsistencies across tests',
                score: analysis.scores.consistency
            });
        }
        
        // Check behavioral indicators
        if (analysis.tests.behavioral?.automation_indicators?.webdriver_detected) {
            flags.push({
                level: 'HIGH',
                type: 'WEBDRIVER_DETECTED',
                message: 'WebDriver automation detected',
                details: 'navigator.webdriver property is present'
            });
        }
        
        // Check for too-perfect consistency (bot-like)
        if (analysis.scores.consistency > 0.99) {
            flags.push({
                level: 'MEDIUM',
                type: 'TOO_CONSISTENT',
                message: 'Fingerprint is suspiciously consistent',
                details: 'Perfect consistency may indicate automation'
            });
        }
    }

    /**
     * Generate recommendations for improving authenticity
     * @param {Object} analysis - Analysis results
     */
    generateRecommendations(analysis) {
        const recommendations = analysis.recommendations;
        const scores = analysis.scores;
        
        if (scores.overall < 0.5) {
            recommendations.push({
                priority: 'HIGH',
                category: 'STEALTH_CONFIGURATION',
                message: 'Consider using minimal stealth preset for better authenticity',
                action: 'Switch to minimal stealth configuration'
            });
        }
        
        if (analysis.scores.suspicion_flags.some(flag => flag.type === 'WEBDRIVER_DETECTED')) {
            recommendations.push({
                priority: 'HIGH',
                category: 'WEBDRIVER_HIDING',
                message: 'WebDriver detection needs improvement',
                action: 'Ensure webdriver property is properly hidden'
            });
        }
        
        if (scores.consistency < 0.7) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'CONSISTENCY',
                message: 'Improve fingerprint consistency',
                action: 'Review stealth configuration for inconsistencies'
            });
        }
        
        if (scores.uniqueness < 0.3) {
            recommendations.push({
                priority: 'LOW',
                category: 'UNIQUENESS',
                message: 'Fingerprint may be too common',
                action: 'Consider slight randomization of some properties'
            });
        }
    }

    /**
     * Analyze multi-site consistency
     * @param {Object} results - Multi-site test results
     */
    analyzeMultiSiteConsistency(results) {
        const successfulTests = results.sites_tested.filter(test => test.loaded_successfully);
        
        if (successfulTests.length < 2) {
            results.consistency_score = 0.5;
            return;
        }
        
        // Check consistency of key properties across sites
        const properties = ['userAgent', 'platform', 'hardwareConcurrency', 'deviceMemory'];
        let consistentProperties = 0;
        
        properties.forEach(prop => {
            const values = successfulTests.map(test => 
                test.fingerprint_data?.[prop]
            ).filter(v => v !== undefined);
            
            if (values.length > 1) {
                const uniqueValues = new Set(values.map(v => JSON.stringify(v)));
                if (uniqueValues.size === 1) {
                    consistentProperties++;
                } else {
                    results.discrepancies.push({
                        property: prop,
                        values: Array.from(uniqueValues),
                        sites: successfulTests.map(t => t.siteName)
                    });
                }
            }
        });
        
        results.consistency_score = properties.length > 0 ? 
            consistentProperties / properties.length : 0.5;
    }

    /**
     * Analyze consistency across multiple test runs
     * @param {Array} tests - Array of test results
     * @returns {Object} Consistency analysis
     */
    analyzeConsistency(tests) {
        const analysis = {
            tests: tests,
            consistent_properties: [],
            inconsistent_properties: [],
            consistency_score: 0
        };
        
        if (tests.length < 2) {
            analysis.consistency_score = 0.5;
            return analysis;
        }
        
        // Check each property for consistency
        const properties = ['userAgent', 'platform', 'hardwareConcurrency', 'deviceMemory'];
        
        properties.forEach(prop => {
            const values = tests.map(test => test[prop]).filter(v => v !== undefined);
            if (values.length > 1) {
                const uniqueValues = new Set(values);
                if (uniqueValues.size === 1) {
                    analysis.consistent_properties.push(prop);
                } else {
                    analysis.inconsistent_properties.push({
                        property: prop,
                        values: Array.from(uniqueValues)
                    });
                }
            }
        });
        
        const totalProperties = properties.length;
        analysis.consistency_score = totalProperties > 0 ? 
            analysis.consistent_properties.length / totalProperties : 0.5;
        
        return analysis;
    }

    /**
     * Calculate entropy of a string
     * @param {string} str - String to analyze
     * @returns {number} Entropy value
     */
    calculateEntropy(str) {
        const freq = {};
        for (let char of str) {
            freq[char] = (freq[char] || 0) + 1;
        }
        
        let entropy = 0;
        const len = str.length;
        
        for (let char in freq) {
            const p = freq[char] / len;
            entropy -= p * Math.log2(p);
        }
        
        return entropy;
    }

    /**
     * Calculate variance of an array
     * @param {Array} values - Array of numbers
     * @returns {number} Variance
     */
    calculateVariance(values) {
        if (values.length < 2) return 0;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    }

    /**
     * Analyze behavioral authenticity
     * @param {Object} behavioralData - Behavioral test data
     * @returns {Object} Authenticity indicators
     */
    analyzeBehavioralAuthenticity(behavioralData) {
        const indicators = {
            human_like_patterns: [],
            suspicious_patterns: [],
            authenticity_score: 1.0
        };
        
        // Check for automation indicators
        if (behavioralData.automation_indicators) {
            const autoIndicators = behavioralData.automation_indicators;
            
            if (autoIndicators.webdriver_detected) {
                indicators.suspicious_patterns.push('WebDriver detected');
                indicators.authenticity_score -= 0.3;
            }
            
            if (autoIndicators.suspicious_properties.length > 0) {
                indicators.suspicious_patterns.push(`Suspicious properties: ${autoIndicators.suspicious_properties.join(', ')}`);
                indicators.authenticity_score -= 0.1 * autoIndicators.suspicious_properties.length;
            }
        }
        
        // Check performance patterns
        if (behavioralData.performance_patterns) {
            const perfPatterns = behavioralData.performance_patterns;
            
            if (perfPatterns.execution_times && perfPatterns.execution_times.length > 0) {
                const variance = this.calculateVariance(perfPatterns.execution_times);
                
                if (variance > 0.5) {
                    indicators.human_like_patterns.push('Natural performance variance');
                } else {
                    indicators.suspicious_patterns.push('Suspiciously consistent performance');
                    indicators.authenticity_score -= 0.2;
                }
            }
        }
        
        indicators.authenticity_score = Math.max(0, Math.min(1, indicators.authenticity_score));
        
        return indicators;
    }

    /**
     * Save analysis results to file
     * @param {Object} analysis - Analysis results
     * @param {string} filePath - Output file path
     */
    async saveAnalysis(analysis, filePath) {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, analysis, { spaces: 2 });
    }

    /**
     * Generate a human-readable authenticity report
     * @param {Object} analysis - Analysis results
     * @returns {string} Formatted report
     */
    generateAuthenticityReport(analysis) {
        let report = '\n🔍 AUTHENTICITY ANALYSIS REPORT\n';
        report += '=' .repeat(50) + '\n\n';
        
        report += `📅 Analysis Date: ${analysis.timestamp}\n`;
        report += `🌐 User Agent: ${analysis.userAgent}\n\n`;
        
        // Overall Score
        const overall = analysis.scores.overall;
        const overallGrade = overall >= 0.8 ? '🟢 EXCELLENT' : 
                           overall >= 0.6 ? '🟡 GOOD' : 
                           overall >= 0.4 ? '🟠 SUSPICIOUS' : '🔴 HIGH RISK';
        
        report += `🎯 OVERALL AUTHENTICITY SCORE: ${(overall * 100).toFixed(1)}% (${overallGrade})\n\n`;
        
        // Individual Scores
        report += '📊 DETAILED SCORES:\n';
        if (analysis.scores.consistency !== undefined) {
            report += `   Consistency: ${(analysis.scores.consistency * 100).toFixed(1)}%\n`;
        }
        if (analysis.scores.uniqueness !== undefined) {
            report += `   Uniqueness: ${(analysis.scores.uniqueness * 100).toFixed(1)}%\n`;
        }
        if (analysis.scores.behavioral !== undefined) {
            report += `   Behavioral: ${(analysis.scores.behavioral * 100).toFixed(1)}%\n`;
        }
        if (analysis.scores.multisite_consistency !== undefined) {
            report += `   Multi-site Consistency: ${(analysis.scores.multisite_consistency * 100).toFixed(1)}%\n`;
        }
        
        // Suspicion Flags
        if (analysis.scores.suspicion_flags.length > 0) {
            report += '\n🚨 SUSPICION FLAGS:\n';
            analysis.scores.suspicion_flags.forEach(flag => {
                const emoji = flag.level === 'HIGH' ? '🔴' : flag.level === 'MEDIUM' ? '🟡' : '🟠';
                report += `   ${emoji} ${flag.level}: ${flag.message}\n`;
                if (flag.details) {
                    report += `      Details: ${flag.details}\n`;
                }
            });
        }
        
        // Recommendations
        if (analysis.recommendations.length > 0) {
            report += '\n💡 RECOMMENDATIONS:\n';
            analysis.recommendations.forEach(rec => {
                const emoji = rec.priority === 'HIGH' ? '🔥' : rec.priority === 'MEDIUM' ? '⚠️' : 'ℹ️';
                report += `   ${emoji} ${rec.priority}: ${rec.message}\n`;
                report += `      Action: ${rec.action}\n`;
            });
        }
        
        return report;
    }

    /**
     * Analyze iphey.com for bot detection scores
     */
    async analyzeIphey(page, site) {
        try {
            console.log('🔍 Analyzing iphey.com for bot detection...');
            await page.waitForTimeout(8000);
            
            const analysis = await page.evaluate(() => {
                const result = {
                    siteName: 'iphey.com',
                    timestamp: Date.now(),
                    bot_detection_score: null,
                    authenticity_status: null,
                    risk_indicators: [],
                    page_specific: {
                        title: document.title,
                        loaded_successfully: true
                    }
                };

                try {
                    const pageText = document.body.innerText.toLowerCase();
                    
                    if (pageText.includes('unreliable')) {
                        result.authenticity_status = 'Unreliable';
                        result.bot_detection_score = 0.2;
                        result.risk_indicators.push('Marked as unreliable by iphey.com');
                    } else if (pageText.includes('reliable')) {
                        result.authenticity_status = 'Reliable';
                        result.bot_detection_score = 0.8;
                    }
                    
                    if (pageText.includes('masking your fingerprint')) {
                        result.risk_indicators.push('Fingerprint masking detected');
                        if (result.bot_detection_score > 0.4) {
                            result.bot_detection_score = 0.3;
                        }
                    }
                    
                    if (result.bot_detection_score === null) {
                        result.bot_detection_score = 0.5;
                    }
                    
                } catch (e) {
                    result.analysis_error = e.message;
                    result.bot_detection_score = 0.5;
                }
                
                return result;
            });
            
            return analysis;
        } catch (error) {
            return {
                siteName: 'iphey.com',
                error: error.message,
                bot_detection_score: 0.5
            };
        }
    }

    /**
     * Analyze Pixelscan for fingerprint consistency
     */
    async analyzePixelscan(page, site) {
        try {
            console.log('🔍 Analyzing Pixelscan for fingerprint consistency...');
            await page.waitForTimeout(12000);
            
            const analysis = await page.evaluate(() => {
                const result = {
                    siteName: 'Pixelscan',
                    timestamp: Date.now(),
                    consistency_score: null,
                    automation_detected: false,
                    detected_issues: [],
                    page_specific: {
                        title: document.title,
                        loaded_successfully: true
                    }
                };

                try {
                    const pageText = document.body.innerText.toLowerCase();
                    
                    if (pageText.includes('automation framework detected')) {
                        result.automation_detected = true;
                        result.detected_issues.push('Automation framework detected');
                        result.consistency_score = 0.1;
                    }
                    
                    if (pageText.includes('inconsistent')) {
                        result.detected_issues.push('Inconsistent fingerprint');
                        result.consistency_score = 0.3;
                    } else if (pageText.includes('consistent')) {
                        if (result.consistency_score === null) {
                            result.consistency_score = 0.8;
                        }
                    }
                    
                    if (pageText.includes('headless') || pageText.includes('chrome headless')) {
                        result.detected_issues.push('Headless browser detected');
                        result.consistency_score = 0.1;
                    }
                    
                    if (result.consistency_score === null) {
                        result.consistency_score = result.detected_issues.length === 0 ? 0.8 : 0.2;
                    }
                    
                } catch (e) {
                    result.analysis_error = e.message;
                    result.consistency_score = 0.5;
                }
                
                return result;
            });
            
            return analysis;
        } catch (error) {
            return {
                siteName: 'Pixelscan',
                error: error.message,
                consistency_score: 0.5
            };
        }
    }

    /**
     * Analyze AmIUnique for uniqueness data
     */
    async analyzeAmIUnique(page, site) {
        try {
            console.log('🔍 Analyzing AmIUnique for uniqueness data...');
            await page.waitForTimeout(20000); // AmIUnique is slower
            
            const analysis = await page.evaluate(() => {
                const result = {
                    siteName: 'AmIUnique',
                    timestamp: Date.now(),
                    uniqueness_score: null,
                    uniqueness_status: null,
                    similarity_percentages: [],
                    page_specific: {
                        title: document.title,
                        loaded_successfully: true
                    }
                };

                try {
                    const pageText = document.body.innerText.toLowerCase();
                    
                    if (pageText.includes('you are unique')) {
                        result.uniqueness_status = 'Unique';
                        result.uniqueness_score = 0.9;
                    } else if (pageText.includes('you are not unique')) {
                        result.uniqueness_status = 'Not Unique';
                        result.uniqueness_score = 0.3;
                    }
                    
                    if (pageText.includes('chrome headless')) {
                        result.uniqueness_score = 0.1; // Very suspicious
                    }
                    
                    const percentageMatches = pageText.match(/(\d+(\.\d+)?)\s*%/g) || [];
                    result.similarity_percentages = percentageMatches.slice(0, 5);
                    
                    if (result.uniqueness_score === null) {
                        result.uniqueness_score = 0.5;
                    }
                    
                } catch (e) {
                    result.analysis_error = e.message;
                    result.uniqueness_score = 0.5;
                }
                
                return result;
            });
            
            return analysis;
        } catch (error) {
            return {
                siteName: 'AmIUnique',
                error: error.message,
                uniqueness_score: 0.5
            };
        }
    }
}
