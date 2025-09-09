import fs from 'fs-extra';
import path from 'path';
import { RandomDataGenerator } from './RandomDataGenerator.js';

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
        
        // Initialize random data generator
        this.dataGenerator = new RandomDataGenerator({
            usePrefix: options.usePrefix || false,
            usePostfix: options.usePostfix !== false, // default true
            postfixDigits: options.postfixDigits || 4,
            emailProviders: options.emailProviders,
            customEmailProviders: options.customEmailProviders,
            enableTracking: options.enableTracking || false,
            trackingDbPath: options.trackingDbPath || './profiles/data/generated_names.db',
            passwordLength: options.passwordLength,
            passwordComplexity: options.passwordComplexity
        });
        
        console.log(`🎲 RandomDataGenerator initialized with tracking: ${this.dataGenerator.config.enableTracking}`);
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
        
        // Store the handler for cleanup
        this.activeMonitors.set(sessionId, { context, pageHandler });

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
            // Wait for page to load
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            const url = page.url();
            
            if (!url || url === 'about:blank') return;
            
            console.log(`🔗 Checking page for autofill: ${url}`);
            
            // Find matching hooks
            const matchingHooks = this.findMatchingHooks(url);
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                const pageKey = `${sessionId}-${url}-${hook.name}`;
                
                // Avoid duplicate processing
                if (this.processedPages.has(pageKey)) {
                    console.log(`⏭️  Skipping ${hook.name} - already processed`);
                    continue;
                }
                
                console.log(`🎯 AUTOFILL MATCH: ${hook.name}`);
                console.log(`   Description: ${hook.description}`);
                console.log(`   URL: ${url}`);
                
                // Mark as processed
                this.processedPages.set(pageKey, true);
                
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
        // Check if hook supports dynamic generation
        if (!hook.useDynamicGeneration) {
            return null;
        }
        
        const options = {
            usePrefix: hook.generationOptions?.usePrefix,
            usePostfix: hook.generationOptions?.usePostfix,
            currentIndex: this.getSessionIndex(sessionId),
            password: hook.generationOptions?.password,
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
                
                // Wait for field to be visible and enabled
                await firstField.waitFor({ 
                    state: 'visible', 
                    timeout: 2000 
                }).catch(() => {
                    console.log(`⚠️  Field not visible: ${selector}`);
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
                
                // Focus the field first to ensure it's active
                await firstField.focus();
                await page.waitForTimeout(50); // Small delay after focus
                
                // Clear field with multiple methods for better reliability
                await this.clearFieldSafely(firstField);
                
                // Fill the value
                await firstField.fill(value);
                
                // Verify the value was actually set
                const actualValue = await firstField.inputValue().catch(() => '');
                
                if (actualValue === value) {
                    console.log(`✅ Field filled successfully: ${value.length > 50 ? value.substring(0, 47) + '...' : value}`);
                    return true;
                } else {
                    console.log(`⚠️  Value mismatch (attempt ${attempt}). Expected: "${value}", Got: "${actualValue}"`);
                    
                    if (attempt < maxRetries) {
                        // Try alternative filling method
                        await firstField.focus();
                        await this.clearFieldSafely(firstField);
                        await firstField.pressSequentially(value, { delay: 10 });
                        
                        const retryValue = await firstField.inputValue().catch(() => '');
                        if (retryValue === value) {
                            console.log(`✅ Field filled with pressSequentially: ${value.length > 50 ? value.substring(0, 47) + '...' : value}`);
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
     * Execute autofill for a specific hook and page
     * @param {Object} hook - Hook configuration
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async executeAutofill(hook, page, sessionId) {
        console.log(`🚀 Executing autofill: ${hook.name}`);
        
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
            const settings = {
                maxAttempts: 3,           // More attempts for better reliability
                pollInterval: 1500,       // Longer polling for dynamic forms
                waitAfterFill: 500,       // More time for fields to stabilize
                fieldRetries: 3,          // Retries per field
                fieldRetryDelay: 100,     // Delay between field retries
                verifyFill: true,         // Verify field values after filling
                autoSubmit: false,
                ...hook.execution
            };
            
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
            let filledCount = 0;
            for (const [selector, fieldConfig] of Object.entries(hook.fields)) {
                try {
                    const fieldValue = this.resolveFieldValue(fieldConfig, userData);
                    const success = await this.fillFieldSafely(page, selector, fieldValue, fieldConfig, settings);
                    if (success) {
                        filledCount++;
                    }
                } catch (error) {
                    console.log(`⚠️  Could not fill field ${selector}: ${error.message}`);
                }
            }
            
            console.log(`🎉 Autofill completed: ${filledCount} fields filled`);
            
            // Verify filled fields if verification is enabled
            if (settings.verifyFill && filledCount > 0) {
                console.log(`🔍 Verifying filled fields...`);
                const verificationResults = await this.verifyFilledFields(page, hook.fields, userData);
                if (verificationResults.failed > 0) {
                    console.log(`⚠️  Field verification: ${verificationResults.verified} verified, ${verificationResults.failed} failed`);
                    
                    // Retry failed fields once more
                    for (const failedField of verificationResults.failedFields) {
                        console.log(`🔄 Retrying failed field: ${failedField.selector}`);
                        await this.fillFieldSafely(page, failedField.selector, failedField.expectedValue, failedField.config, settings);
                    }
                } else {
                    console.log(`✅ All ${verificationResults.verified} fields verified successfully`);
                }
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
        }
    }

    /**
     * Stop monitoring for a session
     * @param {string} sessionId - Session ID
     */
    stopMonitoring(sessionId) {
        const monitor = this.activeMonitors.get(sessionId);
        if (monitor) {
            // Remove event listener
            monitor.context.off('page', monitor.pageHandler);
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
