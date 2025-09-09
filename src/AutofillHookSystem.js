import fs from 'fs-extra';
import path from 'path';

/**
 * AutofillHookSystem - A generalized system for handling form autofill based on URL patterns
 * and configurable field mappings. This system uses a hook-based approach where different
 * autofill configurations can be loaded dynamically.
 */
export class AutofillHookSystem {
    constructor() {
        this.hooks = new Map(); // URL pattern -> hook configuration
        this.processedPages = new Map(); // Track processed pages to avoid duplicates
        this.activeMonitors = new Map(); // Track active page monitors per session
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
     * Execute autofill for a specific hook and page
     * @param {Object} hook - Hook configuration
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async executeAutofill(hook, page, sessionId) {
        console.log(`🚀 Executing autofill: ${hook.name}`);
        
        try {
            // Execute custom logic first if available
            if (hook.customLogic && typeof hook.customLogic === 'function') {
                await hook.customLogic(page, sessionId, this);
            }
            
            // Get execution settings
            const settings = {
                maxAttempts: 5,
                pollInterval: 1000,
                waitAfterFill: 200,
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
            
            // Fill fields
            let filledCount = 0;
            for (const [selector, fieldConfig] of Object.entries(hook.fields)) {
                try {
                    const field = page.locator(selector);
                    const count = await field.count();
                    
                    if (count > 0) {
                        console.log(`📝 Filling field: ${fieldConfig.description || selector}`);
                        await field.first().clear();
                        await field.first().fill(fieldConfig.value);
                        filledCount++;
                        console.log(`✅ Field filled: ${fieldConfig.value}`);
                    }
                } catch (error) {
                    console.log(`⚠️  Could not fill field ${selector}: ${error.message}`);
                }
            }
            
            console.log(`🎉 Autofill completed: ${filledCount} fields filled`);
            
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
                    patterns: []
                });
            }
            hooksByName.get(hook.name).patterns.push(pattern);
        }
        
        return {
            totalHooks: hooksByName.size,
            totalPatterns: this.hooks.size,
            activeSessions: this.activeMonitors.size,
            processedPages: this.processedPages.size,
            hooks: Array.from(hooksByName.values())
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
}
