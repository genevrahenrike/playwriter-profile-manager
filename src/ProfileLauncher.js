import { chromium, firefox, webkit } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import { StealthManager } from './StealthManager.js';
import { FingerprintTester } from './FingerprintTester.js';

export class ProfileLauncher {
    constructor(profileManager) {
        this.profileManager = profileManager;
        this.activeBrowsers = new Map();
        this.stealthManager = new StealthManager();
        this.fingerprintTester = new FingerprintTester();
    }

    async launchProfile(nameOrId, options = {}) {
        const {
            browserType = 'chromium',
            headless = false,
            devtools = false,
            viewport = { width: 1280, height: 720 },
            args = [],
            loadExtensions = [],
            autoLoadExtensions = true,
            stealth = true,
            stealthPreset = 'balanced',
            stealthConfig = null,
            testFingerprint = false
        } = options;

        const profile = await this.profileManager.getProfile(nameOrId);
        const sessionId = await this.profileManager.startSession(profile.id, 'automation');

        let browser, context;
        
        try {
            // Determine stealth configuration
            let finalStealthConfig = null;
            if (stealth) {
                if (stealthConfig) {
                    finalStealthConfig = stealthConfig;
                } else {
                    finalStealthConfig = this.stealthManager.createPreset(stealthPreset);
                }
                console.log(`🛡️  Using stealth preset: ${stealthPreset}`);
            }

            if (browserType === 'chromium') {
                // Set up profile preferences before launching
                await this.setupChromiumProfilePreferences(profile);
                
                // Check for imported data
                const importedData = await this.loadImportedData(profile.userDataDir);
                
                // Auto-detect extensions from ./extensions folder if enabled
                let allExtensions = [...loadExtensions];
                if (autoLoadExtensions) {
                    const autoExtensions = await this.findAutoLoadExtensions();
                    allExtensions = [...allExtensions, ...autoExtensions];
                }

                if (stealth && finalStealthConfig) {
                    // Use stealth manager for enhanced protection
                    const stealthOptions = {
                        browserType,
                        userDataDir: profile.userDataDir,
                        headless,
                        devtools,
                        viewport,
                        args: [...this.getExtensionLaunchArgs(allExtensions), ...args]
                    };
                    
                    const stealthResult = await this.stealthManager.launchStealthBrowser(stealthOptions, finalStealthConfig);
                    browser = stealthResult.browser;
                    context = stealthResult.context;
                    
                    console.log('🛡️  Stealth features activated');
                } else {
                    // Fallback to regular playwright launch
                    const launchOptions = {
                        headless,
                        devtools,
                        viewport,
                        channel: 'chromium',
                        args: [
                            '--disable-blink-features=AutomationControlled',
                            '--disable-features=VizDisplayCompositor',
                            ...this.getExtensionLaunchArgs(allExtensions),
                            ...args
                        ]
                    };
                    
                    context = await chromium.launchPersistentContext(profile.userDataDir, launchOptions);
                    browser = context.browser();
                }
                
                // Add extensions if available - for persistent context, extensions should be in user data dir
                if (importedData.extensions && importedData.extensions.length > 0) {
                    console.log(`Found ${importedData.extensions.length} extensions in profile`);
                    // Extensions are already copied to the profile directory during import
                    // Persistent context will load them automatically
                }
                
                // Load cookies if available
                if (importedData.cookies && importedData.cookies.length > 0) {
                    try {
                        // Validate and filter cookies
                        const validCookies = importedData.cookies.filter(cookie => {
                            // Basic validation
                            return cookie.name && 
                                   cookie.domain && 
                                   cookie.path &&
                                   (!cookie.sameSite || ['Strict', 'Lax', 'None'].includes(cookie.sameSite));
                        });
                        
                        if (validCookies.length > 0) {
                            await context.addCookies(validCookies);
                            console.log(`Loaded ${validCookies.length}/${importedData.cookies.length} cookies`);
                        }
                    } catch (error) {
                        console.warn(`Could not load cookies: ${error.message}`);
                    }
                }
            } else {
                // For Firefox and WebKit, use regular browser launch
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
                            firefoxUserPrefs: this.getFirefoxPrefs()
                        });
                        break;
                    case 'webkit':
                        browser = await webkit.launch(browserOptions);
                        break;
                    default:
                        throw new Error(`Unsupported browser type: ${browserType}`);
                }
                
