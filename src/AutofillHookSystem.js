import fs from 'fs-extra';
import path from 'path';
import { RandomDataGenerator } from './RandomDataGenerator.js';
import { EVENTS } from './ProfileEventBus.js';

/**
 * AutofillHookSystem - A generalized system for handling form autofill based on URL patterns
 * and configurable field mappings. This system uses a hook-based approach where different
 * autofill configurations can be loaded dynamically.
 */
export class AutofillHookSystem {
    constructor(options = {}) {
        this.hooks = new Map(); // URL pattern -> hook configuration
        this.processedPages = new Map(); // Track processed pages to avoid duplicates
        this.activeMonitors = new Map(); // Track active page monitors per session
        this.completedSessions = new Map(); // Track sessions that have successfully completed autofill
        this.sessionFieldCounts = new Map(); // Track successful field fills per session
        this.activeFillOperations = new Map(); // Track active fill operations per session
        this.postRefreshRetryCounts = new Map(); // Bounded retries for post-refresh refills per session+hook
        this.sessionCredentials = new Map(); // Store actual credentials for sessions (for login flows)
        
        // EventBus for coordinating with other systems
        this.eventBus = options.eventBus || null;
        
        // Autofill behavior options
        this.options = {
            stopOnSuccess: options.stopOnSuccess !== false, // Stop scanning after successful autofill (default: true)
            enforceMode: options.enforceMode || false, // Continue monitoring even after success (for race conditions)
            minFieldsForSuccess: options.minFieldsForSuccess || 2, // Minimum fields filled to consider success
            successCooldown: options.successCooldown || 30000, // Cooldown period before re-enabling (30s)
            maxRetriesPerSession: options.maxRetriesPerSession || 3, // Max retries per session before giving up
            postRefreshWatchWindowMs: options.postRefreshWatchWindowMs || 20000, // Watch window after fills for refresh-clears
            postRefreshCheckIntervalMs: options.postRefreshCheckIntervalMs || 1200, // Poll cadence while in watch window
            maxPostRefreshRetries: options.maxPostRefreshRetries || 2, // Max re-attempts triggered by cleared fields
            ...options
        };
        
        // Initialize random data generator
        this.dataGenerator = new RandomDataGenerator({
            usePrefix: options.usePrefix || false,
            usePostfix: options.usePostfix !== false, // default true
            postfixDigits: options.postfixDigits || 4,
            
            // New username generation options
            usernameStyle: options.usernameStyle || 'auto', // 'auto', 'concatenated', 'separated', 'business', 'handle'
            usernamePattern: options.usernamePattern || 'random', // 'random', 'pattern_a', 'pattern_b', 'pattern_c'
            separatorChars: options.separatorChars || ['.', '_', '-'],
            businessMode: options.businessMode || false,
            patternWeights: options.patternWeights, // {concatenated, separated, business, handle}
            businessUserFormat: options.businessUserFormat, // 'auto' | 'full' | 'alias'
            businessFormatWeights: options.businessFormatWeights, // {full, alias}
            businessAliasPatterns: options.businessAliasPatterns, // override alias set
            handleSyllables: options.handleSyllables,
            handleBlocklist: options.handleBlocklist,
            
            emailProviders: options.emailProviders,
            customEmailProviders: options.customEmailProviders,
            businessEmailProviders: options.businessEmailProviders,
            enableTracking: options.enableTracking || false,
            trackingDbPath: options.trackingDbPath || './profiles/data/generated_names.db',
            passwordLength: options.passwordLength,
            passwordComplexity: options.passwordComplexity
        });
        
        console.log(`🎲 RandomDataGenerator initialized with tracking: ${this.dataGenerator.config.enableTracking}`);
    }

    /**
     * Set actual credentials for a session (for login flows)
     * @param {string} sessionId - Session ID
     * @param {Object} credentials - Credentials object
     * @param {string} credentials.email - Email address
     * @param {string} credentials.password - Password
     * @param {boolean} credentials.submitForm - Whether to submit form after filling
     * @param {string} credentials.mode - Mode: 'login' or 'signup'
     */
    setCredentialsForSession(sessionId, credentials) {
        this.sessionCredentials.set(sessionId, credentials);
        console.log(`🔐 Set credentials for session ${sessionId}: ${credentials.email} (${credentials.mode || 'default'} mode, submit: ${!!credentials.submitForm})`);
    }

    /**
     * Get credentials for a session
     * @param {string} sessionId - Session ID
     * @returns {Object|null} Credentials object or null
     */
    getCredentialsForSession(sessionId) {
        return this.sessionCredentials.get(sessionId) || null;
    }

