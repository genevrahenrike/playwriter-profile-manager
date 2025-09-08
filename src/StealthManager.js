import { chromium as playwrightChromium, firefox, webkit } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { chromium } from 'playwright';
import fs from 'fs-extra';
import path from 'path';

export class StealthManager {
    constructor() {
        this.defaultConfig = {
            // Enable stealth plugin (basic anti-bot protection)
            enableStealth: true,
            
            // WebGL fingerprinting protection - ENABLED (common bot detection vector)
            webgl: {
                enabled: true,
                vendor: 'Intel Inc.',
                renderer: 'Intel Iris OpenGL Engine',
                unmaskedVendor: 'Intel Inc.',
                unmaskedRenderer: 'Intel Iris OpenGL Engine'
            },
            
            // Audio fingerprinting protection - MINIMAL (only small noise, keep AudioContext)
            audio: {
                enabled: true,
                noiseAmount: 0.0001, // Very small noise to avoid detection
                enableAudioContext: true // Keep AudioContext enabled for compatibility
            },
            
            // Canvas fingerprinting protection - MINIMAL (very small noise)
            canvas: {
                enabled: true,
                noiseAmount: 0.001 // Reduced noise for authenticity
            },
            
            // Screen fingerprinting protection - DISABLED (use real screen by default)
            screen: {
                enabled: false, // Don't fake screen by default - use real values
                width: 1920,
                height: 1080,
                availWidth: 1920,
                availHeight: 1040,
                colorDepth: 24,
                pixelDepth: 24
            },
            
            // Timezone spoofing - DISABLED (use real timezone by default)
            timezone: {
                enabled: false, // Don't fake timezone by default
                timezone: 'America/New_York'
            },
            
            // Language spoofing - DISABLED (use real languages by default)
            languages: {
                enabled: false, // Don't fake languages by default
                languages: ['en-US', 'en']
            },
            
            // User agent customization - DISABLED (use real user agent by default)
            userAgent: {
                enabled: false, // Don't randomize user agent by default
                userAgent: null // Use browser's default
            },
            
            // Hardware concurrency spoofing - DISABLED (use real CPU info)
            hardwareConcurrency: {
                enabled: false, // Don't fake CPU cores by default
                cores: 8
            },
            
            // Memory spoofing - DISABLED (use real memory info)
            memory: {
                enabled: false, // Don't fake memory by default
                deviceMemory: 8,
                jsHeapSizeLimit: 4294705152
            },
            
            // Battery API spoofing - DISABLED (use real battery or unavailable)
            battery: {
                enabled: false, // Don't fake battery by default
                charging: true,
                chargingTime: 0,
                dischargingTime: Infinity,
                level: 1.0
            }
        };
    }

