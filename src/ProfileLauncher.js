import { chromium, firefox, webkit } from 'playwright';
import path from 'path';
import fs from 'fs-extra';

export class ProfileLauncher {
    constructor(profileManager) {
        this.profileManager = profileManager;
        this.activeBrowsers = new Map();
    }

    async launchProfile(nameOrId, options = {}) {
        const {
            browserType = 'chromium',
            headless = false,
            devtools = false,
            viewport = { width: 1280, height: 720 },
            args = [],
            loadExtensions = [],
            autoLoadExtensions = true
        } = options;

        const profile = await this.profileManager.getProfile(nameOrId);
        const sessionId = await this.profileManager.startSession(profile.id, 'automation');

        let browser, context;
        
        try {
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
                
                // Prepare launch options
                const launchOptions = {
                    headless,
                    devtools,
                    viewport,
                    channel: 'chromium', // Required for extension loading
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--disable-features=VizDisplayCompositor',
                        // Session persistence and clean exit flags
                        '--disable-session-crashed-bubble',
                        '--disable-infobars',
                        '--no-crash-upload',
                        '--disable-crash-reporter',
                        '--restore-last-session',
                        '--disable-background-mode',
                        '--disable-hang-monitor',
                        ...this.getExtensionLaunchArgs(allExtensions),
                        ...args
                    ]
                };
                
                // Add extensions if available - for persistent context, extensions should be in user data dir
                if (importedData.extensions && importedData.extensions.length > 0) {
                    console.log(`Found ${importedData.extensions.length} extensions in profile`);
                    // Extensions are already copied to the profile directory during import
                    // Persistent context will load them automatically
                }
                
                // For Chromium, use persistent context
                context = await chromium.launchPersistentContext(profile.userDataDir, launchOptions);
                browser = context.browser();
                
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

            // Monitor browser disconnection for proper cleanup
            this.setupBrowserDisconnectMonitoring(sessionId, browserInfo);

            // For Chromium persistent context, use the existing page; for others, create new page
            const page = browserType === 'chromium' ? context.pages()[0] : await context.newPage();
            
            return {
                browser,
                context,
                profile,
                sessionId,
                page
            };
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

            // Mark clean exit for Chromium browsers
            if (browserInfo.browserType === 'chromium') {
                await this.markCleanExit(browserInfo.profile);
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

    /**
     * Set up monitoring for browser disconnection to handle unexpected exits
     * @param {string} sessionId - Session ID
     * @param {Object} browserInfo - Browser information object
     */
    setupBrowserDisconnectMonitoring(sessionId, browserInfo) {
        const { browser, context, profile, browserType } = browserInfo;
        
        // Monitor browser disconnection
        if (browser) {
            browser.on('disconnected', async () => {
                console.log(`🔌 Browser disconnected for session: ${sessionId}`);
                await this.handleBrowserDisconnect(sessionId, browserInfo);
            });
        }
        
        // Monitor context close for additional safety
        if (context) {
            context.on('close', async () => {
                console.log(`📋 Context closed for session: ${sessionId}`);
                // Only handle if browser is still in active sessions (not already cleaned up)
                if (this.activeBrowsers.has(sessionId)) {
                    await this.handleBrowserDisconnect(sessionId, browserInfo);
                }
            });
        }
    }

    /**
     * Handle browser disconnection and perform cleanup
     * @param {string} sessionId - Session ID
     * @param {Object} browserInfo - Browser information object
     */
    async handleBrowserDisconnect(sessionId, browserInfo) {
        try {
            console.log(`🧹 Cleaning up disconnected browser session: ${sessionId}`);
            
            // Mark exit as clean in Chrome preferences
            if (browserInfo.browserType === 'chromium') {
                await this.markCleanExit(browserInfo.profile);
            }
            
            // End session in database
            await this.profileManager.endSession(sessionId);
            
            // Clean up temporary profiles
            if (browserInfo.isTemporary) {
                await this.profileManager.deleteProfile(browserInfo.profile.id);
            }
            
            // Remove from active browsers
            this.activeBrowsers.delete(sessionId);
            
            console.log(`✅ Session ${sessionId} cleaned up successfully`);
            
        } catch (error) {
            console.error(`❌ Error cleaning up session ${sessionId}:`, error.message);
        }
    }

    /**
     * Mark Chrome profile as having exited cleanly
     * @param {Object} profile - Profile object
     */
    async markCleanExit(profile) {
        try {
            const preferencesPath = path.join(profile.userDataDir, 'Preferences');
            
            if (await fs.pathExists(preferencesPath)) {
                const preferences = await fs.readJson(preferencesPath);
                
                // Ensure profile section exists
                if (!preferences.profile) {
                    preferences.profile = {};
                }
                
                // Mark as clean exit
                preferences.profile.exit_type = 'Normal';
                preferences.profile.exited_cleanly = true;
                
                // Write back to file
                await fs.writeJson(preferencesPath, preferences, { spaces: 2 });
                
                console.log(`✅ Marked profile ${profile.name} as exited cleanly`);
            }
        } catch (error) {
            console.warn(`⚠️  Could not mark clean exit for profile ${profile.name}:`, error.message);
        }
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
}