    /**
     * Load autofill hooks from configuration files
     * @param {string} configDir - Directory containing autofill configuration files
     */
    async loadHooks(configDir = './autofill-hooks') {
        try {
            console.log(`🔗 Loading autofill hooks from: ${configDir}`);
            
            if (!await fs.pathExists(configDir)) {
                console.log(`📁 Autofill hooks directory not found: ${configDir}`);
                console.log(`⚠️  Please create the directory and add hook configuration files`);
                return;
            }

            const files = await fs.readdir(configDir);
            const jsFiles = files.filter(file => file.endsWith('.js'));
            
            for (const file of jsFiles) {
                try {
                    const filePath = path.join(configDir, file);
                    console.log(`📄 Loading hook: ${file}`);
                    
                    // Dynamic import of hook configuration
                    const hookModule = await import(`file://${path.resolve(filePath)}`);
                    const hookConfig = hookModule.default || hookModule;
                    
                    if (this.validateHookConfig(hookConfig)) {
                        this.registerHook(hookConfig);
                        console.log(`✅ Registered hook: ${hookConfig.name}`);
                    } else {
                        console.warn(`⚠️  Invalid hook configuration in ${file}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to load hook ${file}:`, error.message);
                }
            }
            
            console.log(`🎯 Total hooks loaded: ${this.hooks.size}`);
        } catch (error) {
            console.error(`❌ Failed to load autofill hooks:`, error.message);
        }
    }


    /**
     * Validate hook configuration structure
     * @param {Object} config - Hook configuration to validate
     * @returns {boolean} Whether configuration is valid
     */
    validateHookConfig(config) {
        if (!config || typeof config !== 'object') return false;
        if (!config.name || typeof config.name !== 'string') return false;
        if (!config.urlPatterns || !Array.isArray(config.urlPatterns)) return false;
        if (!config.fields || typeof config.fields !== 'object') return false;
        
        return true;
    }

    /**
     * Register a new autofill hook
     * @param {Object} hookConfig - Hook configuration
     */
    registerHook(hookConfig) {
        // Store hook with all URL patterns as keys
        for (const pattern of hookConfig.urlPatterns) {
            this.hooks.set(pattern, hookConfig);
        }
    }

    /**
     * Start monitoring a browser context for autofill opportunities
     * @param {string} sessionId - Session ID
     * @param {Object} context - Playwright browser context
     */
    async startMonitoring(sessionId, context) {
        if (this.hooks.size === 0) {
            console.log(`⚠️  No autofill hooks loaded, skipping monitoring for session: ${sessionId}`);
            return;
        }

        console.log(`👀 Starting autofill monitoring for session: ${sessionId}`);
        console.log(`🎯 Monitoring ${this.hooks.size} URL patterns`);

        // Monitor new pages
        const pageHandler = async (page) => {
            await this.handleNewPage(page, sessionId);
        };

        context.on('page', pageHandler);
        
        // Set up event listener for autofill requests (e.g., from automation system)
        let autofillRequestListener = null;
        if (this.eventBus) {
            autofillRequestListener = this.eventBus.onSessionEvent(sessionId, EVENTS.AUTOFILL_REQUESTED, async (event) => {
                console.log(`📡 Received autofill request: ${event.reason || 'unknown reason'}`);
                
                // Force re-enable autofill for this session
                this.forceReEnable(sessionId);
                // Clear processed page marks so we don't skip due to dedupe
                try {
                    this.clearProcessedPageMarks(sessionId, event?.hookName || null);
                } catch (_) {}
                
                // Re-process current pages to trigger autofill
                const currentPages = context.pages();
                for (const page of currentPages) {
                    try {
                        const url = page.url();
                        if (url && url !== 'about:blank') {
                            console.log(`🔄 Re-processing page for autofill: ${url}`);
                            await this.handleNewPage(page, sessionId);
                        }
                    } catch (error) {
                        console.log(`⚠️  Error re-processing page: ${error.message}`);
                    }
                }
            });
        }
        
        // Store the handlers for cleanup
        this.activeMonitors.set(sessionId, { context, pageHandler, autofillRequestListener });

        // Check existing pages
        const existingPages = context.pages();
        for (const page of existingPages) {
            await this.handleNewPage(page, sessionId);
        }
    }

    /**
     * Handle a new page being created or navigated
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async handleNewPage(page, sessionId) {
        try {
            // Wait for page to load (with proxy-aware timeout)
            const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
            const pageLoadTimeout = Math.round(10000 * proxyMultiplier);
            await page.waitForLoadState('domcontentloaded', { timeout: pageLoadTimeout });
            const url = page.url();
            
            if (this.options.proxyMode) {
                console.log(`🌐 Proxy mode: Page load timeout ${pageLoadTimeout}ms`);
            }
            
            if (!url || url === 'about:blank') return;
            
            console.log(`🔗 Checking page for autofill: ${url}`);
            
            // Find matching hooks
            const matchingHooks = this.findMatchingHooks(url);
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                // Check if session should be skipped due to completion
                if (this.shouldSkipSession(sessionId, hook.name)) {
                    continue;
                }
                
                const pageKey = `${sessionId}-${url}-${hook.name}`;
                
                // Avoid duplicate processing (unless enforce mode is on)
                if (this.processedPages.has(pageKey) && !this.options.enforceMode) {
                    console.log(`⏭️  Skipping ${hook.name} - already processed`);
                    continue;
                }
                
                console.log(`🎯 AUTOFILL MATCH: ${hook.name}`);
                console.log(`   Description: ${hook.description}`);
                console.log(`   URL: ${url}`);
                
                // Mark as processed (unless enforce mode allows retries)
                if (!this.options.enforceMode) {
                    this.processedPages.set(pageKey, true);
                }
                
                // Execute autofill
                await this.executeAutofill(hook, page, sessionId);
            }
        } catch (error) {
            console.log(`⚠️  Error handling new page: ${error.message}`);
        }
    }

    /**
     * Find hooks that match the given URL
     * @param {string} url - URL to match against
     * @returns {Array} Array of matching hook configurations
     */
    findMatchingHooks(url) {
        const matches = [];
        
        for (const [pattern, hook] of this.hooks) {
            if (this.urlMatches(url, pattern)) {
                // Avoid duplicate hooks
                if (!matches.find(h => h.name === hook.name)) {
                    matches.push(hook);
                }
            }
        }
        
        return matches;
    }

    /**
     * Check if URL matches a pattern
     * @param {string} url - URL to check
     * @param {string|RegExp} pattern - Pattern to match against
     * @returns {boolean} Whether URL matches pattern
     */
    urlMatches(url, pattern) {
        if (!url || !pattern) return false;
        
        // RegExp pattern
        if (pattern instanceof RegExp) {
            return pattern.test(url);
        }
        
        // String pattern with wildcards
        if (typeof pattern === 'string') {
            if (pattern.includes('*')) {
                // Convert wildcard pattern to regex
                const regexPattern = pattern
                    .replace(/\*\*/g, '.*') // ** matches any characters
                    .replace(/\*/g, '[^/]*') // * matches any characters except /
                    .replace(/\./g, '\\.'); // Escape dots
                
                return new RegExp(`^${regexPattern}$`).test(url);
            } else {
                // Exact match or starts with
                return url === pattern || url.startsWith(pattern);
            }
        }
        
        return false;
    }

    /**
     * Generate dynamic field values for a hook
     * @param {Object} hook - Hook configuration
     * @param {string} sessionId - Session ID
     * @param {string} siteUrl - Current site URL (optional)
     * @returns {Object} Generated user data
     */
    generateFieldValues(hook, sessionId, siteUrl = null) {
        // First check if we have actual credentials for this session (login flows)
        const sessionCreds = this.getCredentialsForSession(sessionId);
        if (sessionCreds && sessionCreds.email && sessionCreds.password) {
            console.log(`🔐 Using session credentials for ${hook.name}: ${sessionCreds.email}`);
            return {
                email: sessionCreds.email,
                password: sessionCreds.password,
                fullName: sessionCreds.email.split('@')[0], // Use email prefix as name
                submitForm: sessionCreds.submitForm || false,
                mode: sessionCreds.mode || 'login'
            };
        }
        
        // Check if hook supports dynamic generation
        if (!hook.useDynamicGeneration) {
            return null;
        }
        
        const options = {
            usePrefix: hook.generationOptions?.usePrefix,
            usePostfix: hook.generationOptions?.usePostfix,
            currentIndex: this.getSessionIndex(sessionId),
            password: hook.generationOptions?.password,
            // Allow per-hook overrides for username generation patterns
            usernameStyle: hook.generationOptions?.usernameStyle,
            usernamePattern: hook.generationOptions?.usernamePattern,
            businessMode: hook.generationOptions?.businessMode,
            patternWeights: hook.generationOptions?.patternWeights,
            businessUserFormat: hook.generationOptions?.businessUserFormat,
            businessFormatWeights: hook.generationOptions?.businessFormatWeights,
            businessAliasPatterns: hook.generationOptions?.businessAliasPatterns,
            handleSyllables: hook.generationOptions?.handleSyllables,
            handleBlocklist: hook.generationOptions?.handleBlocklist,
            // Allow per-hook number flavor weight overrides
            numberFlavorWeights: hook.generationOptions?.numberFlavorWeights,
            numberFlavorWeightsByStyle: hook.generationOptions?.numberFlavorWeightsByStyle,
            // Allow per-hook email provider overrides
            emailProviders: hook.generationOptions?.emailProviders,
            businessEmailProviders: hook.generationOptions?.businessEmailProviders,
            sessionId: sessionId,
            siteUrl: siteUrl,
            hookName: hook.name
        };
        
        const userData = this.dataGenerator.generateUserData(options);
        console.log(`🎲 Generated dynamic data for ${hook.name}: ${userData.fullName}`);
        
        return userData;
    }
    
    /**
     * Get session-specific index for naming
     * @param {string} sessionId - Session ID
     * @returns {number} Session index
     */
    getSessionIndex(sessionId) {
        // Simple implementation - could be enhanced with persistent tracking
        return Math.abs(sessionId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0)) % 100 + 1;
    }
    