    /**
     * Initialize stealth-enabled browser
     * @param {Object} options - Launch options
     * @param {Object} stealthConfig - Stealth configuration
     * @returns {Object} Browser and context
     */
    async launchStealthBrowser(options = {}, stealthConfig = {}) {
        const config = { ...this.defaultConfig, ...stealthConfig };
        const {
            browserType = 'chromium',
            userDataDir,
            headless = false,
            devtools = false,
            viewport = { width: 1280, height: 720 },
            args = []
        } = options;

        // Configure stealth plugin
        if (config.enableStealth) {
            playwrightChromium.use(StealthPlugin());
        }

        let browser, context;
        
        if (browserType === 'chromium') {
            // Enhanced Chrome args for stealth
            const stealthArgs = [
                // Basic stealth
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                
                // WebGL protection
                '--disable-gpu-sandbox',
                '--ignore-gpu-blacklist',
                '--enable-gpu-rasterization',
                
                // Additional fingerprinting protection
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-background-timer-throttling',
                '--disable-features=TranslateUI',
                '--disable-default-apps',
                '--no-default-browser-check',
                '--no-first-run',
                '--disable-extensions-file-access-check',
                '--disable-extensions-http-throttling',
                
                // Audio/media protection
                '--disable-background-media-suspend',
                '--autoplay-policy=no-user-gesture-required',
                
                ...args
            ];

            const launchOptions = {
                headless,
                devtools,
                viewport,
                channel: 'chromium',
                args: stealthArgs
            };

            if (userDataDir) {
                context = await playwrightChromium.launchPersistentContext(userDataDir, launchOptions);
                browser = context.browser();
            } else {
                browser = await playwrightChromium.launch(launchOptions);
                context = await browser.newContext({ viewport });
            }
        } else {
            // For non-Chromium browsers, use regular playwright with basic stealth
            const browserOptions = {
                headless,
                devtools,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=VizDisplayCompositor',
                    ...args
                ]
            };

            switch (browserType) {
                case 'firefox':
                    browser = await firefox.launch({
                        ...browserOptions,
                        firefoxUserPrefs: this.getFirefoxStealthPrefs(config)
                    });
                    break;
                case 'webkit':
                    browser = await webkit.launch(browserOptions);
                    break;
                default:
                    throw new Error(`Unsupported browser type: ${browserType}`);
            }

            context = await browser.newContext({ viewport });
        }

        // Apply stealth scripts to all pages
        await this.applyStealthScripts(context, config);

