import { chromium, firefox, webkit } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { AutofillHookSystem } from './AutofillHookSystem.js';
import { RequestCaptureSystem } from './RequestCaptureSystem.js';
import { StealthManager } from './StealthManager.js';
import { AutomationHookSystem } from './AutomationHookSystem.js';
import { ProfileEventBus, EVENTS } from './ProfileEventBus.js';
import { ProxyManager } from './ProxyManager.js';

export class ProfileLauncher {
    constructor(profileManager, options = {}) {
        this.profileManager = profileManager;
        this.activeBrowsers = new Map();
        this.cleanupInProgress = new Set(); // Track sessions being cleaned up
        this.automationTasks = new Map(); // Track automation tasks per session
        this.processedPages = new Map(); // Track processed pages to avoid duplicates
        
        // Initialize EventBus for coordinating between systems
        this.eventBus = new ProfileEventBus();
        
        // Initialize the autofill hook system with tracking enabled
        this.autofillSystem = new AutofillHookSystem({
            enableTracking: true,
            trackingDbPath: './profiles/data/generated_names.db',
            eventBus: this.eventBus,
            usePrefix: false,
            usePostfix: true,
            // Pass through autofill behavior options
            stopOnSuccess: options.autofillStopOnSuccess !== false, // true by default
            enforceMode: options.autofillEnforceMode || false,
            minFieldsForSuccess: options.autofillMinFields || 2,
            successCooldown: options.autofillCooldown || 30000,
            ...options.autofillOptions
        });
        
        // Initialize the request capture system
        this.requestCaptureSystem = new RequestCaptureSystem({
            outputFormat: 'jsonl',
            outputDirectory: './captured-requests',
            maxCaptureSize: 1000
        });
        
        // Initialize the automation hook system
        this.automationSystem = new AutomationHookSystem({
            maxRetries: 3,
            defaultTimeout: 30000,
            humanDelayMin: 500,
            humanDelayMax: 2000,
            eventBus: this.eventBus
        });
        
        this.initializeAutofillSystem();
        this.initializeRequestCaptureSystem();
        this.initializeAutomationSystem();
        
        // Initialize stealth manager
        this.stealthManager = new StealthManager();
        
        // Initialize proxy manager
        this.proxyManager = new ProxyManager();
        // Note: Proxies will be loaded asynchronously when first needed
    }

    /**
     * Initialize the autofill hook system
     */
    async initializeAutofillSystem() {
        try {
            await this.autofillSystem.loadHooks('./autofill-hooks');
            console.log(`🎯 Autofill system initialized with ${this.autofillSystem.getStatus().totalHooks} hooks`);
        } catch (error) {
            console.warn(`⚠️  Could not initialize autofill system: ${error.message}`);
        }
    }

    /**
     * Initialize the request capture system
     */
    async initializeRequestCaptureSystem() {
        try {
            await this.requestCaptureSystem.loadHooks('./capture-hooks');
            console.log(`� Request capture system initialized with ${this.requestCaptureSystem.getStatus().totalHooks} hooks`);
        } catch (error) {
            console.error('❌ Failed to initialize request capture system:', error.message);
        }
    }

    /**
     * Initialize the automation hook system
     */
    async initializeAutomationSystem() {
        try {
            await this.automationSystem.loadHooks('./automation-hooks');
            console.log(`🤖 Automation system initialized with ${this.automationSystem.getStatus().hooksLoaded} hooks`);
        } catch (error) {
            console.error('❌ Failed to initialize automation system:', error.message);
        }
    }

    /**
     * Initialize the proxy manager
     */
    async initializeProxyManager() {
        try {
            await this.proxyManager.loadProxies();
            const { total } = this.proxyManager.getAllProxies();
            if (total > 0) {
                console.log(`🌐 Proxy manager initialized with ${total} working proxies`);
            }
        } catch (error) {
            console.warn(`⚠️  Could not initialize proxy manager: ${error.message}`);
        }
    }

    /**
     * Ensure proxies are loaded before use
     */
    async ensureProxiesLoaded() {
        const { total } = this.proxyManager.getAllProxies();
        if (total === 0) {
            await this.initializeProxyManager();
        }
    }