    /**
     * Check if a session should be skipped due to completion
     * @param {string} sessionId - Session ID
     * @param {string} hookName - Hook name
     * @returns {boolean} Whether to skip this session
     */
    shouldSkipSession(sessionId, hookName) {
        const sessionKey = `${sessionId}-${hookName}`;
        const completion = this.completedSessions.get(sessionKey);
        
        if (!completion) {
            return false; // Not completed, don't skip
        }
        
        // If enforce mode is on, never skip (always monitor for race conditions)
        if (this.options.enforceMode) {
            console.log(`🔄 Enforce mode: Re-checking ${hookName} for session ${sessionId}`);
            return false;
        }
        
        // If stop on success is enabled, check cooldown
        if (this.options.stopOnSuccess) {
            const timeSinceCompletion = Date.now() - completion.timestamp;
            const withinCooldown = timeSinceCompletion < this.options.successCooldown;
            
            if (withinCooldown) {
                console.log(`⏭️  Skipping ${hookName} - recently completed (${Math.round(timeSinceCompletion/1000)}s ago)`);
                return true;
            } else {
                // Cooldown expired, remove completion record
                this.completedSessions.delete(sessionKey);
                console.log(`🔄 Cooldown expired for ${hookName}, re-enabling autofill`);
                return false;
            }
        }
        
        return false;
    }
    
    /**
     * Mark a session as completed
     * @param {string} sessionId - Session ID
     * @param {string} hookName - Hook name
     * @param {number} filledFields - Number of successfully filled fields
     */
    markSessionCompleted(sessionId, hookName, filledFields) {
        const sessionKey = `${sessionId}-${hookName}`;
        
        this.completedSessions.set(sessionKey, {
            timestamp: Date.now(),
            filledFields,
            hookName
        });
        
        // Track field counts per session
        if (!this.sessionFieldCounts.has(sessionId)) {
            this.sessionFieldCounts.set(sessionId, new Map());
        }
        this.sessionFieldCounts.get(sessionId).set(hookName, filledFields);
        
        if (this.options.stopOnSuccess) {
            console.log(`✅ Session ${sessionId} completed for ${hookName} (${filledFields} fields) - autofill scanning stopped`);
        } else {
            console.log(`✅ Session ${sessionId} completed for ${hookName} (${filledFields} fields) - continuing monitoring`);
        }
    }
    
    /**
     * Resolve field value (static or dynamic)
     * @param {Object} fieldConfig - Field configuration
     * @param {Object} userData - Generated user data (if available)
     * @returns {string} Field value
     */
    resolveFieldValue(fieldConfig, userData = null) {
        // Handle dynamic value placeholders
        if (typeof fieldConfig.value === 'string' && fieldConfig.value.includes('{{')) {
            if (!userData) {
                console.warn('⚠️  Dynamic placeholder found but no user data available');
                return fieldConfig.value;
            }
            
            return fieldConfig.value
                .replace(/\{\{firstName\}\}/g, userData.firstName)
                .replace(/\{\{lastName\}\}/g, userData.lastName)
                .replace(/\{\{fullName\}\}/g, userData.fullName)
                .replace(/\{\{email\}\}/g, userData.email)
                .replace(/\{\{password\}\}/g, userData.password);
        }
        
        // Handle function-based dynamic values
        if (typeof fieldConfig.value === 'function') {
            return fieldConfig.value(userData);
        }
        
        // Return static value
        return fieldConfig.value;
    }

