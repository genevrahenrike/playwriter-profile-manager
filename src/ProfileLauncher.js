import { chromium, firefox, webkit } from 'playwright';
import path from 'path';
import fs from 'fs-extra';

export class ProfileLauncher {
    constructor(profileManager) {
        this.profileManager = profileManager;
        this.activeBrowsers = new Map();
        this.cleanupInProgress = new Set(); // Track sessions being cleaned up
        this.automationTasks = new Map(); // Track automation tasks per session
        this.processedPages = new Map(); // Track processed pages to avoid duplicates
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
            enableAutomation = true, // Enable automation by default
            maxStealth = true, // Enable maximum stealth by default
            automationTasks = [] // Array of automation tasks to run
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
                
                // Prepare launch options with maximum stealth
                const stealthArgs = maxStealth ? this.getMaxStealthArgs() : [];
                const launchOptions = {
                    headless,
                    devtools,
                    viewport,
                    channel: 'chromium', // Required for extension loading
                    args: [
                        // Core stealth flags
                        '--disable-blink-features=AutomationControlled',
                        '--disable-features=VizDisplayCompositor',
                        '--exclude-switches=enable-automation',
                        '--disable-dev-shm-usage',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                        '--allow-running-insecure-content',
                        '--disable-features=TranslateUI',
                        '--disable-extensions-file-access-check',
                        '--disable-extensions-http-throttling',
                        '--disable-ipc-flooding-protection',
                        
                        // Session persistence and clean exit flags
                        '--disable-session-crashed-bubble',
                        '--disable-infobars',
                        '--no-crash-upload',
                        '--disable-crash-reporter',
                        '--restore-last-session',
                        '--disable-background-mode',
                        '--disable-hang-monitor',
                        
                        // Additional flags for better session handling
                        '--enable-session-service',
                        '--no-first-run',
                        '--disable-default-apps',
                        '--disable-component-update',
                        '--disable-background-networking',
                        '--disable-sync',
                        
                        // Prevent Chrome from interfering with shutdown
                        '--disable-background-timer-throttling',
                        '--disable-renderer-backgrounding',
                        '--disable-backgrounding-occluded-windows',
                        
                        // Maximum stealth flags
                        ...stealthArgs,
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
            
            // Setup automation if enabled
            if (enableAutomation) {
                await this.setupAutomation(sessionId, { browser, context, profile, page }, automationTasks);
            }
            
            return {
                browser,
                context,
                profile,
                sessionId,
                page,
                automationEnabled: enableAutomation
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

    async closeBrowser(sessionId, options = {}) {
        const { clearCache = false } = options;
        const browserInfo = this.activeBrowsers.get(sessionId);
        if (!browserInfo) {
            throw new Error(`No active browser found for session: ${sessionId}`);
        }

        // Prevent race condition with disconnect handlers
        this.cleanupInProgress.add(sessionId);

        try {
            // Proactively prepare for clean shutdown
            if (browserInfo.browserType === 'chromium') {
                await this.prepareCleanShutdown(browserInfo);
            }

            // Save storage state for non-Chromium browsers
            if (browserInfo.context && browserInfo.browserType !== 'chromium') {
                const storageStatePath = path.join(browserInfo.profile.userDataDir, 'storage-state.json');
                await browserInfo.context.storageState({ path: storageStatePath });
            }

            // Mark clean exit for Chromium browsers
            if (browserInfo.browserType === 'chromium') {
                await this.markCleanExit(browserInfo.profile);
            }

            // Close context and browser gracefully
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
            
            // Clear cache if requested
            let cacheCleared = null;
            if (clearCache && !browserInfo.isTemporary) {
                try {
                    console.log(`🧹 Clearing cache for profile: ${browserInfo.profile.name}`);
                    const cacheResults = await this.profileManager.clearCacheDirectories(browserInfo.profile.userDataDir);
                    cacheCleared = {
                        success: true,
                        sizeCleared: this.profileManager.formatBytes(cacheResults.totalSizeCleared),
                        details: cacheResults
                    };
                    console.log(`✅ Cache cleared: ${cacheCleared.sizeCleared} freed`);
                } catch (error) {
                    console.warn(`⚠️  Could not clear cache: ${error.message}`);
                    cacheCleared = {
                        success: false,
                        error: error.message
                    };
                }
            }
            
            this.activeBrowsers.delete(sessionId);
            this.cleanupProcessedPages(sessionId);
            
            return {
                profile: browserInfo.profile,
                duration: new Date() - browserInfo.startTime,
                cacheCleared
            };
        } catch (error) {
            throw new Error(`Failed to close browser: ${error.message}`);
        } finally {
            // Always remove from cleanup tracking
            this.cleanupInProgress.delete(sessionId);
        }
    }

    async closeAllBrowsers(options = {}) {
        const results = [];
        const sessionIds = Array.from(this.activeBrowsers.keys());
        
        for (const sessionId of sessionIds) {
            try {
                const result = await this.closeBrowser(sessionId, options);
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
        // Prevent duplicate cleanup
        if (this.cleanupInProgress.has(sessionId)) {
            return;
        }
        
        // Check if session still exists
        if (!this.activeBrowsers.has(sessionId)) {
            return;
        }
        
        // Mark cleanup as in progress
        this.cleanupInProgress.add(sessionId);
        
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
        } finally {
            // Always remove from cleanup tracking
            this.cleanupInProgress.delete(sessionId);
        }
    }

    /**
     * Prepare Chrome browser for clean shutdown by saving current state
     * @param {Object} browserInfo - Browser information object
     */
    async prepareCleanShutdown(browserInfo) {
        try {
            const { context, profile } = browserInfo;
            
            if (!context) return;
            
            console.log(`🔄 Preparing clean shutdown for profile: ${profile.name}`);
            
            // Force save current session state by navigating to a safe URL
            // This triggers Chrome's session saving mechanisms
            const pages = await context.pages();
            if (pages.length > 0) {
                // Get current tab URLs for potential restoration
                const tabUrls = [];
                for (const page of pages) {
                    try {
                        const url = page.url();
                        if (url && !url.startsWith('chrome://') && !url.startsWith('about:')) {
                            tabUrls.push(url);
                        }
                    } catch (error) {
                        // Ignore errors getting URL from individual pages
                    }
                }
                
                // Store URLs in a file for potential manual recovery
                if (tabUrls.length > 0) {
                    const sessionBackupPath = path.join(profile.userDataDir, 'last-session-backup.json');
                    await fs.writeJson(sessionBackupPath, {
                        timestamp: new Date().toISOString(),
                        urls: tabUrls,
                        sessionId: browserInfo.sessionId
                    }, { spaces: 2 });
                }
            }
            
            // Give Chrome a moment to process any pending writes
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.warn(`⚠️  Could not prepare clean shutdown: ${error.message}`);
        }
    }

    /**
     * Mark Chrome profile as having exited cleanly
     * @param {Object} profile - Profile object
     */
    async markCleanExit(profile) {
        try {
            // Mark clean exit in main Preferences file
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
            }

            // Mark clean exit in Default profile preferences (where session data is stored)
            const defaultPreferencesPath = path.join(profile.userDataDir, 'Default', 'Preferences');
            if (await fs.pathExists(defaultPreferencesPath)) {
                const defaultPreferences = await fs.readJson(defaultPreferencesPath);
                
                // Ensure profile section exists
                if (!defaultPreferences.profile) {
                    defaultPreferences.profile = {};
                }
                
                // Mark as clean exit
                defaultPreferences.profile.exit_type = 'Normal';
                defaultPreferences.profile.exited_cleanly = true;
                
                // Clean up session event log to remove any crash markers
                if (defaultPreferences.sessions && defaultPreferences.sessions.event_log) {
                    const eventLog = defaultPreferences.sessions.event_log;
                    // Remove any crashed events and add a clean exit event
                    const cleanEventLog = eventLog.filter(event => event.type !== 0 || !event.crashed);
                    
                    // Add a clean exit event
                    cleanEventLog.push({
                        crashed: false,
                        time: String(Date.now() * 1000 + 11644473600000000), // Chrome timestamp format
                        type: 0
                    });
                    
                    defaultPreferences.sessions.event_log = cleanEventLog;
                }
                
                // Write back to file
                await fs.writeJson(defaultPreferencesPath, defaultPreferences, { spaces: 2 });
            }
            
            console.log(`✅ Marked profile ${profile.name} as exited cleanly`);
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
        const defaultPreferencesPath = path.join(profile.userDataDir, 'Default', 'Preferences');
        
        try {
            // Ensure directories exist
            await fs.ensureDir(profile.userDataDir);
            await fs.ensureDir(path.join(profile.userDataDir, 'Default'));
            
            // Setup main preferences
            let preferences = {};
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
            preferences.profile.exit_type = 'Normal';
            preferences.profile.exited_cleanly = true;
            
            // Write main preferences
            await fs.writeJson(preferencesPath, preferences, { spaces: 2 });
            
            // Setup Default profile preferences for session management
            let defaultPreferences = {};
            if (await fs.pathExists(defaultPreferencesPath)) {
                defaultPreferences = await fs.readJson(defaultPreferencesPath);
            }
            
            // Ensure profile section exists in default preferences
            if (!defaultPreferences.profile) {
                defaultPreferences.profile = {};
            }
            
            // Set clean exit state
            defaultPreferences.profile.exit_type = 'Normal';
            defaultPreferences.profile.exited_cleanly = true;
            defaultPreferences.profile.name = profile.name;
            
            // Configure session restoration settings
            if (!defaultPreferences.session) {
                defaultPreferences.session = {};
            }
            
            // Set startup to restore last session
            if (!defaultPreferences.session.startup_urls) {
                defaultPreferences.session.startup_urls = [];
            }
            
            // Configure to continue where left off
            defaultPreferences.session.restore_on_startup = 1; // 1 = Continue where you left off
            
            // Initialize clean session event log
            if (!defaultPreferences.sessions) {
                defaultPreferences.sessions = {};
            }
            if (!defaultPreferences.sessions.event_log) {
                defaultPreferences.sessions.event_log = [];
            }
            
            // Write default preferences
            await fs.writeJson(defaultPreferencesPath, defaultPreferences, { spaces: 2 });
            
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
     * Get maximum stealth Chrome arguments
     * @returns {Array<string>} Array of Chrome arguments for maximum stealth
     */
    getMaxStealthArgs() {
        return [
            // WebDriver detection prevention
            '--disable-blink-features=AutomationControlled',
            '--exclude-switches=enable-automation',
            '--disable-dev-shm-usage',
            
            // Bot detection evasion
            '--disable-features=VizDisplayCompositor,TranslateUI,BlinkGenPropertyTrees',
            '--disable-ipc-flooding-protection',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-field-trial-config',
            '--disable-back-forward-cache',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-default-apps',
            '--no-default-browser-check',
            '--no-first-run',
            
            // WebGL and canvas fingerprinting
            '--disable-gpu-sandbox',
            '--ignore-gpu-blacklist',
            '--enable-gpu-rasterization',
            '--disable-accelerated-2d-canvas',
            
            // Audio fingerprinting
            '--disable-background-media-suspend',
            '--autoplay-policy=no-user-gesture-required',
            
            // Network fingerprinting
            '--disable-features=NetworkService',
            '--disable-extensions-http-throttling',
            '--disable-extensions-file-access-check',
            
            // Additional stealth flags
            '--disable-component-extensions-with-background-pages',
            '--disable-component-update',
            '--no-pings',
            '--no-crash-upload',
            '--disable-crash-reporter',
            '--disable-breakpad',
            '--disable-domain-reliability',
            '--disable-background-networking',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-report-upload',
            '--disable-logging',
            '--silent-debugger-extension-api',
        ];
    }

    /**
     * Setup automation capabilities for a browser session
     * @param {string} sessionId - Session ID
     * @param {Object} browserInfo - Browser information object
     * @param {Array} automationTasks - Array of automation tasks to run
     */
    async setupAutomation(sessionId, browserInfo, automationTasks = []) {
        const { browser, context, profile, page } = browserInfo;
        
        console.log(`🤖 Setting up automation for session: ${sessionId}`);
        
        // Add stealth scripts to prevent detection
        await this.addStealthScripts(context);
        
        // Setup default automation tasks
        const defaultTasks = [
            {
                name: 'vidiq-tab-detection',
                description: 'Detect VidIQ extension install tab',
                enabled: true,
                targetUrl: 'https://app.vidiq.com/extension_install'
            }
        ];
        
        const allTasks = [...defaultTasks, ...automationTasks];
        this.automationTasks.set(sessionId, allTasks);
        
        // Start monitoring for automation tasks
        await this.startAutomationMonitoring(sessionId, browserInfo);
        
        console.log(`✅ Automation setup complete for ${profile.name}`);
        console.log(`🎯 Active automation tasks: ${allTasks.length}`);
        allTasks.forEach(task => {
            if (task.enabled) {
                console.log(`   • ${task.name}: ${task.description}`);
            }
        });
    }

    /**
     * Add stealth scripts to prevent automation detection
     * @param {Object} context - Browser context
     */
    async addStealthScripts(context) {
        // Remove webdriver property and other automation indicators
        await context.addInitScript(() => {
            // Remove webdriver property
            delete Object.getPrototypeOf(navigator).webdriver;
            delete navigator.webdriver;
            
            // Override permissions API
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format", enabledPlugin: Plugin},
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    },
                    {
                        0: {type: "application/pdf", suffixes: "pdf", description: "", enabledPlugin: Plugin},
                        description: "",
                        filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                        length: 1,
                        name: "Chrome PDF Viewer"
                    },
                    {
                        0: {type: "application/x-nacl", suffixes: "", description: "Native Client Executable", enabledPlugin: Plugin},
                        1: {type: "application/x-pnacl", suffixes: "", description: "Portable Native Client Executable", enabledPlugin: Plugin},
                        description: "",
                        filename: "internal-nacl-plugin",
                        length: 2,
                        name: "Native Client"
                    }
                ],
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            
            // Override webgl vendor/renderer
            const getParameter = WebGLRenderingContext.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return 'Intel Inc.';
                }
                if (parameter === 37446) {
                    return 'Intel Iris OpenGL Engine';
                }
                return getParameter(parameter);
            };
        });
    }

    /**
     * Start monitoring for automation tasks
     * @param {string} sessionId - Session ID
     * @param {Object} browserInfo - Browser information object
     */
    async startAutomationMonitoring(sessionId, browserInfo) {
        const { context } = browserInfo;
        const tasks = this.automationTasks.get(sessionId) || [];
        
        // Monitor for new pages/tabs
        context.on('page', async (page) => {
            console.log(`📄 New tab detected in session: ${sessionId}`);
            
            // Wait for page to load
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                const url = page.url();
                console.log(`🔗 Tab URL: ${url}`);
                
                // Check against automation tasks
                for (const task of tasks) {
                    if (task.enabled && this.urlMatches(url, task.targetUrl)) {
                        console.log(`🎯 AUTOMATION MATCH: ${task.name}`);
                        console.log(`   Task: ${task.description}`);
                        console.log(`   Target URL: ${task.targetUrl}`);
                        console.log(`   Actual URL: ${url}`);
                        console.log(`   Session: ${sessionId}`);
                        
                        // Execute task-specific actions
                        await this.executeAutomationTask(task, page, sessionId);
                    }
                }
            } catch (error) {
                console.log(`⚠️  Could not process new tab: ${error.message}`);
            }
        });
        
        // Also check existing pages
        const existingPages = context.pages();
        for (const page of existingPages) {
            try {
                const url = page.url();
                if (url && url !== 'about:blank') {
                    console.log(`🔍 Checking existing tab: ${url}`);
                    
                    for (const task of tasks) {
                        if (task.enabled && this.urlMatches(url, task.targetUrl)) {
                            console.log(`🎯 AUTOMATION MATCH (existing): ${task.name}`);
                            console.log(`   Task: ${task.description}`);
                            console.log(`   Target URL: ${task.targetUrl}`);
                            console.log(`   Actual URL: ${url}`);
                            console.log(`   Session: ${sessionId}`);
                            
                            await this.executeAutomationTask(task, page, sessionId);
                        }
                    }
                }
            } catch (error) {
                console.log(`⚠️  Could not check existing tab: ${error.message}`);
            }
        }
    }

    /**
     * Check if URL matches target URL pattern
     * @param {string} url - Current URL
     * @param {string} targetUrl - Target URL pattern
     * @returns {boolean} Whether URL matches
     */
    urlMatches(url, targetUrl) {
        if (!url || !targetUrl) return false;
        
        // Simple starts-with matching for now
        return url.startsWith(targetUrl);
    }

    /**
     * Execute automation task
     * @param {Object} task - Automation task
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async executeAutomationTask(task, page, sessionId) {
        // Create a unique key for this page and task combination
        const pageKey = `${sessionId}-${page.url()}-${task.name}`;
        
        // Check if we've already processed this page for this task
        if (this.processedPages.has(pageKey)) {
            console.log(`⏭️  Skipping ${task.name} - already processed for this page`);
            return;
        }
        
        // Mark this page as processed
        this.processedPages.set(pageKey, true);
        
        console.log(`🚀 Executing automation task: ${task.name}`);
        
        try {
            switch (task.name) {
                case 'vidiq-tab-detection':
                    await this.handleVidIQTabDetection(page, sessionId);
                    break;
                default:
                    console.log(`   No specific handler for task: ${task.name}`);
            }
        } catch (error) {
            console.error(`❌ Error executing automation task ${task.name}:`, error.message);
            // Remove from processed pages on error so it can be retried
            this.processedPages.delete(pageKey);
        }
    }

    /**
     * Handle VidIQ tab detection
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async handleVidIQTabDetection(page, sessionId) {
        console.log(`🔍 VidIQ Extension Install page detected!`);
        console.log(`   Session: ${sessionId}`);
        console.log(`   URL: ${page.url()}`);
        console.log(`   Title: ${await page.title()}`);
        
        // Wait briefly for page to start loading
        await page.waitForTimeout(2000);
        
        // Check for specific elements on the VidIQ install page
        try {
            const pageContent = await page.textContent('body');
            if (pageContent && pageContent.includes('extension')) {
                console.log(`✅ Confirmed: VidIQ extension install page loaded successfully`);
                console.log(`📊 Page contains extension-related content`);
            }
            
            // Check for extension install button or similar elements
            const installButton = await page.locator('text=/install|add to chrome|get extension/i').first();
            if (await installButton.count() > 0) {
                console.log(`🎯 Found extension install button on page`);
            }
            
        } catch (error) {
            console.log(`⚠️  Could not analyze page content: ${error.message}`);
        }
        
        // Look for and autofill form fields
        await this.handleVidIQFormAutofill(page, sessionId);
        
        console.log(`🤖 Automation task completed for VidIQ tab detection`);
    }

    /**
     * Handle VidIQ form autofill
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async handleVidIQFormAutofill(page, sessionId) {
        console.log(`📝 Checking for VidIQ forms to autofill...`);
        
        try {
            // Test credentials for automation testing
            const testEmail = 'test.automation@example.com';
            const testPassword = 'TestPass123!';
            
            // Periodic check for form fields with smart polling
            console.log(`⏳ Polling for form fields to appear...`);
            
            const maxAttempts = 5; // Check up to 5 times
            const pollInterval = 1000; // Check every 1 second
            let attempt = 0;
            let fieldsFound = false;
            
            while (attempt < maxAttempts && !fieldsFound) {
                attempt++;
                
                // Check if form fields exist
                const emailExists = await page.locator('input[data-testid="form-input-email"]').count() > 0;
                const passwordExists = await page.locator('input[data-testid="form-input-password"]').count() > 0;
                
                if (emailExists || passwordExists) {
                    fieldsFound = true;
                    console.log(`✅ Form fields found on attempt ${attempt}! Proceeding with autofill...`);
                    break;
                } else {
                    console.log(`🔍 Attempt ${attempt}/${maxAttempts}: No form fields yet, waiting 1s...`);
                    await page.waitForTimeout(pollInterval);
                }
            }
            
            if (!fieldsFound) {
                console.log(`⏰ Polling complete: No form fields found after ${maxAttempts} attempts (5 seconds)`);
            }
            
            // Small buffer to ensure fields are fully interactive
            await page.waitForTimeout(200);
            
            // Look for email input field
            const emailField = page.locator('input[data-testid="form-input-email"]');
            if (await emailField.count() > 0) {
                console.log(`📧 Found email field, filling with test data...`);
                await emailField.clear();
                await emailField.fill(testEmail);
                console.log(`✅ Email field filled: ${testEmail}`);
            } else {
                console.log(`📧 Email field not found (may not be on this page)`);
            }
            
            // Look for password input field
            const passwordField = page.locator('input[data-testid="form-input-password"]');
            if (await passwordField.count() > 0) {
                console.log(`🔒 Found password field, filling with test data...`);
                await passwordField.clear();
                await passwordField.fill(testPassword);
                console.log(`✅ Password field filled: ${'*'.repeat(testPassword.length)}`);
            } else {
                console.log(`🔒 Password field not found (may not be on this page)`);
            }
            
            // Additional form fields detection
            const allInputs = await page.locator('input').count();
            console.log(`🔍 Total input fields found on page: ${allInputs}`);
            
            // Check if both fields were found and filled
            const emailFilled = await emailField.count() > 0;
            const passwordFilled = await passwordField.count() > 0;
            
            if (emailFilled && passwordFilled) {
                console.log(`🎉 SUCCESS: Both email and password fields autofilled!`);
                
                // Optional: Look for submit button (but don't click it automatically)
                const submitButton = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Register"), button:has-text("Create account")');
                if (await submitButton.count() > 0) {
                    console.log(`🔘 Found submit button (not clicking automatically for safety)`);
                }
            } else if (emailFilled || passwordFilled) {
                console.log(`⚠️  Partial success: Only some fields were found and filled`);
            } else {
                console.log(`ℹ️  No target form fields found on this page`);
            }
            
        } catch (error) {
            console.error(`❌ Error during form autofill: ${error.message}`);
        }
    }

    /**
     * Clean up processed pages for a session
     * @param {string} sessionId - Session ID
     */
    cleanupProcessedPages(sessionId) {
        const keysToDelete = [];
        for (const [key] of this.processedPages) {
            if (key.startsWith(`${sessionId}-`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.processedPages.delete(key));
    }
}