    /**
     * Generate a profile-specific VidIQ device ID
     * @param {string} profileName - The profile name
     * @returns {string} A consistent UUID for this profile
     */
    generateProfileDeviceId(profileName) {
        const hash = crypto.createHash('sha256').update(profileName + '-vidiq-device-v1').digest('hex');
        
        // Format as UUID v4
        return [
            hash.substring(0, 8),
            hash.substring(8, 12),
            '4' + hash.substring(13, 16), // Version 4 UUID
            ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20), // Variant bits
            hash.substring(20, 32)
        ].join('-');
    }

    /**
     * Generate a profile-specific extension key
     * @param {string} profileName - The profile name
     * @returns {string} A profile-specific base64 extension key
     */
    generateProfileExtensionKey(profileName) {
        const hash = crypto.createHash('sha256').update(profileName + '-vidiq-extension-key-v1').digest('hex');
        
        // Create a deterministic but profile-specific RSA public key structure
        // This mimics the original key format but with profile-specific data
        const keyData = Buffer.from(hash.substring(0, 128), 'hex');
        return keyData.toString('base64');
    }

    /**
     * Create a profile-specific VidIQ extension with modified key
     * @param {string} profileName - The profile name
     * @returns {string} Path to the modified extension
     */
    async createProfileVidiqExtension(profileName) {
        const originalExtensionPath = './extensions/pachckjkecffpdphbpmfolblodfkgbhl/3.151.0_0';
        const profileExtensionPath = `./profiles/data/vidiq-extensions/${profileName}-vidiq-extension`;
        
        // Always create fresh extension copy (remove any existing one first)
        if (await fs.pathExists(profileExtensionPath)) {
            await fs.remove(profileExtensionPath);
        }
        
        console.log(`🔧 Creating fresh VidIQ extension copy for: ${profileName}`);
        
        // Create directory for profile extensions
        await fs.ensureDir(path.dirname(profileExtensionPath));
        
        // Copy the original extension
        await fs.copy(originalExtensionPath, profileExtensionPath);
        
        // Generate profile-specific extension key
        const profileExtensionKey = this.generateProfileExtensionKey(profileName);
        
        // Read and modify the manifest.json
        const manifestPath = path.join(profileExtensionPath, 'manifest.json');
        const manifest = await fs.readJson(manifestPath);
        
        // Replace the extension key with profile-specific one
        manifest.key = profileExtensionKey;
        
        // Write the modified manifest
        await fs.writeJson(manifestPath, manifest, { spaces: 2 });
        
        console.log(`🔑 Modified VidIQ extension key for profile: ${profileName}`);
        console.log(`📁 Profile extension created at: ${profileExtensionPath}`);
        
        return profileExtensionPath;
    }

    /**
     * Setup VidIQ device ID spoofing for a context
     * @param {object} context - Playwright context
     * @param {string} profileName - Profile name for generating consistent device ID
     */
    async setupVidiqDeviceIdSpoofing(context, profileName) {
        const profileDeviceId = this.generateProfileDeviceId(profileName);
        
        console.log(`🎭 Setting up VidIQ device ID spoofing: ${profileDeviceId}`);
        
        // Intercept all VidIQ API requests and modify device ID
        await context.route('**/api.vidiq.com/**', async (route, request) => {
            const headers = await request.allHeaders();
            
            // Replace the device ID header
            headers['x-vidiq-device-id'] = profileDeviceId;
            
            await route.continue({
                headers: headers
            });
        });
        
        // Also intercept app.vidiq.com requests that might contain device ID
        await context.route('**/app.vidiq.com/**', async (route, request) => {
            const headers = await request.allHeaders();
            
            if (headers['x-vidiq-device-id']) {
                headers['x-vidiq-device-id'] = profileDeviceId;
            }
            
            await route.continue({
                headers: headers
            });
        });
        
        // Inject script to override device ID generation in the extension
        await context.addInitScript((deviceId) => {
            // Override any potential device ID generation in the page context
            if (typeof window !== 'undefined') {
                // Store the device ID for any VidIQ scripts
                window.__VIDIQ_DEVICE_ID_OVERRIDE__ = deviceId;
                
                // Override localStorage/sessionStorage device ID storage
                const originalSetItem = Storage.prototype.setItem;
                Storage.prototype.setItem = function(key, value) {
                    if (key && key.toLowerCase().includes('device') && key.toLowerCase().includes('id')) {
                        console.log(`🎭 Overriding storage device ID: ${key} -> ${deviceId}`);
                        value = deviceId;
                    }
                    return originalSetItem.call(this, key, value);
                };
            }
        }, profileDeviceId);
        
        return profileDeviceId;
    }

    /**
     * Generate authentic but randomized fingerprint configuration
     * @param {string} profileName - The profile name for seed
     * @param {object} options - Randomization options
     * @returns {object} Randomized fingerprint configuration
     */
    generateRandomizedFingerprint(profileName, options = {}) {
        const {
            varyScreenResolution = false, // Enable Mac-authentic screen resolution variation
            varyWebGL = false, // Keep disabled for Mac authenticity by default
            audioNoiseRange = [0.0001, 0.001], // Audio noise variation range
            canvasNoiseRange = [0.001, 0.005] // Canvas noise variation range
        } = options;
        const hash = crypto.createHash('sha256').update(profileName + '-fingerprint-seed-v1').digest('hex');
        const seed = parseInt(hash.substring(0, 8), 16);
        
        // Seeded random function for consistent randomization per profile
        const seededRandom = (min = 0, max = 1) => {
            const x = Math.sin(seed * 9999) * 10000;
            const random = x - Math.floor(x);
            return min + random * (max - min);
        };

        // Authentic Mac WebGL vendor/renderer combinations only
        const webglConfigs = [
            { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
            { vendor: 'Intel Inc.', renderer: 'Intel Iris Plus Graphics OpenGL Engine' },
            { vendor: 'Intel Inc.', renderer: 'Intel UHD Graphics 630 OpenGL Engine' },
            { vendor: 'Intel Inc.', renderer: 'Intel HD Graphics 530 OpenGL Engine' },
            { vendor: 'Intel Inc.', renderer: 'Intel Iris Pro 5200 OpenGL Engine' },
            { vendor: 'Apple', renderer: 'Apple M1' },
            { vendor: 'Apple', renderer: 'Apple M1 Pro' },
            { vendor: 'Apple', renderer: 'Apple M1 Max' },
            { vendor: 'Apple', renderer: 'Apple M2' }
        ];

        // Authentic Mac screen resolution combinations (common Mac display sizes)
        const macScreenConfigs = [
            // MacBook Air 13" (2020+)
            { width: 1440, height: 900, availWidth: 1440, availHeight: 870, name: "MacBook Air 13\"" },
            // MacBook Pro 13" (2016+)  
            { width: 1680, height: 1050, availWidth: 1680, availHeight: 1010, name: "MacBook Pro 13\"" },
            // MacBook Pro 14" (M1/M2)
            { width: 1728, height: 1117, availWidth: 1728, availHeight: 1087, name: "MacBook Pro 14\"" },
            // MacBook Pro 16" (2019+)
            { width: 1792, height: 1120, availWidth: 1792, availHeight: 1090, name: "MacBook Pro 16\"" },
            // iMac 21.5" (1080p)
            { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, name: "iMac 21.5\"" },
            // iMac 24" (M1)
            { width: 2240, height: 1260, availWidth: 2240, availHeight: 1220, name: "iMac 24\"" },
            // Studio Display / iMac 27" (1440p)
            { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, name: "iMac 27\" / Studio Display" },
            // Pro Display XDR / iMac Pro (4K)
            { width: 2880, height: 1800, availWidth: 2880, availHeight: 1760, name: "iMac Pro / Pro Display XDR" }
        ];

        // Select configurations based on seeded random
        const webglIndex = Math.floor(seededRandom(0, webglConfigs.length));
        const screenIndex = Math.floor(seededRandom(0, macScreenConfigs.length));
        const selectedWebGL = webglConfigs[webglIndex];
        const selectedScreen = macScreenConfigs[screenIndex];

        return {
            // WebGL - DISABLED for Mac authenticity (use real hardware)
            webgl: {
                enabled: false // Keep real WebGL for Mac authenticity
            },

            // Audio fingerprinting with variation (safe - minimal noise)
            audio: {
                enabled: true,
                noiseAmount: seededRandom(audioNoiseRange[0], audioNoiseRange[1]),
                enableAudioContext: true
            },

            // Canvas fingerprinting with variation (safe - minimal noise)
            canvas: {
                enabled: true,
                noiseAmount: seededRandom(canvasNoiseRange[0], canvasNoiseRange[1])
            },

            // Screen variation - Optional Mac-authentic resolution variation
            screen: {
                enabled: varyScreenResolution,
                ...selectedScreen,
                colorDepth: 24,
                pixelDepth: 24
            },

            // Keep authentic (no randomization for these)
            timezone: {
                enabled: false // Keep real timezone for authenticity
            },

            languages: {
                enabled: false // Keep real languages for authenticity
            },

            userAgent: {
                enabled: false // Keep real user agent for authenticity
            }
        };
    }

    /**
     * Launch profile from template with randomized fingerprint
     * @param {string} templateProfile - Template profile to clone from
     * @param {string} newProfileName - Name for the new profile instance
     * @param {object} options - Launch options
     * @returns {object} Launch result
     */
    async launchFromTemplate(templateProfile, newProfileName, options = {}) {
        const {
            randomizeFingerprint = true,
            enableFingerprintVariation = true,
            stealthPreset = 'balanced',
            varyScreenResolution = false, // Optional Mac-authentic screen resolution variation
            varyWebGL = false, // Keep disabled for Mac authenticity
            audioNoiseRange = [0.0001, 0.001],
            canvasNoiseRange = [0.001, 0.005],
            isTemporary = false, // Default to permanent profiles
            disableCompression = undefined,
            ...launchOptions
        } = options;

        console.log(`🎭 Launching ${newProfileName} from template: ${templateProfile}`);

        // Get template profile
        const template = await this.profileManager.getProfile(templateProfile);
        if (!template) {
            throw new Error(`Template profile '${templateProfile}' not found`);
        }
        // Debug: show template identifiers and compression state
        try {
            const { dirPath: tDir, archivePath: tArch } = this.profileManager.getProfileStoragePaths(template);
            const tCompressed = await this.profileManager.isCompressed(template);
            console.log(`🔎 Template profile: ${template.name} (${template.id})`);
            console.log(`   • dir: ${tDir}`);
            console.log(`   • archive: ${tArch} (compressed=${tCompressed})`);
        } catch (_) {}

        // Generate randomized fingerprint for this profile instance
        let fingerprintConfig = {};
        if (randomizeFingerprint) {
            const fingerprintOptions = {
                varyScreenResolution,
                varyWebGL,
                audioNoiseRange,
                canvasNoiseRange
            };
            fingerprintConfig = this.generateRandomizedFingerprint(newProfileName, fingerprintOptions);
            console.log(`🎲 Generated randomized fingerprint for: ${newProfileName}`);
            console.log(`   WebGL: AUTHENTIC (Mac hardware - no spoofing)`);
            console.log(`   Audio noise: ${fingerprintConfig.audio.noiseAmount.toFixed(6)}`);
            console.log(`   Canvas noise: ${fingerprintConfig.canvas.noiseAmount.toFixed(6)}`);
            if (varyScreenResolution) {
                console.log(`   Screen: ${fingerprintConfig.screen.width}x${fingerprintConfig.screen.height} (${fingerprintConfig.screen.name})`);
            } else {
                console.log(`   Screen: AUTHENTIC (real resolution)`);
            }
        }

        // Robustly ensure template has data and clone from it
        try {
            const { dirPath: templateDir, archivePath: templateArchive } = this.profileManager.getProfileStoragePaths(template);
            let dirExists = await fs.pathExists(templateDir);
            let archiveExists = await fs.pathExists(templateArchive);
            if (!dirExists && !archiveExists) {
                // Attempt to restore template by invoking sticky uncompress logic
                try {
                    await this.profileManager.ensureProfileUncompressedAndSticky(template.id);
                } catch (e) {
                    // fall through to final recheck
                }
                dirExists = await fs.pathExists(templateDir);
                archiveExists = await fs.pathExists(templateArchive);
                if (!dirExists && !archiveExists) {
                    throw new Error(`Template data missing: neither directory nor archive found at ${templateDir} or ${templateArchive}`);
                }
            }

            // Clone the template profile to a new instance (handles dir or archive)
            const tempProfile = await this.profileManager.cloneProfile(
                template.id,
                newProfileName,
                `Template instance: ${newProfileName} (from ${template.name})`,
                { disableCompression: disableCompression !== undefined ? disableCompression : (template.metadata?.compressOnClose === false) }
            );

            // Debug: show new profile identifiers
            try {
                const { dirPath: nDir, archivePath: nArch } = this.profileManager.getProfileStoragePaths(tempProfile);
                console.log(`🆕 Created new instance profile: ${tempProfile.name} (${tempProfile.id})`);
                console.log(`   • dir: ${nDir}`);
                console.log(`   • archive: ${nArch}`);
            } catch (_) {}

            // Launch with randomized fingerprint and stealth config
            const result = await this.launchProfile(tempProfile.id, {
                ...launchOptions,
                stealth: true,
                stealthPreset,
                stealthConfig: fingerprintConfig,
                enableRequestCapture: launchOptions.enableRequestCapture !== false,
                enableAutomation: launchOptions.enableAutomation !== false,
                isTemporary: isTemporary, // Use the explicit isTemporary setting
                disableCompression
            });

            // Mark as template-based session
            result.isTemplateInstance = true;
            result.templateProfile = templateProfile;
            result.instanceName = newProfileName;
            result.fingerprintRandomized = randomizeFingerprint;

            console.log(`✅ Template instance launched: ${newProfileName}`);
            if (randomizeFingerprint) {
                console.log(`🎭 Fingerprint variation: ENABLED`);
            }

            return result;

        } catch (error) {
            // Nothing created if clone failed before; if created and launch failed, attempt cleanup
            try {
                if (result && result.profile && result.profile.id) {
                    // no-op
                }
            } catch (_) {}
            throw error;
        }
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
            enableAutomation = false, // Default OFF; enable via CLI flag
            enableRequestCapture = true, // Enable request capture by default
            maxStealth = true, // Enable maximum stealth by default
            automationTasks = [], // Array of automation tasks to run
            stealth = false, // Enable stealth features
            stealthPreset = 'balanced', // Stealth preset
            stealthConfig = null, // Custom stealth configuration
            isTemporary = false, // Mark as temporary profile for cleanup
            disableCompression = undefined, // Optional override per launch
            proxy = null, // Legacy proxy configuration (deprecated, use proxyStrategy)
            proxyStrategy = null, // Proxy strategy: 'auto', 'random', 'fastest', 'round-robin'
            proxyStart = null, // Proxy label to start rotation from
            proxyType = null // Proxy type filter: null, 'http', 'socks5'
        } = options;

        const profile = await this.profileManager.getProfile(nameOrId);
        try {
            const { dirPath, archivePath } = this.profileManager.getProfileStoragePaths(profile);
            const isComp = await this.profileManager.isCompressed(profile);
            console.log(`🔧 Launch target profile: ${profile.name} (${profile.id})`);
            console.log(`   • dir: ${dirPath}`);
            console.log(`   • archive: ${archivePath} (compressed=${isComp})`);
        } catch (_) {}
        // Ensure profile directory exists (decompress if archived)
        await this.profileManager.ensureDecompressed(profile);
        // Optionally override compression preference for this profile
        if (typeof disableCompression === 'boolean') {
            await this.profileManager.setCompressionPreference(profile.id, !disableCompression);
            profile.metadata = { ...(profile.metadata || {}), compressOnClose: !disableCompression };
            console.log(`📌 Compression preference for '${profile.name}': ${!disableCompression ? 'ENABLED' : 'DISABLED'}`);
        }
        const sessionId = await this.profileManager.startSession(profile.id, 'automation');

        // Store current profile name for extension customization
        this.currentProfileName = profile.name;

        // Configure proxy if requested (support both legacy and new format)
        let proxyConfig = null;
        const proxySelection = proxyStrategy || proxy; // Use new proxyStrategy or fall back to legacy proxy
        
        if (proxySelection) {
            await this.ensureProxiesLoaded();
            
            // If we have a start position, we need to use ProxyRotator for round-robin
            if (proxyStart && (proxySelection === 'round-robin' || !proxySelection)) {
                const { ProxyRotator } = await import('./ProxyRotator.js');
                const rotator = new ProxyRotator(this.proxyManager, {
                    strategy: 'round-robin',
                    startProxyLabel: proxyStart
                });
                
                await rotator.initialize();
                const result = await rotator.getNextProxy();
                if (result) {
                    proxyConfig = result.proxyConfig;
                    console.log(`🎯 Using proxy from rotation: ${result.proxy.label}`);
                } else {
                    console.warn(`⚠️  Proxy rotation failed, launching without proxy`);
                }
            } else {
                // Use standard proxy selection
                proxyConfig = await this.proxyManager.getProxyConfig(proxySelection, proxyType);
                if (!proxyConfig) {
                    console.warn(`⚠️  Proxy configuration failed, launching without proxy`);
                }
            }
        }

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
                    proxy: proxyConfig, // Add proxy configuration
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
                
                // Handle proxy authentication if needed
                if (proxyConfig && proxyConfig.username && proxyConfig.password) {
                    console.log('🔐 Setting up proxy authentication handler');
                    
                    try {
                        // Set credentials for the initial context first
                        await context.setHTTPCredentials({
                            username: proxyConfig.username,
                            password: proxyConfig.password
                        });
                        
                        // Set up authentication for all pages created in this context
                        context.on('page', async (page) => {
                            try {
                                // Handle authentication requests
                                await page.context().setHTTPCredentials({
                                    username: proxyConfig.username,
                                    password: proxyConfig.password
                                });
                                
                                // Handle dialogs that might be proxy auth dialogs
                                page.on('dialog', async (dialog) => {
                                    try {
                                        const message = dialog.message().toLowerCase();
                                        if (message.includes('proxy') || message.includes('username') || message.includes('password')) {
                                            console.log('🔐 Proxy authentication dialog detected, accepting with credentials');
                                            // For proxy auth dialogs, we need to provide username and password
                                            await dialog.accept(proxyConfig.username);
                                        } else {
                                            await dialog.dismiss();
                                        }
                                    } catch (error) {
                                        console.warn('⚠️  Dialog handling error:', error.message);
                                    }
                                });
                            } catch (error) {
                                console.warn('⚠️  Page proxy auth setup error:', error.message);
                            }
                        });
                        
                        console.log('✅ Proxy authentication configured successfully');
                    } catch (error) {
                        console.warn('⚠️  Proxy authentication setup failed:', error.message);
                    }
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
                    proxy: proxyConfig, // Add proxy configuration
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
                const contextOptions = {
                    viewport,
                    storageState: path.join(profile.userDataDir, 'storage-state.json')
                };
                
                // Add proxy configuration to context if not already set at browser level
                if (proxyConfig && browserType !== 'chromium') {
                    contextOptions.proxy = proxyConfig;
                }
                
                context = await browser.newContext(contextOptions);
            }

            const browserInfo = {
                browser,
                context,
                profile,
                sessionId,
                browserType,
                startTime: new Date(),
                isTemporary
            };

            this.activeBrowsers.set(sessionId, browserInfo);

            // Monitor browser disconnection for proper cleanup
            this.setupBrowserDisconnectMonitoring(sessionId, browserInfo);

            // For Chromium persistent context, use the existing page; for others, create new page
            const page = browserType === 'chromium' ? context.pages()[0] : await context.newPage();

            // Configure autofill behavior based on automation mode
            try {
                if (enableAutomation) {
                    this.autofillSystem.options.minimalInterference = false;
                    this.autofillSystem.options.fillStrategy = 'type';
                } else {
                    this.autofillSystem.options.minimalInterference = true;
                    this.autofillSystem.options.fillStrategy = 'paste';
                }
            } catch (_) {}

            // Start request capture monitoring if enabled (start early to avoid missing initial responses)
            if (enableRequestCapture) {
                await this.requestCaptureSystem.startMonitoring(sessionId, context, {
                    profileName: profile.name
                });
            }
            
            // Setup automation if enabled
            if (enableAutomation) {
                await this.setupAutomation(sessionId, { browser, context, profile, page }, automationTasks);
            }
            
            // Start autofill monitoring
            await this.autofillSystem.startMonitoring(sessionId, context);
            
            // Start automation if enabled
            if (enableAutomation) {
                await this.automationSystem.startAutomation(sessionId, context, this.requestCaptureSystem, this.autofillSystem);
                
                // Store auto-close options for the monitor
                browserInfo.autoClose = {
                    onSuccess: !!options.autoCloseOnSuccess,
                    onFailure: !!options.autoCloseOnFailure,
                    timeoutMs: options.autoCloseTimeout || this.automationSystem.options.globalTimeout || 120000,
                    captchaGraceMs: options.captchaGraceMs || 45000
                };
                // Setup auto-close monitoring when any auto-close mode is requested
                if (browserInfo.autoClose.onSuccess || browserInfo.autoClose.onFailure || browserInfo.autoClose.timeoutMs > 0) {
                    this.setupAutoCloseMonitoring(sessionId, browserInfo);
                }
            }
            
            // Setup VidIQ device ID spoofing for this profile
            await this.setupVidiqDeviceIdSpoofing(context, profile.name);
            
            // Apply stealth configuration if enabled
            if (stealth && stealthConfig) {
                console.log(`🛡️  Applying custom stealth configuration`);
                await this.stealthManager.applyStealthScripts(context, stealthConfig);
            } else if (stealth) {
                console.log(`🛡️  Applying stealth preset: ${stealthPreset}`);
                const presetConfig = this.stealthManager.getPresetConfig(stealthPreset);
                await this.stealthManager.applyStealthScripts(context, presetConfig);
            }
            
            // (moved earlier) Request capture already started above to avoid missing initial responses
            
            return {
                browser,
                context,
                profile,
                sessionId,
                page,
                automationEnabled: enableAutomation,
                requestCaptureEnabled: enableRequestCapture
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
            const result = await this.launchProfile(profile.id, {
                ...options,
                isTemporary: true // Mark as temporary for cleanup
            });
            
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
            // Clear auto-close monitoring interval if it exists
            if (browserInfo.autoCloseInterval) {
                clearInterval(browserInfo.autoCloseInterval);
            }

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
            
            // Compress on close if enabled and not a temporary profile
            try {
                const compressPref = browserInfo.profile.metadata?.compressOnClose !== false;
                if (!browserInfo.isTemporary && browserInfo.browserType === 'chromium' && compressPref) {
                    console.log(`📦 Compressing profile data: ${browserInfo.profile.name}`);
                    await this.profileManager.compressProfile(browserInfo.profile);
                    console.log(`✅ Profile compressed`);
                }
            } catch (zipErr) {
                console.warn(`⚠️  Profile compression failed: ${zipErr.message}`);
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
            
            // Stop autofill monitoring
            this.autofillSystem.stopMonitoring(sessionId);
            
            // Stop automation monitoring
            await this.automationSystem.cleanup(sessionId);

            // Export captured requests before stopping capture (best-effort)
            try {
                await this.requestCaptureSystem.exportCapturedRequests(sessionId, 'jsonl');
            } catch (error) {
                console.warn(`⚠️  Could not export captured requests: ${error.message}`);
            }
            
            // Stop request capture monitoring
            await this.requestCaptureSystem.cleanup(sessionId);
            
            // Clean up profile-specific VidIQ extension
            try {
                const vidiqExtensionPath = `./profiles/data/vidiq-extensions/${browserInfo.profile.name}-vidiq-extension`;
                if (await fs.pathExists(vidiqExtensionPath)) {
                    await fs.remove(vidiqExtensionPath);
                    console.log(`🧹 Cleaned up VidIQ extension for: ${browserInfo.profile.name}`);
                }
            } catch (error) {
                console.warn(`⚠️  Could not clean up VidIQ extension: ${error.message}`);
            }
            
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
     * Set up auto-close monitoring for headless automation
     * @param {string} sessionId - Session ID
     * @param {Object} browserInfo - Browser information object
     */
    setupAutoCloseMonitoring(sessionId, browserInfo) {
        console.log(`🤖 Setting up auto-close monitoring for session: ${sessionId}`);
        
        // Check automation completion every 2 seconds
        const checkInterval = setInterval(async () => {
            try {
                // Check if session still exists
                if (!this.activeBrowsers.has(sessionId)) {
                    clearInterval(checkInterval);
                    return;
                }
                
                // Get automation status
                const automationStatus = this.automationSystem.getStatus();
                const sessionCompletions = Array.from(this.automationSystem.completedAutomations.values())
                    .filter(completion => completion.sessionId === sessionId && completion.status === 'success');
                const sessionFailures = Array.from(this.automationSystem.completedAutomations.values())
                    .filter(completion => completion.sessionId === sessionId && completion.status === 'failure');
                
                if (sessionCompletions.length > 0) {
                    console.log(`🎉 Automation completed successfully! Auto-closing browser...`);
                    clearInterval(checkInterval);
                    
                    // Wait a moment to ensure everything is captured
                    setTimeout(async () => {
                        try {
                            // Export captured requests before closing
                            try {
                                await this.requestCaptureSystem.exportCapturedRequests(sessionId, 'jsonl');
                            } catch (e) {
                                console.warn(`⚠️  Error exporting captured requests before auto-close: ${e.message}`);
                            }
                            await this.closeBrowser(sessionId, { clearCache: false });
                            console.log(`✅ Browser closed automatically for session: ${sessionId}`);
                        } catch (error) {
                            console.error(`❌ Error auto-closing browser: ${error.message}`);
                        }
                    }, 2000); // 2 second delay
                } else if (sessionFailures.length > 0 && (browserInfo.autoClose?.onFailure)) {
                    console.log(`❗ Automation reported failure. Auto-closing with snapshots...`);
                    clearInterval(checkInterval);
                    try {
                        // Best-effort: capture screenshot and HTML snapshot before closing
                        try {
                            const pages = browserInfo.context.pages();
                            let targetPage = pages.find(p => {
                                const u = p.url();
                                return u && u !== 'about:blank' && !u.startsWith('chrome://');
                            }) || pages[0];
                            if (targetPage) {
                                const outDir = path.resolve('./automation-results');
                                await fs.ensureDir(outDir);
                                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                                const base = `${sessionId}-failure-${ts}`;
                                const pngPath = path.join(outDir, `${base}.png`);
                                const htmlPath = path.join(outDir, `${base}.html`);
                                try { await targetPage.screenshot({ path: pngPath, fullPage: true }); } catch (_) {}
                                try {
                                    const html = await targetPage.content();
                                    await fs.writeFile(htmlPath, `<!-- URL: ${targetPage.url()} -->\n${html}`);
                                } catch (_) {}
                                console.log(`📸 Saved failure screenshot: ${pngPath}`);
                                console.log(`📝 Saved failure HTML snapshot: ${htmlPath}`);
                            }
                        } catch (snapErr) {
                            console.warn(`⚠️  Snapshot capture failed: ${snapErr.message}`);
                        }
                        // Export captured requests before closing
                        try {
                            await this.requestCaptureSystem.exportCapturedRequests(sessionId, 'jsonl');
                        } catch (e) {
                            console.warn(`⚠️  Error exporting captured requests before auto-close: ${e.message}`);
                        }
                        await this.closeBrowser(sessionId, { clearCache: false });
                        console.log(`✅ Browser closed automatically after failure for session: ${sessionId}`);
                    } catch (error) {
                        console.error(`❌ Error auto-closing browser on failure: ${error.message}`);
                    }
                } else {
                    // Fallback: detect success via request capture directly (VidIQ endpoints)
                    try {
                        const captured = this.requestCaptureSystem.getCapturedRequests(sessionId) || [];
                        const successDetected = captured.some(req =>
                            req.type === 'response' &&
                            [200, 201].includes(req.status) &&
                            (
                                (typeof req.url === 'string' && req.url.includes('api.vidiq.com/subscriptions/active')) ||
                                (typeof req.url === 'string' && req.url.includes('api.vidiq.com/subscriptions/stripe/next-subscription'))
                            )
                        );
                        
                        if (successDetected) {
                            console.log(`🎯 Success response detected via capture; auto-closing browser...`);
                            clearInterval(checkInterval);
                            
                            setTimeout(async () => {
                                try {
                                    // Export captured requests before closing
                                    try {
                                        await this.requestCaptureSystem.exportCapturedRequests(sessionId, 'jsonl');
                                    } catch (e) {
                                        console.warn(`⚠️  Error exporting captured requests before auto-close: ${e.message}`);
                                    }
                                    await this.closeBrowser(sessionId, { clearCache: false });
                                    console.log(`✅ Browser closed automatically for session: ${sessionId}`);
                                } catch (error) {
                                    console.error(`❌ Error auto-closing browser: ${error.message}`);
                                }
                            }, 2000);
                        } else {
                            // Failure/timeout path
                            const ac = browserInfo.autoClose || {};
                            const now = Date.now();
                            const elapsed = now - new Date(browserInfo.startTime).getTime();
                            const timeoutMs = ac.timeoutMs || 0;
                            const onFailure = !!ac.onFailure;

                            // Basic CAPTCHA heuristics: look for iframe with recaptcha, or DOM tokens
                            let captchaLikely = false;
                            try {
                                const pages = browserInfo.context.pages();
                                for (const p of pages) {
                                    const hasRecaptcha = await p.locator('iframe[src*="recaptcha"], div.g-recaptcha').count().catch(() => 0);
                                    const hasHCaptcha = await p.locator('iframe[src*="hcaptcha"], div.h-captcha').count().catch(() => 0);
                                    if (hasRecaptcha > 0 || hasHCaptcha > 0) { captchaLikely = true; break; }
                                }
                            } catch (_) {}

                            // If timeout exceeded (with optional extra grace for captchas), auto-close when enabled
                            const captchaGraceMs = ac.captchaGraceMs || 0;
                            const effectiveTimeout = captchaLikely ? (timeoutMs + captchaGraceMs) : timeoutMs;
                            if (timeoutMs > 0 && elapsed >= effectiveTimeout && onFailure) {
                                console.log(`⏰ No success detected after ${elapsed}ms${captchaLikely ? ` (captcha detected, grace applied)` : ''}; auto-closing as failure...`);
                                clearInterval(checkInterval);
                                try {
                                    // Best-effort: capture screenshot and HTML snapshot before closing
                                    try {
                                        const pages = browserInfo.context.pages();
                                        // Prefer the first non-about:blank page; fallback to first page
                                        let targetPage = pages.find(p => {
                                            const u = p.url();
                                            return u && u !== 'about:blank' && !u.startsWith('chrome://');
                                        }) || pages[0];
                                        if (targetPage) {
                                            const outDir = path.resolve('./automation-results');
                                            await fs.ensureDir(outDir);
                                            const ts = new Date().toISOString().replace(/[:.]/g, '-');
                                            const base = `${sessionId}-failure-${ts}`;
                                            const pngPath = path.join(outDir, `${base}.png`);
                                            const htmlPath = path.join(outDir, `${base}.html`);
                                            try { await targetPage.screenshot({ path: pngPath, fullPage: true }); } catch (_) {}
                                            try {
                                                const html = await targetPage.content();
                                                await fs.writeFile(htmlPath, `<!-- URL: ${targetPage.url()} -->\n${html}`);
                                            } catch (_) {}
                                            console.log(`📸 Saved failure screenshot: ${pngPath}`);
                                            console.log(`📝 Saved failure HTML snapshot: ${htmlPath}`);
                                        }
                                    } catch (snapErr) {
                                        console.warn(`⚠️  Snapshot capture failed: ${snapErr.message}`);
                                    }

                                    // Export captured requests before closing
                                    try {
                                        await this.requestCaptureSystem.exportCapturedRequests(sessionId, 'jsonl');
                                    } catch (e) {
                                        console.warn(`⚠️  Error exporting captured requests before auto-close: ${e.message}`);
                                    }
                                    await this.closeBrowser(sessionId, { clearCache: false });
                                    console.log(`✅ Browser closed after timeout/failure for session: ${sessionId}`);
                                } catch (error) {
                                    console.error(`❌ Error auto-closing browser on failure: ${error.message}`);
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore capture inspection errors in auto-close loop
                    }
                }
            } catch (error) {
                console.error(`❌ Error checking automation completion: ${error.message}`);
            }
        }, 2000); // Check every 2 seconds
        
        // Store interval for cleanup
        browserInfo.autoCloseInterval = checkInterval;
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
            
            // Stop autofill monitoring
            this.autofillSystem.stopMonitoring(sessionId);
            
            // Stop request capture monitoring
            await this.requestCaptureSystem.cleanup(sessionId);
            
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
                                // Special handling for VidIQ extension
                                if (extensionId === 'pachckjkecffpdphbpmfolblodfkgbhl' && this.currentProfileName) {
                                    // Use profile-specific VidIQ extension instead
                                    const profileVidiqPath = await this.createProfileVidiqExtension(this.currentProfileName);
                                    extensionPaths.push(profileVidiqPath);
                                    console.log(`🎭 Using profile-specific VidIQ extension: ${this.currentProfileName}`);
                                } else {
                                    extensionPaths.push(versionPath);
                                    console.log(`Found extension: ${extensionId} (${versionFolder})`);
                                }
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
        
        // Store custom automation tasks (non-autofill related)
        this.automationTasks.set(sessionId, automationTasks);
        
        console.log(`✅ Automation setup complete for ${profile.name}`);
        console.log(`🎯 Custom automation tasks: ${automationTasks.length}`);
        console.log(`🎯 Autofill system will handle form filling automatically`);
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
     * Get autofill system status
     * @returns {Object} Autofill system status
     */
    getAutofillStatus() {
        return this.autofillSystem.getStatus();
    }

    /**
     * Reload autofill hooks from configuration
     */
    async reloadAutofillHooks() {
        await this.autofillSystem.reloadHooks('./autofill-hooks');
        console.log(`🔄 Autofill hooks reloaded`);
    }

    /**
     * Get request capture system status
     * @returns {Object} Request capture system status
     */
    getRequestCaptureStatus() {
        return this.requestCaptureSystem.getStatus();
    }

    /**
     * Reload request capture hooks from configuration
     */
    async reloadRequestCaptureHooks() {
        await this.requestCaptureSystem.reloadHooks('./capture-hooks');
        console.log(`🔄 Request capture hooks reloaded`);
    }

    /**
     * Export captured requests for a session
     * @param {string} sessionId - Session ID
     * @param {string} format - Export format ('json', 'jsonl', 'csv')
     * @param {string} outputPath - Output file path (optional)
     */


    /**
     * Get captured requests for a session
     * @param {string} sessionId - Session ID
     * @returns {Array} Array of captured requests
     */
    getCapturedRequests(sessionId) {
        return this.requestCaptureSystem.getCapturedRequests(sessionId);
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