                // Create a persistent context for non-Chromium browsers
                context = await browser.newContext({
                    viewport,
                    storageState: path.join(profile.userDataDir, 'storage-state.json')
                });
            }

            const browserInfo = {
                browser,
                context,
                profile,
                sessionId,
                browserType,
                startTime: new Date()
            };

            this.activeBrowsers.set(sessionId, browserInfo);

            // For Chromium persistent context, use the existing page; for others, create new page
            const page = browserType === 'chromium' ? context.pages()[0] : await context.newPage();
            
            const result = {
                browser,
                context,
                profile,
                sessionId,
                page,
                stealthEnabled: stealth,
                stealthConfig: finalStealthConfig
            };

            // Run fingerprint test if requested
            if (testFingerprint && page) {
                console.log('🧪 Running fingerprint test...');
                try {
                    const fingerprintResults = await this.fingerprintTester.runComprehensiveTest(page, {
                        includeMixVisit: true,
                        includeMultipleSites: false, // Skip multiple sites for faster testing
                        saveResults: true,
                        outputPath: path.join(profile.userDataDir, 'fingerprint-test.json')
                    });
                    
                    result.fingerprintTest = fingerprintResults;
                    console.log('✅ Fingerprint test completed');
                    console.log(this.fingerprintTester.generateSummaryReport(fingerprintResults));
                } catch (error) {
                    console.warn('⚠️  Fingerprint test failed:', error.message);
                    result.fingerprintTestError = error.message;
                }
            }
            
            return result;
        } catch (error) {
            await this.profileManager.endSession(sessionId);
            throw new Error(`Failed to launch profile: ${error.message}`);
        }
    }

    async launchFreshProfile(name, options = {}) {
        // Create a temporary profile for this session
        const profile = await this.profileManager.createProfile(`temp_${Date.now()}_${name}`, {
            description: 'Temporary fresh profile',
            browserType: options.browserType || 'chromium'
        });

        try {
            const result = await this.launchProfile(profile.id, options);
            
            // Mark this as a temporary profile for cleanup
            result.isTemporary = true;
            
            return result;
        } catch (error) {
            // Clean up the temporary profile if launch fails
            await this.profileManager.deleteProfile(profile.id);
            throw error;
        }
    }

    async closeBrowser(sessionId) {
        const browserInfo = this.activeBrowsers.get(sessionId);
        if (!browserInfo) {
            throw new Error(`No active browser found for session: ${sessionId}`);
        }

        try {
            // Save storage state for non-Chromium browsers
            if (browserInfo.context && browserInfo.browserType !== 'chromium') {
                const storageStatePath = path.join(browserInfo.profile.userDataDir, 'storage-state.json');
                await browserInfo.context.storageState({ path: storageStatePath });
            }

            // Close context and browser
            if (browserInfo.context) {
                await browserInfo.context.close();
            }
            if (browserInfo.browser && browserInfo.browserType !== 'chromium') {
                await browserInfo.browser.close();
            }
            
            // End session
            await this.profileManager.endSession(sessionId);
            
            // Clean up temporary profiles
            if (browserInfo.isTemporary) {
                await this.profileManager.deleteProfile(browserInfo.profile.id);
            }
            
            this.activeBrowsers.delete(sessionId);
            
            return {
                profile: browserInfo.profile,
                duration: new Date() - browserInfo.startTime
            };
        } catch (error) {
            throw new Error(`Failed to close browser: ${error.message}`);
        }
    }

    async closeAllBrowsers() {
        const results = [];
        const sessionIds = Array.from(this.activeBrowsers.keys());
        
        for (const sessionId of sessionIds) {
            try {
                const result = await this.closeBrowser(sessionId);
                results.push({ sessionId, success: true, ...result });
            } catch (error) {
                results.push({ sessionId, success: false, error: error.message });
            }
        }
        
        return results;
    }

    getActiveSessions() {
        const sessions = [];
        for (const [sessionId, browserInfo] of this.activeBrowsers) {
            sessions.push({
                sessionId,
                profileName: browserInfo.profile.name,
                browserType: browserInfo.browserType,
                startTime: browserInfo.startTime,
                duration: new Date() - browserInfo.startTime
            });
        }
        return sessions;
    }

    getFirefoxPrefs() {
        return {
            'dom.webdriver.enabled': false,
            'useAutomationExtension': false,
            'general.platform.override': 'Win32',
            'general.useragent.override': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };
    }

    async getBrowserInfo(sessionId) {
        const browserInfo = this.activeBrowsers.get(sessionId);
        if (!browserInfo) {
            return null;
        }

        try {
            const pages = browserInfo.context ? await browserInfo.context.pages() : [];
            const contextCount = browserInfo.browser ? browserInfo.browser.contexts().length : 1;

            return {
                sessionId,
                profile: browserInfo.profile,
                browserType: browserInfo.browserType,
                startTime: browserInfo.startTime,
                duration: new Date() - browserInfo.startTime,
                pageCount: pages.length,
                contextCount: contextCount
            };
        } catch (error) {
            return {
                sessionId,
                profile: browserInfo.profile,
                browserType: browserInfo.browserType,
                startTime: browserInfo.startTime,
                error: error.message
            };
        }
    }

    async setupChromiumProfilePreferences(profile) {
        const preferencesPath = path.join(profile.userDataDir, 'Preferences');
        
        try {
            let preferences = {};
            
            // Read existing preferences if they exist
            if (await fs.pathExists(preferencesPath)) {
                preferences = await fs.readJson(preferencesPath);
            }
            
            // Set profile name and other preferences
            if (!preferences.profile) {
                preferences.profile = {};
            }
            
            preferences.profile.name = profile.name;
            preferences.profile.managed_user_id = '';
            preferences.profile.is_ephemeral = false;
            
            // Ensure the profile directory exists
            await fs.ensureDir(profile.userDataDir);
            
            // Write preferences
            await fs.writeJson(preferencesPath, preferences, { spaces: 2 });
            
        } catch (error) {
            // Don't fail if we can't set preferences, just log it
            console.warn(`Could not set profile preferences: ${error.message}`);
        }
    }

    async loadImportedData(userDataDir) {
        const importedData = {
            cookies: [],
            extensions: [],
            bookmarks: null
        };

        try {
            // Load cookies from JSON
            const cookiesFile = path.join(userDataDir, 'imported-cookies.json');
            if (await fs.pathExists(cookiesFile)) {
                importedData.cookies = await fs.readJson(cookiesFile);
            }

            // Load extension info
            const extensionFile = path.join(userDataDir, 'extension-info.json');
            if (await fs.pathExists(extensionFile)) {
                const extensionInfo = await fs.readJson(extensionFile);
                importedData.extensions = extensionInfo.extensionPaths || [];
            }

            // Load bookmarks
            const bookmarksFile = path.join(userDataDir, 'bookmarks.json');
            if (await fs.pathExists(bookmarksFile)) {
                importedData.bookmarks = await fs.readJson(bookmarksFile);
            }
        } catch (error) {
            console.warn(`Could not load imported data: ${error.message}`);
        }

        return importedData;
    }

    /**
     * Get Chrome launch arguments for extension support
     * @param {boolean} enableExtensionInstall - Enable manual extension installation
     * @param {Array<string>} loadExtensions - Array of extension paths to load
     * @returns {Array<string>} Launch arguments
     */
    getExtensionLaunchArgs(loadExtensions = []) {
        const args = [];

        // Load extensions using Playwright's method (only method that works)
        if (loadExtensions && loadExtensions.length > 0) {
            // Filter out invalid paths
            const validExtensions = loadExtensions.filter(ext => {
                if (!ext || typeof ext !== 'string') return false;
                try {
                    const exists = fs.existsSync(ext);
                    if (!exists) {
                        console.warn(`Extension path does not exist: ${ext}`);
                    }
                    return exists;
                } catch (error) {
                    console.warn(`Error checking extension path ${ext}:`, error.message);
                    return false;
                }
            });

            if (validExtensions.length > 0) {
                // Use Playwright's method: both flags are required together
                const extensionPaths = validExtensions.join(',');
                args.push(`--disable-extensions-except=${extensionPaths}`);
                args.push(`--load-extension=${extensionPaths}`);
                
                console.log(`📁 Injecting ${validExtensions.length} extension(s):`);
                validExtensions.forEach((ext, i) => console.log(`   ${i + 1}. ${ext}`));
            } else {
                console.warn('⚠️  No valid extension paths found');
            }
        }

        return args;
    }

    /**
     * Find extensions in the ./extensions folder for automatic loading
     * @returns {Promise<Array<string>>} Array of extension paths
     */
    async findAutoLoadExtensions() {
        const extensionsDir = path.resolve('./extensions');
        const extensionPaths = [];

        try {
            if (!await fs.pathExists(extensionsDir)) {
                return extensionPaths;
            }

            const extensionFolders = await fs.readdir(extensionsDir);
            
            for (const extensionId of extensionFolders) {
                const extensionPath = path.join(extensionsDir, extensionId);
                const stat = await fs.stat(extensionPath);
                
                if (stat.isDirectory()) {
                    // Look for version folders inside the extension folder
                    const versionFolders = await fs.readdir(extensionPath);
                    
                    for (const versionFolder of versionFolders) {
                        const versionPath = path.join(extensionPath, versionFolder);
                        const versionStat = await fs.stat(versionPath);
                        
                        if (versionStat.isDirectory()) {
                            // Check if manifest.json exists
                            const manifestPath = path.join(versionPath, 'manifest.json');
                            if (await fs.pathExists(manifestPath)) {
                                extensionPaths.push(versionPath);
                                console.log(`Found extension: ${extensionId} (${versionFolder})`);
                                break; // Use the first valid version found
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Could not scan extensions folder: ${error.message}`);
        }

        return extensionPaths;
    }

    /**
     * Verify if extensions are loaded in the browser context
     * @param {Object} context - Playwright browser context
     * @returns {Promise<Array>} List of loaded extensions
     */
    async verifyExtensionsLoaded(context) {
        try {
            const page = context.pages()[0] || await context.newPage();
            
            // Navigate to chrome://extensions/ to check loaded extensions
            await page.goto('chrome://extensions/');
            await page.waitForTimeout(2000); // Wait for page to load
            
            // Get extension information from the page
            const extensions = await page.evaluate(() => {
                const extensionItems = document.querySelectorAll('extensions-item');
                return Array.from(extensionItems).map(item => {
                    const nameElement = item.shadowRoot?.querySelector('#name');
                    const idElement = item.getAttribute('id');
                    return {
                        name: nameElement?.textContent?.trim() || 'Unknown',
                        id: idElement || 'Unknown'
                    };
                });
            });
            
            console.log(`🔍 Verification: Found ${extensions.length} loaded extension(s):`);
            extensions.forEach((ext, i) => {
                console.log(`   ${i + 1}. ${ext.name} (${ext.id})`);
            });
            
            return extensions;
        } catch (error) {
            console.warn(`⚠️  Could not verify extensions: ${error.message}`);
            return [];
        }
    }

    /**
     * Test fingerprint of an active browser session
     * @param {string} sessionId - Session ID
     * @param {Object} options - Test options
     * @returns {Object} Fingerprint test results
     */
    async testFingerprint(sessionId, options = {}) {
        const browserInfo = this.activeBrowsers.get(sessionId);
        if (!browserInfo) {
            throw new Error(`No active browser found for session: ${sessionId}`);
        }

        const page = browserInfo.context.pages()[0] || await browserInfo.context.newPage();
        
        console.log('🧪 Testing fingerprint for active session...');
        const results = await this.fingerprintTester.runComprehensiveTest(page, {
            saveResults: true,
            outputPath: path.join(browserInfo.profile.userDataDir, `fingerprint-test-${Date.now()}.json`),
            ...options
        });

        console.log(this.fingerprintTester.generateSummaryReport(results));
        return results;
    }

    /**
     * Update stealth configuration for an active session
     * @param {string} sessionId - Session ID
     * @param {Object} stealthConfig - New stealth configuration
     * @returns {boolean} Success status
     */
    async updateStealthConfig(sessionId, stealthConfig) {
        const browserInfo = this.activeBrowsers.get(sessionId);
        if (!browserInfo) {
            throw new Error(`No active browser found for session: ${sessionId}`);
        }

        try {
            console.log('🔄 Updating stealth configuration...');
            await this.stealthManager.applyStealthScripts(browserInfo.context, stealthConfig);
            console.log('✅ Stealth configuration updated');
            return true;
        } catch (error) {
            console.error('❌ Failed to update stealth configuration:', error.message);
            return false;
        }
    }

    /**
     * Save stealth configuration to profile
     * @param {string} profileId - Profile ID
     * @param {Object} stealthConfig - Stealth configuration to save
     */
    async saveStealthConfig(profileId, stealthConfig) {
        const profile = await this.profileManager.getProfile(profileId);
        const configPath = path.join(profile.userDataDir, 'stealth-config.json');
        await this.stealthManager.saveConfig(stealthConfig, configPath);
        console.log(`💾 Stealth config saved to: ${configPath}`);
    }

    /**
     * Load stealth configuration from profile
     * @param {string} profileId - Profile ID
     * @returns {Object} Stealth configuration
     */
    async loadStealthConfig(profileId) {
        const profile = await this.profileManager.getProfile(profileId);
        const configPath = path.join(profile.userDataDir, 'stealth-config.json');
        return await this.stealthManager.loadConfig(configPath);
    }

    /**
     * Compare fingerprints between two sessions or saved results
     * @param {string|Object} source1 - Session ID or fingerprint results
     * @param {string|Object} source2 - Session ID or fingerprint results
     * @returns {Object} Comparison results
     */
    async compareFingerprints(source1, source2) {
        let results1, results2;

        // Get results for source1
        if (typeof source1 === 'string') {
            results1 = await this.testFingerprint(source1, { saveResults: false });
        } else {
            results1 = source1;
        }

        // Get results for source2
        if (typeof source2 === 'string') {
            results2 = await this.testFingerprint(source2, { saveResults: false });
        } else {
            results2 = source2;
        }

        return this.fingerprintTester.compareResults(results1, results2);
    }

    /**
     * Get available stealth presets
     * @returns {Array} Available presets
     */
    getStealthPresets() {
        return [
            {
                name: 'minimal',
                description: 'Essential anti-bot protection only (WebGL spoofing, keeps everything else authentic)'
            },
            {
                name: 'balanced',
                description: 'Conservative protection (WebGL + minimal audio/canvas noise, keeps user agent and other info authentic)'
            },
            {
                name: 'maximum',
                description: 'Aggressive protection (all features enabled, may break some sites or look suspicious)'
            }
        ];
    }
}