        return { browser, context };
    }

    /**
     * Apply stealth scripts to browser context
     * @param {Object} context - Browser context
     * @param {Object} config - Stealth configuration
     */
    async applyStealthScripts(context, config) {
        // Add initialization script that runs before any page scripts
        await context.addInitScript(() => {
            // Remove webdriver property
            delete Object.getPrototypeOf(navigator).webdriver;
        });

        await context.addInitScript((config) => {
            // WebGL fingerprinting protection
            if (config.webgl.enabled) {
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) return config.webgl.vendor;
                    if (parameter === 37446) return config.webgl.renderer;
                    return getParameter.call(this, parameter);
                };

                const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) return config.webgl.vendor;
                    if (parameter === 37446) return config.webgl.renderer;
                    return getParameter2.call(this, parameter);
                };

                // WebGL extension spoofing
                const getExtension = WebGLRenderingContext.prototype.getExtension;
                WebGLRenderingContext.prototype.getExtension = function(name) {
                    if (name === 'WEBGL_debug_renderer_info') {
                        const extension = getExtension.call(this, name);
                        if (extension) {
                            const getParameter = this.getParameter;
                            this.getParameter = function(parameter) {
                                if (parameter === 37445) return config.webgl.unmaskedVendor;
                                if (parameter === 37446) return config.webgl.unmaskedRenderer;
                                return getParameter.call(this, parameter);
                            };
                        }
                        return extension;
                    }
                    return getExtension.call(this, name);
                };
            }

            // Audio fingerprinting protection
            if (config.audio.enabled) {
                if (config.audio.enableAudioContext === false) {
                    // Completely disable AudioContext
                    window.AudioContext = undefined;
                    window.webkitAudioContext = undefined;
                } else {
                    // Add minimal noise to audio fingerprinting (only if enabled and AudioContext allowed)
                    if (typeof AudioContext !== 'undefined') {
                        const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
                        AudioContext.prototype.createAnalyser = function() {
                            const analyser = originalCreateAnalyser.call(this);
                            const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
                            analyser.getFloatFrequencyData = function(array) {
                                originalGetFloatFrequencyData.call(this, array);
                                // Only add very small noise to avoid breaking audio functionality
                                for (let i = 0; i < array.length; i++) {
                                    array[i] += (Math.random() - 0.5) * config.audio.noiseAmount;
                                }
                            };
                            return analyser;
                        };
                    }
                }
            }

            // Canvas fingerprinting protection
            if (config.canvas.enabled) {
                const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
                HTMLCanvasElement.prototype.toDataURL = function() {
                    const context = this.getContext('2d');
                    if (context) {
                        const imageData = context.getImageData(0, 0, this.width, this.height);
                        const data = imageData.data;
                        
                        // Add subtle noise to canvas data
                        for (let i = 0; i < data.length; i += 4) {
                            if (Math.random() < config.canvas.noiseAmount) {
                                data[i] = Math.min(255, Math.max(0, data[i] + Math.floor((Math.random() - 0.5) * 10)));
                                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + Math.floor((Math.random() - 0.5) * 10)));
                                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + Math.floor((Math.random() - 0.5) * 10)));
                            }
                        }
                        
                        context.putImageData(imageData, 0, 0);
                    }
                    return originalToDataURL.apply(this, arguments);
                };
            }

            // Screen fingerprinting protection
            if (config.screen.enabled) {
                Object.defineProperty(screen, 'width', { value: config.screen.width });
                Object.defineProperty(screen, 'height', { value: config.screen.height });
                Object.defineProperty(screen, 'availWidth', { value: config.screen.availWidth });
                Object.defineProperty(screen, 'availHeight', { value: config.screen.availHeight });
                Object.defineProperty(screen, 'colorDepth', { value: config.screen.colorDepth });
                Object.defineProperty(screen, 'pixelDepth', { value: config.screen.pixelDepth });
            }

            // Hardware concurrency spoofing
            if (config.hardwareConcurrency.enabled) {
                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    value: config.hardwareConcurrency.cores
                });
            }

            // Memory spoofing
            if (config.memory.enabled) {
                Object.defineProperty(navigator, 'deviceMemory', {
                    value: config.memory.deviceMemory
                });
                
                if (window.performance && window.performance.memory) {
                    Object.defineProperty(window.performance.memory, 'jsHeapSizeLimit', {
                        value: config.memory.jsHeapSizeLimit
                    });
                }
            }

            // Battery API spoofing
            if (config.battery.enabled && navigator.getBattery) {
                const originalGetBattery = navigator.getBattery;
                navigator.getBattery = function() {
                    return Promise.resolve({
                        charging: config.battery.charging,
                        chargingTime: config.battery.chargingTime,
                        dischargingTime: config.battery.dischargingTime,
                        level: config.battery.level,
                        addEventListener: () => {},
                        removeEventListener: () => {}
                    });
                };
            }

            // Language spoofing
            if (config.languages.enabled) {
                Object.defineProperty(navigator, 'languages', {
                    value: config.languages.languages
                });
                Object.defineProperty(navigator, 'language', {
                    value: config.languages.languages[0]
                });
            }

            // Timezone spoofing
            if (config.timezone.enabled) {
                const originalDateTimeFormat = Intl.DateTimeFormat;
                Intl.DateTimeFormat = function(...args) {
                    if (args.length === 0) {
                        args = [undefined, { timeZone: config.timezone.timezone }];
                    } else if (args[1] && !args[1].timeZone) {
                        args[1].timeZone = config.timezone.timezone;
                    }
                    return new originalDateTimeFormat(...args);
                };
            }

            // Additional navigator properties spoofing
            Object.defineProperty(navigator, 'webdriver', { value: undefined });
            Object.defineProperty(navigator, 'plugins', {
                value: [
                    {
                        name: 'Chrome PDF Plugin',
                        description: 'Portable Document Format',
                        filename: 'internal-pdf-viewer',
                        length: 1
                    },
                    {
                        name: 'Chrome PDF Viewer',
                        description: '',
                        filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                        length: 1
                    },
                    {
                        name: 'Native Client',
                        description: '',
                        filename: 'internal-nacl-plugin',
                        length: 2
                    }
                ]
            });

        }, config);

        // Set user agent if specified
        if (config.userAgent.enabled && config.userAgent.userAgent) {
            await context.setUserAgent(config.userAgent.userAgent);
        }
    }

    /**
     * Get Firefox stealth preferences
     * @param {Object} config - Stealth configuration
     * @returns {Object} Firefox preferences
     */
    getFirefoxStealthPrefs(config) {
        const prefs = {
            'dom.webdriver.enabled': false,
            'useAutomationExtension': false,
            'general.platform.override': 'Win32',
            'general.useragent.override': config.userAgent.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        if (config.languages.enabled) {
            prefs['intl.accept_languages'] = config.languages.languages.join(',');
        }

        return prefs;
    }

    /**
     * Generate realistic user agent string
     * @param {string} browserType - Browser type
     * @returns {string} User agent string
     */
    generateUserAgent(browserType = 'chromium') {
        const chromeVersions = ['120.0.0.0', '119.0.0.0', '118.0.0.0', '117.0.0.0'];
        const windowsVersions = ['10.0', '11.0'];
        const macVersions = ['10_15_7', '11_7_10', '12_6_8', '13_6_3'];
        
        const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
        
        if (browserType === 'chromium') {
            const isWindows = Math.random() > 0.5;
            
            if (isWindows) {
                const winVersion = windowsVersions[Math.floor(Math.random() * windowsVersions.length)];
                return `Mozilla/5.0 (Windows NT ${winVersion}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
            } else {
                const macVersion = macVersions[Math.floor(Math.random() * macVersions.length)];
                return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${macVersion}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
            }
        }
        
        return null; // Use default for other browsers
    }

    /**
     * Create a stealth configuration preset
     * @param {string} preset - Preset name ('minimal', 'balanced', 'maximum')
     * @returns {Object} Stealth configuration
     */
    createPreset(preset = 'balanced') {
        // Deep copy to avoid modifying the original defaultConfig
        const config = JSON.parse(JSON.stringify(this.defaultConfig));
        
        switch (preset) {
            case 'minimal':
                // Only essential anti-bot protection
                config.webgl.enabled = true; // Keep WebGL protection (essential)
                config.audio.enabled = false; // Disable audio protection
                config.canvas.enabled = false; // Disable canvas protection
                config.screen.enabled = false;
                config.timezone.enabled = false;
                config.languages.enabled = false;
                config.userAgent.enabled = false;
                config.hardwareConcurrency.enabled = false;
                config.memory.enabled = false;
                config.battery.enabled = false;
                break;
                
            case 'maximum':
                // Enable more aggressive protection
                config.screen.enabled = true; // Enable screen spoofing
                config.timezone.enabled = true; // Enable timezone spoofing
                config.languages.enabled = true; // Enable language spoofing
                config.userAgent.enabled = true; // Enable user agent randomization
                config.hardwareConcurrency.enabled = true; // Enable hardware spoofing
                config.memory.enabled = true; // Enable memory spoofing
                config.battery.enabled = true; // Enable battery spoofing
                config.audio.enableAudioContext = false; // Completely disable AudioContext
                config.canvas.noiseAmount = 0.005; // Slightly more canvas noise
                config.audio.noiseAmount = 0.001; // More audio noise
                break;
                
            case 'balanced':
            default:
                // Use conservative default config
                // Only WebGL, minimal audio, and minimal canvas protection enabled
                break;
        }
        
        // Only generate user agent if explicitly enabled
        if (config.userAgent.enabled) {
            config.userAgent.userAgent = this.generateUserAgent();
        }
        
        return config;
    }

    /**
     * Save stealth configuration to file
     * @param {Object} config - Stealth configuration
     * @param {string} filePath - File path to save
     */
    async saveConfig(config, filePath) {
        await fs.writeJson(filePath, config, { spaces: 2 });
    }

    /**
     * Load stealth configuration from file
     * @param {string} filePath - File path to load
     * @returns {Object} Stealth configuration
     */
    async loadConfig(filePath) {
        if (await fs.pathExists(filePath)) {
            const config = await fs.readJson(filePath);
            return { ...this.defaultConfig, ...config };
        }
        return this.defaultConfig;
    }
}