    /**
     * Fill a field safely with race condition protection
     * @param {Object} page - Playwright page
     * @param {string} selector - Field selector
     * @param {string} value - Value to fill
     * @param {Object} fieldConfig - Field configuration
     * @param {Object} settings - Execution settings
     * @returns {boolean} Success status
     */
    async fillFieldSafely(page, selector, value, fieldConfig, settings) {
        const maxRetries = 3;
        const retryDelay = 100;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const field = page.locator(selector);
                const count = await field.count();
                
                if (count === 0) {
                    if (attempt === maxRetries) {
                        console.log(`⚠️  Field not found after ${maxRetries} attempts: ${selector}`);
                    }
                    continue;
                }
                
                const firstField = field.first();
                
                // Wait for field to be visible and enabled (with proxy-aware timeout)
                const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
                const fieldTimeout = Math.round(2000 * proxyMultiplier);
                await firstField.waitFor({
                    state: 'visible',
                    timeout: fieldTimeout
                }).catch(() => {
                    console.log(`⚠️  Field not visible: ${selector}${this.options.proxyMode ? ' (proxy mode)' : ''}`);
                });
                
                // Check if field is enabled and editable
                const isEnabled = await firstField.isEnabled().catch(() => false);
                const isEditable = await firstField.isEditable().catch(() => false);
                
                if (!isEnabled || !isEditable) {
                    console.log(`⚠️  Field not interactive (enabled: ${isEnabled}, editable: ${isEditable}): ${selector}`);
                    if (attempt < maxRetries) {
                        await page.waitForTimeout(retryDelay * attempt);
                        continue;
                    }
                    return false;
                }
                
                console.log(`📝 Filling field (attempt ${attempt}): ${fieldConfig.description || selector}`);
                
                // Bring field into view and skip mouse/hover jitter in minimal mode
                try {
                    await firstField.scrollIntoViewIfNeeded();
                    if (!this.options.minimalInterference) {
                        const box = await firstField.boundingBox().catch(() => null);
                        if (box) {
                            const jitterX = (Math.random() - 0.5) * Math.min(10, box.width / 5);
                            const jitterY = (Math.random() - 0.5) * Math.min(6, box.height / 5);
                            const tgtX = box.x + box.width / 2 + jitterX;
                            const tgtY = box.y + box.height / 2 + jitterY;
                            await page.mouse.move(tgtX, tgtY, { steps: 3 + Math.floor(Math.random() * 4) });
                            await page.waitForTimeout(120 + Math.floor(Math.random() * 220));
                            await firstField.hover().catch(() => {});
                        }
                    }
                } catch (_) {}
                
                // Focus the field first to ensure it's active
                await firstField.focus();
                await page.waitForTimeout(80 + Math.floor(Math.random() * 140)); // Small randomized delay after focus
                
                // If value already correct, skip to avoid churn
                const existingValue = await firstField.inputValue().catch(() => '');
                if (existingValue === value) {
                    console.log(`ℹ️  Field already has correct value, skipping: ${selector}`);
                    return true;
                }
                
                // Determine if this is a password field
                let isPasswordField = false;
                try {
                    const attrType = await firstField.getAttribute('type');
                    isPasswordField = (attrType && attrType.toLowerCase() === 'password') || /password/i.test(selector);
                } catch (_) {
                    isPasswordField = /password/i.test(selector);
                }
                
                // Fill strategy: minimal paste-like or human-like typing
                if (this.options && this.options.fillStrategy === 'paste') {
                    try { await firstField.click({ clickCount: 3 }); } catch (_) {}
                    try {
                        await firstField.fill('');
                        await firstField.fill(value);
                    } catch (_) {
                        try {
                            await page.keyboard.insertText(value);
                        } catch (_) {
                            await firstField.evaluate((el, v) => {
                                const set = (e, val) => {
                                    e.value = val;
                                    e.dispatchEvent(new Event('input', { bubbles: true }));
                                    e.dispatchEvent(new Event('change', { bubbles: true }));
                                };
                                set(el, v);
                            }, value);
                        }
                    }
                } else {
                    if (isPasswordField) {
                        if (existingValue && existingValue.length > 0) {
                            await this.clearFieldSafely(firstField);
                            await page.waitForTimeout(60 + Math.floor(Math.random() * 120));
                        }
                        const perCharDelay = 40 + Math.floor(Math.random() * 80); // 40-120ms
                        await firstField.pressSequentially(value, { delay: perCharDelay });
                    } else {
                        if (existingValue && existingValue !== value) {
                            await this.clearFieldSafely(firstField);
                            await page.waitForTimeout(40 + Math.floor(Math.random() * 100));
                        }
                        const perCharDelay = 20 + Math.floor(Math.random() * 60); // 20-80ms
                        await firstField.pressSequentially(value, { delay: perCharDelay });
                    }
                }
                
                // Verify the value was actually set
                const actualValue = await firstField.inputValue().catch(() => '');
                
                if (actualValue === value) {
                    console.log(`✅ Field filled successfully: ${value.length > 50 ? value.substring(0, 47) + '...' : value}`);
                    return true;
                } else {
                    console.log(`⚠️  Value mismatch (attempt ${attempt}). Expected: "${value}", Got: "${actualValue}"`);
                    
                    if (attempt < maxRetries) {
                        // Try alternative method: re-focus, gentle clear (if any) and retype
                        await firstField.focus();
                        if (!isPasswordField) {
                            // Avoid overly aggressive clears on recaptcha-protected pages
                            await this.clearFieldSafely(firstField);
                            await page.waitForTimeout(40 + Math.floor(Math.random() * 100));
                        }
                        const perCharDelay2 = 25 + Math.floor(Math.random() * 70);
                        await firstField.pressSequentially(value, { delay: perCharDelay2 });
                        
                        const retryValue = await firstField.inputValue().catch(() => '');
                        if (retryValue === value) {
                            console.log(`✅ Field filled on retry: ${value.length > 50 ? value.substring(0, 47) + '...' : value}`);
                            return true;
                        }
                        
                        await page.waitForTimeout(retryDelay * attempt);
                    }
                }
                
            } catch (error) {
                console.log(`⚠️  Error filling field ${selector} (attempt ${attempt}): ${error.message}`);
                if (attempt < maxRetries) {
                    await page.waitForTimeout(retryDelay * attempt);
                }
            }
        }
        
        console.log(`❌ Failed to fill field after ${maxRetries} attempts: ${selector}`);
        return false;
    }

    /**
     * Clear a field safely using multiple methods
     * @param {Object} field - Playwright locator
     */
    async clearFieldSafely(field) {
        try {
            // Method 1: Standard clear
            await field.clear();
            
            // Verify it's actually clear
            const value = await field.inputValue().catch(() => '');
            if (value === '') {
                return;
            }
            
            // Method 2: Select all and delete
            await field.focus();
            await field.press('Control+a'); // Select all (Cmd+a on Mac is handled by Playwright)
            await field.press('Delete');
            
            // Method 3: If still not clear, use keyboard shortcuts
            const remainingValue = await field.inputValue().catch(() => '');
            if (remainingValue !== '') {
                await field.focus();
                await field.press('Home'); // Go to start
                await field.press('Shift+End'); // Select to end
                await field.press('Delete');
            }
            
        } catch (error) {
            console.log(`⚠️  Error clearing field: ${error.message}`);
        }
    }

    /**
     * Verify that filled fields contain the expected values
     * @param {Object} page - Playwright page
     * @param {Object} fields - Field configuration object
     * @param {Object} userData - Generated user data
     * @returns {Object} Verification results
     */
    async verifyFilledFields(page, fields, userData) {
        const results = {
            verified: 0,
            failed: 0,
            failedFields: []
        };
        
        for (const [selector, fieldConfig] of Object.entries(fields)) {
            try {
                const field = page.locator(selector);
                const count = await field.count();
                
                if (count > 0) {
                    const expectedValue = this.resolveFieldValue(fieldConfig, userData);
                    const actualValue = await field.first().inputValue().catch(() => '');
                    
                    if (actualValue === expectedValue) {
                        results.verified++;
                    } else {
                        results.failed++;
                        results.failedFields.push({
                            selector,
                            config: fieldConfig,
                            expectedValue,
                            actualValue
                        });
                        console.log(`❌ Field verification failed: ${selector}`);
                        console.log(`   Expected: "${expectedValue}"`);
                        console.log(`   Actual: "${actualValue}"`);
                    }
                }
            } catch (error) {
                console.log(`⚠️  Error verifying field ${selector}: ${error.message}`);
            }
        }
        
        return results;
    }

    /**
     * Check if autofill is actively running for a session
     * @param {string} sessionId - Session ID
     * @returns {boolean} Whether autofill is actively running
     */
    isAutofillActive(sessionId) {
        const activeOps = this.activeFillOperations.get(sessionId);
        return activeOps && activeOps.size > 0;
    }

    /**
     * Mark autofill operation as started
     * @param {string} sessionId - Session ID
     * @param {string} operationId - Operation identifier
     */
    startFillOperation(sessionId, operationId) {
        if (!this.activeFillOperations.has(sessionId)) {
            this.activeFillOperations.set(sessionId, new Set());
        }
        this.activeFillOperations.get(sessionId).add(operationId);
    }

    /**
     * Mark autofill operation as completed
     * @param {string} sessionId - Session ID
     * @param {string} operationId - Operation identifier
     */
    completeFillOperation(sessionId, operationId) {
        const activeOps = this.activeFillOperations.get(sessionId);
        if (activeOps) {
            activeOps.delete(operationId);
            if (activeOps.size === 0) {
                this.activeFillOperations.delete(sessionId);
            }
        }
    }

    /**
     * Execute autofill for a specific hook and page
     * @param {Object} hook - Hook configuration
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async executeAutofill(hook, page, sessionId) {
        const operationId = `${hook.name}-${Date.now()}`;
        this.startFillOperation(sessionId, operationId);
        
        console.log(`🚀 Executing autofill: ${hook.name} (${operationId})`);
        
        // Emit autofill started event
        if (this.eventBus) {
            this.eventBus.emitSessionEvent(sessionId, EVENTS.AUTOFILL_STARTED, {
                hookName: hook.name,
                operationId,
                url: page.url()
            });
        }
        
        try {
            // Generate dynamic data if needed
            let userData = null;
            if (hook.useDynamicGeneration) {
                userData = this.generateFieldValues(hook, sessionId, page.url());
            }
            
            // Execute custom logic first if available
            if (hook.customLogic && typeof hook.customLogic === 'function') {
                await hook.customLogic(page, sessionId, this, userData);
            }
            
            // Get execution settings with improved defaults for race condition handling
            // Apply proxy-aware timeout multipliers if in proxy mode
            const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
            
            // Check session credentials for form submission override
            const sessionCreds = this.getCredentialsForSession(sessionId);
            const shouldAutoSubmit = sessionCreds && sessionCreds.submitForm === true;
            
            const baseSettings = {
                maxAttempts: 3,           // More attempts for better reliability
                pollInterval: 1500,       // Longer polling for dynamic forms
                waitAfterFill: 250,       // Reduced wait time for fields to stabilize
                fieldRetries: 3,          // Retries per field
                fieldRetryDelay: 100,     // Delay between field retries
                verifyFill: true,         // Verify field values after filling
                autoSubmit: shouldAutoSubmit, // Enable if session credentials specify it
                // Enhanced race condition prevention defaults
                stabilityChecks: 2,       // Default stability checks
                stabilityDelay: 250,      // Default stability delay
                minFieldsForSuccess: 2,   // Default minimum fields
                fillSequentially: false,  // Default parallel filling
                sequentialDelay: 300,     // Default sequential delay
                ...hook.execution
            };
            
            // Override autoSubmit with session credentials if specified (takes precedence over hook config)
            if (shouldAutoSubmit) {
                baseSettings.autoSubmit = true;
                console.log(`🔐 Session credentials enable form submission for ${sessionCreds.mode || 'login'} flow`);
            }
            
            // Apply proxy multipliers to time-sensitive settings
            const settings = {
                ...baseSettings,
                pollInterval: Math.round(baseSettings.pollInterval * proxyMultiplier),
                waitAfterFill: Math.round(baseSettings.waitAfterFill * proxyMultiplier),
                fieldRetryDelay: Math.round(baseSettings.fieldRetryDelay * proxyMultiplier),
                stabilityDelay: Math.round(baseSettings.stabilityDelay * proxyMultiplier),
                sequentialDelay: Math.round(baseSettings.sequentialDelay * proxyMultiplier)
            };
            
            if (this.options.proxyMode) {
                console.log(`🌐 Proxy mode: Using ${proxyMultiplier}x timeout multiplier for autofill`);
                console.log(`   Poll interval: ${settings.pollInterval}ms (was ${baseSettings.pollInterval}ms)`);
                console.log(`   Wait after fill: ${settings.waitAfterFill}ms (was ${baseSettings.waitAfterFill}ms)`);
            }
            
            // Poll for form fields
            console.log(`⏳ Polling for form fields (max ${settings.maxAttempts} attempts)...`);
            
            let attempt = 0;
            let fieldsFound = false;
            
            while (attempt < settings.maxAttempts && !fieldsFound) {
                attempt++;
                
                // Check if any target fields exist
                const fieldSelectors = Object.keys(hook.fields);
                let foundCount = 0;
                
                for (const selector of fieldSelectors) {
                    const count = await page.locator(selector).count();
                    if (count > 0) {
                        foundCount++;
                    }
                }
                
                if (foundCount > 0) {
                    fieldsFound = true;
                    console.log(`✅ Found ${foundCount} field(s) on attempt ${attempt}`);
                    break;
                } else {
                    console.log(`🔍 Attempt ${attempt}/${settings.maxAttempts}: No fields found, waiting...`);
                    await page.waitForTimeout(settings.pollInterval);
                }
            }
            
            if (!fieldsFound) {
                console.log(`⏰ No target fields found after ${settings.maxAttempts} attempts`);
                return;
            }
            
            // Wait a bit more to ensure fields are interactive
            await page.waitForTimeout(settings.waitAfterFill);
            
            // Fill fields with improved race condition handling
            // PRIORITIZE fields to minimize race with submit: email -> password -> names -> others
            const selectorsOriginal = Object.keys(hook.fields);
            const priorityOrder = (sel) => {
                if (/type=["']?email|name=["']?email|\[type="email"]|\[name="email"]|form-input-email|placeholder.*email/i.test(sel)) return 1;
                if (/type=["']?password|name=["']?password|form-input-password/i.test(sel)) return 2;
                if (/first|last|full.*name|placeholder.*name/i.test(sel)) return 3;
                return 4;
            };
            const orderedSelectors = selectorsOriginal.sort((a, b) => priorityOrder(a) - priorityOrder(b));

            // Helper to classify selector categories for deduping
            const classifySelector = (sel) => {
                if (/type=["']?email|name=["']?email|\[type="email"]|\[name="email"]|form-input-email|placeholder.*email/i.test(sel)) return 'email';
                if (/type=["']?password|name=["']?password|form-input-password|placeholder.*password/i.test(sel)) return 'password';
                if (/first|last|full.*name|placeholder.*name/i.test(sel)) return 'name';
                return 'other';
            };
            
            let filledCount = 0;
            // Track first-success per single-instance categories to avoid duplicate attempts
            let emailHandled = false;
            let passwordHandled = false;
            
            if (settings.fillSequentially) {
                console.log(`📝 Filling fields sequentially to prevent race conditions...`);
                
                // Sequential filling - wait for each field to complete before moving to next
                for (const selector of orderedSelectors) {
                    const category = classifySelector(selector);
                    if (category === 'email' && emailHandled) {
                        // Skip alternative email selectors once one has succeeded
                        continue;
                    }
                    if (category === 'password' && passwordHandled) {
                        // Skip alternative password selectors once one has succeeded
                        continue;
                    }
                    const fieldConfig = hook.fields[selector];
                    try {
                        console.log(`🎯 Filling field: ${selector.substring(0, 50)}...`);
                        
                        const fieldValue = this.resolveFieldValue(fieldConfig, userData);
                        const success = await this.fillFieldSafely(page, selector, fieldValue, fieldConfig, settings);
                        
                        if (success) {
                            filledCount++;
                            console.log(`✅ Field filled successfully (${filledCount} total)`);

                            // Mark category as handled to prevent duplicate attempts
                            if (category === 'email') emailHandled = true;
                            if (category === 'password') passwordHandled = true;
                            
                            // Stability check after each field
                            if (settings.stabilityChecks > 0) {
                                await page.waitForTimeout(settings.stabilityDelay);
                                
                                // Verify field is still filled
                                try {
                                    const element = await page.locator(selector).first();
                                    const currentValue = await element.inputValue();
                                    if (!currentValue || currentValue.trim() !== fieldValue.trim()) {
                                        console.log(`⚠️  Field ${selector} was cleared, retrying...`);
                                        await this.fillFieldSafely(page, selector, fieldValue, fieldConfig, settings);
                                    }
                                } catch (_) {}
                            }
                            
                            // Sequential delay before next field
                            if (settings.sequentialDelay > 0) {
                                await page.waitForTimeout(settings.sequentialDelay + Math.floor(Math.random() * 200));
                            }
                        }
                    } catch (error) {
                        console.log(`⚠️  Could not fill field ${selector}: ${error.message}`);
                    }
                }
            } else {
                console.log(`📝 Filling fields with parallel approach...`);
                
                // Original parallel approach with enhanced timing
                for (const selector of orderedSelectors) {
                    const category = classifySelector(selector);
                    if (category === 'email' && emailHandled) {
                        continue;
                    }
                    if (category === 'password' && passwordHandled) {
                        continue;
                    }
                    const fieldConfig = hook.fields[selector];
                    try {
                        // Inter-field delay; avoid extra scroll/mouse when minimalInterference is on
                        const interDelay = 120 + Math.floor(Math.random() * 320); // 120-440ms
                        if (!this.options.minimalInterference) {
                            if (Math.random() < 0.15) {
                                const dy = 30 + Math.floor(Math.random() * 80);
                                await page.mouse.wheel(0, dy);
                            }
                            if (Math.random() < 0.25) {
                                const x = 100 + Math.floor(Math.random() * 800);
                                const y = 120 + Math.floor(Math.random() * 500);
                                await page.mouse.move(x, y, { steps: 2 + Math.floor(Math.random() * 4) });
                            }
                        }
                        await page.waitForTimeout(interDelay);
                        
                        const fieldValue = this.resolveFieldValue(fieldConfig, userData);
                        const success = await this.fillFieldSafely(page, selector, fieldValue, fieldConfig, settings);
                        if (success) {
                            filledCount++;
                            // Small randomized pause after successful fill
                            await page.waitForTimeout(120 + Math.floor(Math.random() * 240));

                            if (category === 'email') emailHandled = true;
                            if (category === 'password') passwordHandled = true;
                        }
                    } catch (error) {
                        console.log(`⚠️  Could not fill field ${selector}: ${error.message}`);
                    }
                }
            }
            
            console.log(`🎉 Autofill completed: ${filledCount} fields filled`);
            
            // Verify filled fields if verification is enabled
            let finalFilledCount = filledCount;
            if (settings.verifyFill && filledCount > 0) {
                console.log(`🔍 Verifying filled fields...`);
                const verificationResults = await this.verifyFilledFields(page, hook.fields, userData);
                if (verificationResults.failed > 0) {
                    console.log(`⚠️  Field verification: ${verificationResults.verified} verified, ${verificationResults.failed} failed`);
                    
                    // Retry failed fields once more
                    for (const failedField of verificationResults.failedFields) {
                        console.log(`🔄 Retrying failed field: ${failedField.selector}`);
                        const retrySuccess = await this.fillFieldSafely(page, failedField.selector, failedField.expectedValue, failedField.config, settings);
                        if (retrySuccess && finalFilledCount === filledCount) {
                            finalFilledCount++; // Count the successful retry
                        }
                    }
                } else {
                    console.log(`✅ All ${verificationResults.verified} fields verified successfully`);
                    finalFilledCount = verificationResults.verified;
                }
            }
            
            // Enhanced completion logic - verify critical fields before marking complete
            let criticalFieldsFilled = 0;
            const criticalFieldSelectors = [
                'input[data-testid="form-input-email"]',
                'input[name="email"]',
                'input[type="email"]'
            ];
            const passwordFieldSelectors = [
                'input[data-testid="form-input-password"]',
                'input[name="password"]',
                'input[type="password"]'
            ];

            // Detect presence of email/password fields on the page
            let emailFieldPresent = false;
            let passwordFieldPresent = false;
            try {
                for (const selector of criticalFieldSelectors) {
                    const cnt = await page.locator(selector).count().catch(() => 0);
                    if (cnt > 0) { emailFieldPresent = true; break; }
                }
                for (const selector of passwordFieldSelectors) {
                    const cnt = await page.locator(selector).count().catch(() => 0);
                    if (cnt > 0) { passwordFieldPresent = true; break; }
                }
            } catch (_) {}

            // Check email fields
            let emailFilled = false;
            for (const selector of criticalFieldSelectors) {
                try {
                    const loc = page.locator(selector).first();
                    const cnt = await loc.count().catch(() => 0);
                    if (cnt > 0) {
                        const value = await loc.inputValue().catch(() => '');
                        if (value && value.includes('@') && value.length > 5) {
                            emailFilled = true;
                            criticalFieldsFilled++;
                            break;
                        }
                    }
                } catch (_) {}
            }
            
            // Check password fields
            let passwordFilled = false;
            for (const selector of passwordFieldSelectors) {
                try {
                    const loc = page.locator(selector).first();
                    const cnt = await loc.count().catch(() => 0);
                    if (cnt > 0) {
                        const value = await loc.inputValue().catch(() => '');
                        if (value && value.length >= 8) {
                            passwordFilled = true;
                            criticalFieldsFilled++;
                            break;
                        }
                    }
                } catch (_) {}
            }
            
            console.log(`🔍 Critical fields status: present(email=${emailFieldPresent}, password=${passwordFieldPresent}) filled(email=${emailFilled}, password=${passwordFilled}), total filled=${finalFilledCount}`);
            
            // Completion policy:
            // - If hook requires both email and password, wait for both regardless of field presence
            // - If a password field is present, require BOTH email and password to be filled
            // - If no password field is present, allow completion when either email is filled OR enough fields overall
            const requiresBoth = settings.requireBothEmailAndPassword === true;
            
            if (requiresBoth) {
                console.log(`🔄 Two-step mode: waiting for both email AND password (email: ${emailFilled}, password: ${passwordFilled})`);
            }
            
            const shouldMarkComplete = requiresBoth
                ? (emailFilled && passwordFilled)
                : passwordFieldPresent
                    ? (emailFilled && passwordFilled)
                    : (emailFilled || finalFilledCount >= this.options.minFieldsForSuccess);
            
            if (shouldMarkComplete) {
                this.markSessionCompleted(sessionId, hook.name, finalFilledCount);
                
                console.log(`✅ Autofill completion marked: ${finalFilledCount} fields (email: ${emailFilled}, password: ${passwordFilled}, pwdPresent: ${passwordFieldPresent})`);
                
                // Emit autofill completed event
                if (this.eventBus) {
                    this.eventBus.emitSessionEvent(sessionId, EVENTS.AUTOFILL_COMPLETED, {
                        hookName: hook.name,
                        operationId,
                        fieldsFilledCount: finalFilledCount,
                        emailFilled,
                        passwordFilled,
                        emailFieldPresent,
                        passwordFieldPresent,
                        url: page.url()
                    });
                }
                
                // If stop on success is enabled, we can stop monitoring this hook for this session
                if (this.options.stopOnSuccess && !this.options.enforceMode) {
                    console.log(`🛑 Autofill goal achieved for ${hook.name} - stopping further attempts`);
                }
            } else if (finalFilledCount > 0) {
                console.log(`⚠️  Partial success (${finalFilledCount}/${this.options.minFieldsForSuccess} fields, criticalFilled: ${criticalFieldsFilled}, pwdPresent: ${passwordFieldPresent}) — will retry if page changes`);
            }

            // Post-fill watcher: if a refresh clears both email and password, re-attempt within a bounded window
            try {
                const watchNeeded = (emailFieldPresent && passwordFieldPresent);
                if (watchNeeded) {
                    this.#setupPostRefreshWatcher({ page, sessionId, hook, windowMs: this.options.postRefreshWatchWindowMs });
                }
            } catch (e) {
                console.log(`⚠️  Could not setup post-refresh watcher: ${e.message}`);
            }
            
            // Detect submit buttons (but don't click unless autoSubmit is enabled)
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button[data-testid="signup-button"]',
                'button:has-text("Sign in")',
                'button:has-text("Login")',
                'button:has-text("Submit")',
                'button:has-text("Create")'
            ];
            
            let submitButtonFound = false;
            for (const selector of submitSelectors) {
                const submitButton = page.locator(selector);
                if (await submitButton.count() > 0) {
                    try {
                        const buttonText = await submitButton.first().textContent();
                        console.log(`🔘 Found submit button: "${buttonText}" (${settings.autoSubmit ? 'will click' : 'not clicking for safety'})`);
                        submitButtonFound = true;
                        
                        if (settings.autoSubmit) {
                            await submitButton.first().click();
                            console.log(`✅ Form submitted automatically`);
                        }
                        break;
                    } catch (error) {
                        console.log(`⚠️  Could not read submit button text: ${error.message}`);
                    }
                }
            }
            
            if (!submitButtonFound) {
                console.log(`ℹ️  No submit button detected on this page`);
            }
            
        } catch (error) {
            console.error(`❌ Error executing autofill ${hook.name}:`, error.message);
            
            // Remove from processed pages on error for retry
            const pageKey = `${sessionId}-${page.url()}-${hook.name}`;
            this.processedPages.delete(pageKey);
        } finally {
            // Always mark operation as completed
            this.completeFillOperation(sessionId, operationId);
            console.log(`✅ Autofill operation completed: ${operationId}`);
        }
    }

    /**
     * Stop monitoring for a session
     * @param {string} sessionId - Session ID
     */
    stopMonitoring(sessionId) {
        const monitor = this.activeMonitors.get(sessionId);
        if (monitor) {
            // Remove page event listener
            monitor.context.off('page', monitor.pageHandler);
            
            // Remove autofill request event listener
            if (monitor.autofillRequestListener) {
                try {
                    monitor.autofillRequestListener(); // Call unsubscribe function
                } catch (error) {
                    console.log(`⚠️  Error unsubscribing from autofill request events: ${error.message}`);
                }
            }
            
            this.activeMonitors.delete(sessionId);
        }
        
        // Clean up processed pages
        this.cleanupProcessedPages(sessionId);
        
        console.log(`🛑 Stopped autofill monitoring for session: ${sessionId}`);
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
        
        // Also clean up completion tracking
        const completionKeysToDelete = [];
        for (const [key] of this.completedSessions) {
            if (key.startsWith(`${sessionId}-`)) {
                completionKeysToDelete.push(key);
            }
        }
        completionKeysToDelete.forEach(key => this.completedSessions.delete(key));
        
        // Clean up field counts
        this.sessionFieldCounts.delete(sessionId);
    }

    /**
     * Clear processed page marks for a session, optionally limited to a hook name.
     * This allows re-processing of the same URL after a soft refresh.
     */
    clearProcessedPageMarks(sessionId, hookName = null) {
        const toDelete = [];
        for (const [key] of this.processedPages) {
            if (!key.startsWith(`${sessionId}-`)) continue;
            if (hookName) {
                if (key.endsWith(`-${hookName}`)) toDelete.push(key);
            } else {
                toDelete.push(key);
            }
        }
        toDelete.forEach(k => this.processedPages.delete(k));
        if (toDelete.length > 0) {
            console.log(`🧹 Cleared ${toDelete.length} processed page mark(s) for session ${sessionId}${hookName ? ` hook ${hookName}` : ''}`);
        }
    }

    /**
     * Internal: watch for a brief period after fills to detect refresh that clears both email and password fields,
     * then re-attempt autofill. Bounded by maxPostRefreshRetries and window duration.
     */
    #setupPostRefreshWatcher({ page, sessionId, hook, windowMs }) {
        const retryKey = `${sessionId}-${hook.name}`;
        const maxRetries = this.options.maxPostRefreshRetries;
        if (maxRetries <= 0) return;

        const start = Date.now();
        let triggered = false;
        let intervalId = null;

        const stop = () => {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
            try { page.off('framenavigated', onNav); } catch (_) {}
            try { page.off('load', onLoad); } catch (_) {}
        };

        const checkCleared = async () => {
            if (triggered) return false;
            // Skip if we are already actively filling
            if (this.isAutofillActive(sessionId)) return false;
            // Only within window
            if (Date.now() - start > windowMs) { stop(); return false; }
            try {
                const emailSel = await this.#firstPresent(page, [
                    'input[data-testid="form-input-email"]',
                    'input[name="email"]',
                    'input[type="email"]',
                    'input[id*="email" i]'
                ]);
                const passSel = await this.#firstPresent(page, [
                    'input[data-testid="form-input-password"]',
                    'input[name="password"]',
                    'input[type="password"]',
                    'input[id*="password" i]'
                ]);
                if (!emailSel || !passSel) return false;
                const emailVal = await page.locator(emailSel).first().inputValue().catch(() => '');
                const passVal = await page.locator(passSel).first().inputValue().catch(() => '');
                const bothEmpty = (!emailVal || emailVal.trim() === '') && (!passVal || passVal.trim() === '');
                if (!bothEmpty) return false;

                const used = this.postRefreshRetryCounts.get(retryKey) || 0;
                if (used >= maxRetries) { stop(); return false; }

                triggered = true; // ensure single fire per window
                this.postRefreshRetryCounts.set(retryKey, used + 1);
                console.log(`🔁 Detected cleared auth fields post-refresh (attempt ${used + 1}/${maxRetries}). Re-attempting autofill for ${hook.name}...`);

                // Allow re-processing by clearing processed marks
                this.clearProcessedPageMarks(sessionId, hook.name);

                // Re-run autofill directly to avoid dedupe
                await this.executeAutofill(hook, page, sessionId);

                stop();
                return true;
            } catch (e) {
                // Non-fatal
                return false;
            }
        };

        const onNav = async () => { setTimeout(() => { checkCleared(); }, 300); };
        const onLoad = async () => { setTimeout(() => { checkCleared(); }, 300); };

        // Hook events and polling
        try { page.on('framenavigated', onNav); } catch (_) {}
        try { page.on('load', onLoad); } catch (_) {}
        intervalId = setInterval(checkCleared, Math.max(500, this.options.postRefreshCheckIntervalMs));

        // Auto-clean on page close
        page.once('close', () => stop());
    }

    // Lightweight helper: first present selector from list
    async #firstPresent(page, selectors) {
        for (const sel of selectors) {
            try {
                const loc = page.locator(sel).first();
                const cnt = await loc.count();
                if (cnt > 0) return sel;
            } catch (_) {}
        }
        return null;
    }

    /**
     * Get status information about the autofill system
     * @returns {Object} Status information
     */
    getStatus() {
        const hooksByName = new Map();
        for (const [pattern, hook] of this.hooks) {
            if (!hooksByName.has(hook.name)) {
                hooksByName.set(hook.name, {
                    name: hook.name,
                    description: hook.description,
                    enabled: hook.enabled,
                    useDynamicGeneration: hook.useDynamicGeneration || false,
                    patterns: []
                });
            }
            hooksByName.get(hook.name).patterns.push(pattern);
        }
        
        const generatorStats = this.dataGenerator.getStatistics();
        
        return {
            totalHooks: hooksByName.size,
            totalPatterns: this.hooks.size,
            activeSessions: this.activeMonitors.size,
            processedPages: this.processedPages.size,
            completedSessions: this.completedSessions.size,
            activeFillOperations: Array.from(this.activeFillOperations.entries()).reduce((total, [sessionId, ops]) => total + ops.size, 0),
            options: {
                stopOnSuccess: this.options.stopOnSuccess,
                enforceMode: this.options.enforceMode,
                minFieldsForSuccess: this.options.minFieldsForSuccess,
                successCooldown: this.options.successCooldown
            },
            hooks: Array.from(hooksByName.values()),
            dataGenerator: {
                trackingEnabled: generatorStats.trackingEnabled,
                ...generatorStats
            }
        };
    }

    /**
     * Reload hooks from configuration directory
     * @param {string} configDir - Configuration directory
     */
    async reloadHooks(configDir = './autofill-hooks') {
        console.log(`🔄 Reloading autofill hooks...`);
        this.hooks.clear();
        await this.loadHooks(configDir);
    }
    
    /**
     * Export generated user data to CSV format
     * @param {string} format - Export format ('csv', 'chrome', 'apple', '1password')
     * @param {string} outputPath - Output file path (optional)
     */
    async exportUserData(format = 'csv', outputPath = null) {
        try {
            let result;
            
            switch (format.toLowerCase()) {
                case 'csv':
                case 'chrome':
                    result = await this.dataGenerator.exportToCSV(outputPath);
                    break;
                    
                case 'apple':
                case 'keychain':
                    result = await this.dataGenerator.exportToAppleKeychain(outputPath);
                    break;
                    
                case '1password':
                case '1p':
                    result = await this.dataGenerator.exportTo1Password(outputPath);
                    break;
                    
                default:
                    throw new Error(`Unsupported export format: ${format}. Use 'csv', 'apple', or '1password'`);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Error exporting user data (${format}):`, error.message);
            throw error;
        }
    }
    
    /**
     * Get all generated user data records
     */
    getUserDataRecords() {
        return this.dataGenerator.getAllUserDataRecords();
    }
    
    /**
     * Get completion status for a session
     * @param {string} sessionId - Session ID
     * @returns {Object} Completion status
     */
    getSessionCompletionStatus(sessionId) {
        const completions = [];
        const fieldCounts = this.sessionFieldCounts.get(sessionId) || new Map();
        
        for (const [key, completion] of this.completedSessions) {
            if (key.startsWith(`${sessionId}-`)) {
                completions.push({
                    hookName: completion.hookName,
                    filledFields: completion.filledFields,
                    timestamp: completion.timestamp,
                    timeSinceCompletion: Date.now() - completion.timestamp
                });
            }
        }
        
        return {
            sessionId,
            hasCompletions: completions.length > 0,
            completions,
            totalFieldsFilled: Array.from(fieldCounts.values()).reduce((sum, count) => sum + count, 0),
            hooksCompleted: completions.length
        };
    }
    
    /**
     * Force re-enable autofill for a session (clears completion status)
     * @param {string} sessionId - Session ID
     * @param {string} hookName - Optional hook name (if not provided, clears all for session)
     */
    forceReEnable(sessionId, hookName = null) {
        if (hookName) {
            const sessionKey = `${sessionId}-${hookName}`;
            this.completedSessions.delete(sessionKey);
            console.log(`🔄 Force re-enabled autofill for ${hookName} in session ${sessionId}`);
        } else {
            const keysToDelete = [];
            for (const [key] of this.completedSessions) {
                if (key.startsWith(`${sessionId}-`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.completedSessions.delete(key));
            console.log(`🔄 Force re-enabled all autofill for session ${sessionId}`);
        }
    }
    
    /**
     * Clean up resources and close connections
     */
    cleanup() {
        // Stop all monitoring
        for (const sessionId of this.activeMonitors.keys()) {
            this.stopMonitoring(sessionId);
        }
        
        // Close data generator resources
        if (this.dataGenerator) {
            this.dataGenerator.close();
        }
        
        console.log(`🧹 AutofillHookSystem cleanup completed`);
    }
}
