import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { EVENTS } from './ProfileEventBus.js';
import { RandomDataGenerator } from './RandomDataGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AutomationHookSystem - A system for handling complete automation workflows
 * including autofill, human-like interactions, form submission, and success monitor
 */
export class AutomationHookSystem {
    constructor(options = {}) {
        this.hooks = new Map(); // URL pattern -> automation hook configuration
        this.activeAutomations = new Map(); // Track active automations per session
        this.completedAutomations = new Map(); // Track completed automations
        this.options = {
            maxRetries: options.maxRetries || 3,
            defaultTimeout: options.defaultTimeout || 30000,
            humanDelayMin: options.humanDelayMin || 500,
            humanDelayMax: options.humanDelayMax || 2000,
            scrollDelayMin: options.scrollDelayMin || 200,
            scrollDelayMax: options.scrollDelayMax || 800,
            // Global guard so we never hang indefinitely (2 minutes default)
            globalTimeout: options.globalTimeout || 120000,
            ...options
        };

        // EventBus for coordinating with other systems
        this.eventBus = options.eventBus || null;
        this.autofillCompletionListeners = new Map(); // Track autofill completion listeners per session

        // Track processed hook runs to prevent infinite re-execution loops on the same URL
        this.processedHookRuns = new Set();

        console.log(`🤖 AutomationHookSystem initialized`);
        // Ensure per-session behavior flags and a local data generator for automation-owned fill
        this.options.automationAutofillOnly = !!this.options.automationAutofillOnly;
        this.dataGenerator = new RandomDataGenerator({
            enableTracking: false,
            trackingDbPath: './profiles/data/generated_names.db'
        });
    }

    /**
     * Load automation hooks from configuration files
     * @param {string} configDir - Directory containing automation configuration files
     */
    async loadHooks(configDir = './automation-hooks') {
        try {
            if (!await fs.pathExists(configDir)) {
                console.log(`📁 Creating automation hooks directory: ${configDir}`);
                await fs.ensureDir(configDir);
                return;
            }

            const files = await fs.readdir(configDir);
            const jsFiles = files.filter(file => file.endsWith('.js'));

            if (jsFiles.length === 0) {
                console.log(`📝 No automation hooks found in ${configDir}`);
                return;
            }

            console.log(`📋 Loading ${jsFiles.length} automation hooks from ${configDir}`);

            for (const file of jsFiles) {
                try {
                    const hookPath = path.join(configDir, file);
                    const { default: hookConfig } = await import(path.resolve(hookPath));

                    if (this.validateHookConfig(hookConfig)) {
                        this.registerHook(hookConfig);
                        console.log(`✅ Loaded automation hook: ${hookConfig.name}`);
                    } else {
                        console.log(`❌ Invalid automation hook configuration in ${file}`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading automation hook ${file}:`, error.message);
                }
            }

            console.log(`🎯 Total automation hooks loaded: ${this.hooks.size}`);
        } catch (error) {
            console.error(`❌ Error loading automation hooks from ${configDir}:`, error.message);
        }
    }

    /**
     * Validate automation hook configuration structure
     * @param {Object} config - Hook configuration to validate
     * @returns {boolean} Whether configuration is valid
     */
    validateHookConfig(config) {
        if (!config || typeof config !== 'object') return false;
        if (!config.name || typeof config.name !== 'string') return false;
        if (!config.urlPatterns || !Array.isArray(config.urlPatterns)) return false;
        if (!config.workflow || typeof config.workflow !== 'object') return false;

        return true;
    }

    /**
     * Register a new automation hook
     * @param {Object} hookConfig - Hook configuration
     */
    registerHook(hookConfig) {
        for (const pattern of hookConfig.urlPatterns) {
            this.hooks.set(pattern, hookConfig);
        }
        console.log(`🔗 Registered automation hook: ${hookConfig.name} for ${hookConfig.urlPatterns.length} URL patterns`);
    }

    /**
     * Start automation monitoring for a browser context
     * @param {string} sessionId - Session ID
     * @param {Object} context - Playwright browser context
     * @param {Object} requestCaptureSystem - Request capture system instance
     * @param {Object} autofillSystem - Autofill system instance
     */
    async startAutomation(sessionId, context, requestCaptureSystem, autofillSystem) {
        if (this.hooks.size === 0) {
            console.log(`⚠️  No automation hooks loaded, skipping automation for session: ${sessionId}`);
            return;
        }

        console.log(`🚀 Starting automation for session: ${sessionId}`);
        console.log(`🎯 Monitoring ${this.hooks.size} automation patterns`);

        const automationEntry = {
            context,
            requestCaptureSystem,
            autofillSystem,
            startTime: Date.now(),
            status: 'active',
            captchaDetected: false,
            automationAutofillOnly: !!this.options.automationAutofillOnly
        };
        this.activeAutomations.set(sessionId, automationEntry);

        // Global timeout to prevent indefinite runs (does not auto-close browser)
        if (this.options.globalTimeout && this.options.globalTimeout > 0) {
            automationEntry.timeoutHandle = setTimeout(() => {
                const a = this.activeAutomations.get(sessionId);
                if (a && a.status === 'active') {
                    console.warn(`⏰ Automation global timeout reached for session: ${sessionId}`);
                    this.markAutomationCompleted(sessionId, '__global__', 'failed', `Global timeout ${this.options.globalTimeout}ms`);
                    this.stopAutomation(sessionId);
                }
            }, this.options.globalTimeout);
        }

        const pageHandler = async (page) => {
            await this.handleNewPage(page, sessionId);
        };

        context.on('page', pageHandler);

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
            await page.waitForLoadState('domcontentloaded');

            const url = page.url();
            console.log(`🔍 Checking automation for URL: ${url}`);

            const matchingHooks = this.findMatchingHooks(url);

            if (matchingHooks.length > 0) {
                console.log(`🎯 Found ${matchingHooks.length} matching automation hooks for: ${url}`);

                const baseUrl = (url || '').split('#')[0];
                for (const hook of matchingHooks) {
                    const allowRerun = hook.options && hook.options.allowRerun === true;
                    const runKey = `${sessionId}|${hook.name}|${baseUrl}`;
                    if (!allowRerun && this.processedHookRuns.has(runKey)) {
                        console.log(`⏭️  Skipping already processed automation: ${hook.name} for ${baseUrl}`);
                        continue;
                    }
                    this.processedHookRuns.add(runKey);

                    console.log(`🚀 Executing automation hook: ${hook.name}`);
                    await this.executeAutomation(hook, page, sessionId);
                }
            }
        } catch (error) {
            console.error(`❌ Error handling new page for automation:`, error.message);
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
                matches.push(hook);
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

        if (pattern instanceof RegExp) {
            return pattern.test(url);
        }

        if (typeof pattern === 'string') {
            if (pattern.includes('*')) {
                const regexPattern = pattern
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\\\*/g, '.*');
                return new RegExp(regexPattern).test(url);
            }
            return url.includes(pattern);
        }

        return false;
    }

    /**
     * Execute complete automation workflow for a hook
     * @param {Object} hook - Hook configuration
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async executeAutomation(hook, page, sessionId) {
        try {
            const automation = this.activeAutomations.get(sessionId);
            if (!automation) {
                console.log(`❌ No active automation found for session: ${sessionId}`);
                return;
            }

            console.log(`🎭 Starting automation workflow: ${hook.name}`);

            const workflow = hook.workflow;
            let currentStep = 0;
            const totalSteps = Object.keys(workflow).length;

            for (const [stepName, stepConfig] of Object.entries(workflow)) {
                currentStep++;
                console.log(`📋 Step ${currentStep}/${totalSteps}: ${stepName}`);

                try {
                    await this.executeStep(stepName, stepConfig, page, sessionId, hook);
                } catch (stepError) {
                    console.error(`❌ Error in step ${stepName}:`, stepError.message);

                    if (stepConfig.required !== false) {
                        throw new Error(`Required step ${stepName} failed: ${stepError.message}`);
                    } else {
                        console.log(`⚠️  Optional step ${stepName} failed, continuing...`);
                    }
                }
            }

            console.log(`✅ Automation workflow completed: ${hook.name}`);
            this.markAutomationCompleted(sessionId, hook.name, 'success');

        } catch (error) {
            console.error(`❌ Automation workflow failed for ${hook.name}:`, error.message);
            this.markAutomationCompleted(sessionId, hook.name, 'failed', error.message);
        }
    }

    /**
     * Execute a single automation step
     */
    async executeStep(stepName, stepConfig, page, sessionId, hook) {
        const stepType = stepConfig.type;

        switch (stepType) {
            case 'wait_for_autofill':
                await this.waitForAutofill(stepConfig, page, sessionId);
                break;

            case 'human_interactions':
                await this.performHumanInteractions(stepConfig, page);
                break;

            case 'click_submit':
                await this.clickSubmit(stepConfig, page, sessionId);
                break;

            case 'monitor_success':
                await this.monitorSuccess(stepConfig, page, sessionId);
                break;

            case 'custom_script':
                await this.executeCustomScript(stepConfig, page, sessionId, hook);
                break;

            case 'automation_fill':
                await this.automationFill(stepConfig, page, sessionId, hook);
                break;

            case 'detect_captcha':
                await this.detectCaptcha(stepConfig, page, sessionId, hook);
                break;

            default:
                throw new Error(`Unknown step type: ${stepType}`);
        }
    }

    /**
     * Wait for autofill to complete using event-driven approach.
     * If the event payload lacks critical field details, optionally verifies DOM.
     */
    async waitForAutofill(stepConfig, page, sessionId) {
        console.log(`⏳ Waiting for autofill to complete using event-driven approach...`);

        // Apply proxy-aware timeout multipliers
        const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
        const baseTimeout = stepConfig.timeout || this.options.defaultTimeout;
        const timeout = Math.round(baseTimeout * proxyMultiplier);
        const allowProceedWithoutFields = stepConfig.allowProceedWithoutFields === true;
        const baseGraceMs = stepConfig.postAutofillGraceMs || (200 + Math.floor(Math.random() * 300));
        const postAutofillGraceMs = Math.round(baseGraceMs * proxyMultiplier);
        
        if (this.options.proxyMode) {
            console.log(`🌐 Proxy mode: Autofill wait timeout ${timeout}ms (was ${baseTimeout}ms, ${proxyMultiplier}x multiplier)`);
        }

        // Special-case bypasses (e.g., extension install flows)
        // Only bypass if the page truly has NO input fields after a short, proxy-aware probe.
        const url = page.url() || '';
        const isInstallFlow = url.includes('extension_install') || url.includes('extension_login_success');
        if (isInstallFlow && allowProceedWithoutFields) {
            try {
                const probeSelectors = stepConfig.expectedFields && stepConfig.expectedFields.length
                    ? stepConfig.expectedFields
                    : [
                        'input[data-testid="form-input-email"]',
                        'input[name="email"]',
                        'input[type="email"]',
                        'input[data-testid="form-input-password"]',
                        'input[name="password"]',
                        'input[type="password"]'
                    ];
                // Probe with proxy-aware attempts/delay to avoid premature bypass on slow pages
                const baseProbeAttempts = stepConfig.bypassAfterAttempts || 3;
                const probeAttempts = Math.max(baseProbeAttempts, Math.ceil(baseProbeAttempts * proxyMultiplier));
                const baseProbeDelay = 300;
                const probeDelay = Math.round(baseProbeDelay * proxyMultiplier);
                let hasAnyField = false;
                for (let i = 0; i < probeAttempts && !hasAnyField; i++) {
                    for (const sel of probeSelectors) {
                        try {
                            const count = await page.locator(sel).count().catch(() => 0);
                            if (count > 0) { hasAnyField = true; break; }
                        } catch (_) {}
                    }
                    if (!hasAnyField) {
                        await page.waitForTimeout(probeDelay);
                    }
                }
                if (!hasAnyField) {
                    console.log(`⤴️  Bypassing autofill wait for extension install flow (no fields detected after ${probeAttempts}x${probeDelay}ms probes)`);
                    await page.waitForTimeout(600 + Math.floor(Math.random() * 900));
                    return;
                } else {
                    console.log(`🔎 Fields detected on install flow; not bypassing autofill wait`);
                }
            } catch (_) {
                // If probing fails, fall back to not bypassing to be safe
                console.log(`⚠️  Probe error; not bypassing autofill wait`);
            }
        }

        if (!this.eventBus) {
            console.log(`⚠️  No EventBus available, falling back to polling approach`);
            return this.waitForAutofillFallback(stepConfig, page, sessionId);
        }

        // Helper: verify DOM state for expected fields if provided
        const verifyDomIfNeeded = async () => {
            const selectors = stepConfig.expectedFields || [];
            if (selectors.length === 0) return true;

            const minFilledFields = stepConfig.minFilledFields || selectors.length;
            let filledCount = 0;

            for (const selector of selectors) {
                try {
                    const loc = page.locator(selector).first();
                    const count = await loc.count().catch(() => 0);
                    if (count > 0) {
                        const value = await loc.inputValue().catch(() => '');
                        if (value && value.trim().length > 0) filledCount++;
                    }
                } catch (_) {}
            }
            const ok = filledCount >= minFilledFields;
            if (!ok) {
                console.log(`🔎 DOM verification: ${filledCount}/${minFilledFields} expected fields filled`);
            }
            return ok;
        };

        return new Promise((resolve, reject) => {
            let done = false;
            const safeResolve = async () => {
                if (done) return;
                done = true;
                cleanup();
                resolve();
            };
            const safeReject = (err) => {
                if (done) return;
                done = true;
                cleanup();
                reject(err);
            };
 
            const timeoutId = setTimeout(async () => {
                if (allowProceedWithoutFields) {
                    console.log(`⏰ Autofill wait timed out but bypass is allowed; proceeding`);
                    return safeResolve();
                }
                // As a last-ditch, try DOM verification
                try {
                    const ok = await verifyDomIfNeeded();
                    if (ok) {
                        console.log(`⏰ Event timeout, but DOM verification passed. Proceeding.`);
                        await page.waitForTimeout(postAutofillGraceMs);
                        return safeResolve();
                    }
                } catch (_) {}
                return safeReject(new Error(`Autofill completion event not received within ${timeout}ms`));
            }, timeout);
 
            const cleanup = () => {
                clearTimeout(timeoutId);
                const unsubscribe = this.autofillCompletionListeners.get(sessionId);
                if (unsubscribe) {
                    try { unsubscribe(); } catch (_) {}
                    this.autofillCompletionListeners.delete(sessionId);
                }
            };
 
            const unsubscribe = this.eventBus.onSessionEvent(
                sessionId,
                EVENTS.AUTOFILL_COMPLETED,
                async (event) => {
                    if (done) return;
                    // Check critical fields if configured
                    const requireCritical = (stepConfig.requiredCriticalFields || 0) > 0;
                    let criticalOk = true;
 
                    // Preferred: use event payload if it includes signals
                    if (requireCritical && (typeof event?.emailFilled !== 'undefined' || typeof event?.passwordFilled !== 'undefined')) {
                        const needCount = stepConfig.requiredCriticalFields || 2;
                        const satisfied =
                            (event.emailFilled ? 1 : 0) +
                            (event.passwordFilled ? 1 : 0);
                        criticalOk = satisfied >= needCount;
                        if (!criticalOk) {
                            console.log(`⚠️  Critical fields not satisfied by event (email: ${!!event.emailFilled}, password: ${!!event.passwordFilled}); keep waiting`);
                            return;
                        }
                    }
 
                    // If event lacks details, verify DOM if expected fields provided
                    if (!event || (typeof event.emailFilled === 'undefined' && typeof event.passwordFilled === 'undefined')) {
                        const ok = await verifyDomIfNeeded();
                        if (!ok) return; // keep waiting
                    }
 
                    console.log(`✅ Autofill completed. Grace wait ${postAutofillGraceMs}ms`);
                    setTimeout(safeResolve, postAutofillGraceMs);
                }
            );
 
            // Track for cleanup
            this.autofillCompletionListeners.set(sessionId, unsubscribe);
            console.log(`📡 Listening for autofill completion event on session ${sessionId}`);
        });
    }

    /**
     * Fallback autofill waiting when EventBus is not available (poll DOM)
     */
    async waitForAutofillFallback(stepConfig, page, sessionId) {
        console.log(`⚠️  Using fallback polling approach for autofill detection`);

        // Apply proxy-aware timeout multipliers for fallback polling
        const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
        const baseTimeout = stepConfig.timeout || this.options.defaultTimeout;
        const timeout = Math.round(baseTimeout * proxyMultiplier);
        const baseCheckInterval = stepConfig.checkInterval || 500;
        const checkInterval = Math.round(baseCheckInterval * Math.min(proxyMultiplier, 2.0)); // Cap interval multiplier at 2x
        
        if (this.options.proxyMode) {
            console.log(`🌐 Proxy mode: Fallback autofill timeout ${timeout}ms, check interval ${checkInterval}ms`);
        }
        const selectors = stepConfig.expectedFields || [];
        const minFilledFields = stepConfig.minFilledFields || Math.max(2, selectors.length);

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            let filledCount = 0;

            for (const selector of selectors) {
                try {
                    const element = page.locator(selector).first();
                    const count = await element.count().catch(() => 0);
                    if (count > 0) {
                        const value = await element.inputValue().catch(() => '');
                        if (value && value.trim().length > 0) {
                            filledCount++;
                        }
                    }
                } catch (_) {}
            }

            if (filledCount >= minFilledFields) {
                console.log(`✅ Fallback autofill detection: ${filledCount} fields filled`);
                await page.waitForTimeout(800);
                return;
            }

            await page.waitForTimeout(checkInterval);
        }

        throw new Error(`Fallback autofill timeout: ${timeout}ms`);
    }

    /**
     * Perform human-like interactions
     */
    async performHumanInteractions(stepConfig, page) {
        console.log(`🎭 Performing human-like interactions...`);

        const interactions = stepConfig.interactions || ['scroll', 'move_mouse'];
        
        // Apply proxy-aware delays between interactions
        const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
        const baseInteractionDelay = 200;
        const interactionDelay = Math.round(baseInteractionDelay * proxyMultiplier);

        for (const interaction of interactions) {
            switch (interaction) {
                case 'scroll':
                    await this.performScroll(page, stepConfig.scroll || {});
                    break;

                case 'move_mouse':
                    await this.performMouseMovement(page, stepConfig.mouse || {});
                    break;

                case 'hover_elements':
                    await this.performHoverElements(page, stepConfig.hover || {});
                    break;

                case 'random_delay':
                    await this.performRandomDelay(stepConfig.delay || {});
                    break;
            }
            
            // Add extra delay between interactions in proxy mode
            if (this.options.proxyMode && interactions.length > 1) {
                await page.waitForTimeout(interactionDelay);
            }
        }
    }

    /**
     * Perform scrolling interactions
     */
    async performScroll(page, scrollConfig) {
        const scrollCount = scrollConfig.count || Math.floor(Math.random() * 2) + 1; // 1-2
        const minDelay = scrollConfig.minDelay || this.options.scrollDelayMin;
        const maxDelay = scrollConfig.maxDelay || this.options.scrollDelayMax;
        const gentle = scrollConfig.gentle === true;

        for (let i = 0; i < scrollCount; i++) {
            const scrollAmount = gentle
                ? Math.floor(Math.random() * 150) + 50 // 50-200px
                : Math.floor(Math.random() * 300) + 100; // 100-400px

            await page.mouse.wheel(0, scrollAmount);

            const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
            await page.waitForTimeout(delay);
        }

        console.log(`📜 Performed ${scrollCount} ${gentle ? 'gentle ' : ''}scroll actions`);
    }

    /**
     * Perform mouse movement
     */
    async performMouseMovement(page, mouseConfig) {
        const moveCount = mouseConfig.count || Math.floor(Math.random() * 2) + 1; // 1-2
        const avoidFormFields = mouseConfig.avoidFormFields === true;

        for (let i = 0; i < moveCount; i++) {
            let x, y;

            if (avoidFormFields) {
                const corner = Math.floor(Math.random() * 4);
                switch (corner) {
                    case 0: // Top area
                        x = Math.floor(Math.random() * 600) + 200;
                        y = Math.floor(Math.random() * 100) + 50;
                        break;
                    case 1: // Bottom area
                        x = Math.floor(Math.random() * 600) + 200;
                        y = Math.floor(Math.random() * 100) + 600;
                        break;
                    case 2: // Left area
                        x = Math.floor(Math.random() * 150) + 50;
                        y = Math.floor(Math.random() * 400) + 200;
                        break;
                    case 3: // Right area
                        x = Math.floor(Math.random() * 150) + 700;
                        y = Math.floor(Math.random() * 400) + 200;
                        break;
                }
            } else {
                x = Math.floor(Math.random() * 800) + 100;
                y = Math.floor(Math.random() * 600) + 100;
            }

            await page.mouse.move(x, y, { steps: 3 + Math.floor(Math.random() * 4) });
            await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
        }

        console.log(`🖱️  Performed ${moveCount} mouse movements${avoidFormFields ? ' (avoiding form fields)' : ''}`);
    }

    /**
     * Perform hover on random elements
     */
    async performHoverElements(page, hoverConfig) {
        const selectors = hoverConfig.selectors || ['input', 'button', 'a'];
        const hoverCount = hoverConfig.count || 1;

        for (let i = 0; i < hoverCount; i++) {
            try {
                const selector = selectors[Math.floor(Math.random() * selectors.length)];
                const elements = await page.locator(selector).all();

                if (elements.length > 0) {
                    const randomElement = elements[Math.floor(Math.random() * elements.length)];
                    await randomElement.hover();
                    await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
                }
            } catch (_) {
                // Ignore hover errors
            }
        }

        console.log(`👆 Performed hover actions`);
    }

    /**
     * Perform random delay
     */
    async performRandomDelay(delayConfig) {
        // Apply proxy-aware multipliers to human delays
        const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
        const baseMinDelay = delayConfig.min || this.options.humanDelayMin;
        const baseMaxDelay = delayConfig.max || this.options.humanDelayMax;
        const minDelay = Math.round(baseMinDelay * proxyMultiplier);
        const maxDelay = Math.round(baseMaxDelay * proxyMultiplier);

        const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        if (this.options.proxyMode) {
            console.log(`⏰ Random delay (proxy mode): ${delay}ms (${proxyMultiplier}x multiplier)`);
        } else {
            console.log(`⏰ Random delay: ${delay}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Click submit button
     */
    async clickSubmit(stepConfig, page, sessionId) {
        console.log(`🔘 Clicking submit button...`);
 
        const selectors = stepConfig.selectors || [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Submit")',
            'button:has-text("Sign Up")',
            'button:has-text("Register")',
            '.submit-btn',
            '#submit'
        ];
 
        // Optional pre-submit verification to avoid race with autofill
        const verifySelectors = stepConfig.verifySelectors || [];
        const requireAllVerifySelectors = stepConfig.requireAllVerifySelectors === true;
        const verifyStabilityTries = stepConfig.verifyStabilityTries || 3;
        const verifyStabilityDelayMs = stepConfig.verifyStabilityDelayMs || 150;
        const preSubmitValidation = stepConfig.preSubmitValidation || null;
        const pauseAutofill = stepConfig.pauseAutofill === true;
        const noPreJitter = stepConfig.noPreJitter === true;
 
        const readInputValue = async (sel) => {
            try {
                const loc = page.locator(sel).first();
                if (await loc.count() === 0) return '';
                await loc.waitFor({ state: 'attached', timeout: 1000 }).catch(() => {});
                const val = await loc.inputValue().catch(() => '');
                return typeof val === 'string' ? val.trim() : '';
            } catch (_) { return ''; }
        };
 
        const valuesStable = async (sels) => {
            const first = {};
            for (const sel of sels) {
                first[sel] = await readInputValue(sel);
            }
            for (let i = 0; i < verifyStabilityTries; i++) {
                await page.waitForTimeout(verifyStabilityDelayMs);
                let allStable = true;
                for (const sel of sels) {
                    const v = await readInputValue(sel);
                    if (v !== first[sel]) { allStable = false; break; }
                }
                if (allStable) return true;
            }
            return false;
        };
 
        const ensurePreSubmitReady = async () => {
            if (verifySelectors.length === 0 && !preSubmitValidation) return true;
 
            // Gather unique verify selectors
            const uniqueSels = Array.from(new Set(verifySelectors));
            const emailSels = uniqueSels.filter(s => /email/i.test(s));
            const pwdSels = uniqueSels.filter(s => /password/i.test(s));
 
            const vals = {};
            for (const sel of uniqueSels) {
                vals[sel] = await readInputValue(sel);
            }
 
            const hasValue = (v) => typeof v === 'string' && v.length > 0;
            const looksEmail = (v) => /@/.test(v);
            const minPwdLen = (preSubmitValidation && preSubmitValidation.minPasswordLength) ? preSubmitValidation.minPasswordLength : 8;
 
            // Grouped logic: if both groups exist, require one valid email AND one valid password
            let valuesOk = false;
            let stabilityTargets = uniqueSels;
            if (emailSels.length > 0 && pwdSels.length > 0) {
                const emailOk = emailSels.some(sel => {
                    const v = vals[sel];
                    return hasValue(v) && looksEmail(v);
                });
                const pwdOk = pwdSels.some(sel => {
                    const v = vals[sel];
                    return hasValue(v) && v.length >= minPwdLen;
                });
                valuesOk = emailOk && pwdOk;
                // Only check stability for selectors that currently have values
                stabilityTargets = [
                    ...emailSels.filter(sel => hasValue(vals[sel])),
                    ...pwdSels.filter(sel => hasValue(vals[sel]))
                ];
            } else {
                // Fallback to legacy behavior if we can't group
                const valueChecks = uniqueSels.map(sel => hasValue(vals[sel]));
                valuesOk = requireAllVerifySelectors ? valueChecks.every(Boolean) : valueChecks.some(Boolean);
                stabilityTargets = uniqueSels.filter(sel => hasValue(vals[sel]));
            }
 
            if (!valuesOk) {
                console.log(`⏳ Pre-submit check: required fields not yet filled, retrying...`);
                return false;
            }
 
            // Optional validation rules (redundant when grouped, but keep for safety)
            if (preSubmitValidation) {
                if (preSubmitValidation.checkEmailField && emailSels.length > 0) {
                    const someEmailValid = emailSels.some(sel => looksEmail(vals[sel] || ''));
                    if (!someEmailValid) {
                        console.log(`⏳ Pre-submit check: email field not valid yet`);
                        return false;
                    }
                }
                if (preSubmitValidation.checkPasswordField && pwdSels.length > 0) {
                    const somePwdValid = pwdSels.some(sel => (vals[sel] || '').length >= minPwdLen);
                    if (!somePwdValid) {
                        const len = Math.max(0, ...pwdSels.map(sel => (vals[sel] || '').length));
                        console.log(`⏳ Pre-submit check: password too short (${len})`);
                        return false;
                    }
                }
            }
 
            // Ensure values are stable to avoid racing with autofill
            if (stabilityTargets.length > 0) {
                const stable = await valuesStable(stabilityTargets);
                if (!stable) {
                    console.log(`⏳ Pre-submit check: field values not stable yet`);
                    return false;
                }
            }
 
            return true;
        };
 
        // Wait a short window for the pre-submit readiness if configured (proxy-aware)
        let ready = false;
        const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
        const basePreSubmitWindowMs = 5000;
        const preSubmitWindowMs = Math.round(basePreSubmitWindowMs * proxyMultiplier);
        const preSubmitDeadline = Date.now() + preSubmitWindowMs;
        while (Date.now() < preSubmitDeadline) {
            if (await ensurePreSubmitReady()) { ready = true; break; }
            await page.waitForTimeout(250);
        }
        if (!ready) {
            const msg = `Pre-submit readiness not satisfied after ${preSubmitWindowMs}ms; skipping click to avoid race`;
            console.log(`⏭️  ${msg}`);
            if (stepConfig.required === true) {
                throw new Error(msg);
            }
            return; // Optional step: skip click
        }
 
        // Pause autofill now that fields are verified and stable
        if (pauseAutofill) {
            try {
                const automation = this.activeAutomations.get(sessionId);
                if (automation && automation.autofillSystem && typeof automation.autofillSystem.stopMonitoring === 'function') {
                    automation.autofillSystem.stopMonitoring(sessionId);
                    console.log(`🛑 Paused autofill monitoring before submit click`);
                }
            } catch (e) {
                console.log(`⚠️  Could not pause autofill: ${e.message}`);
            }
        }
 
        // Optional small randomized humanization before clicking (disabled when noPreJitter)
        if (!noPreJitter) {
            const preJitterScrolls = Math.floor(Math.random() * 2); // 0-1
            for (let i = 0; i < preJitterScrolls; i++) {
                try {
                    const dy = 100 + Math.floor(Math.random() * 200);
                    await page.mouse.wheel(0, dy);
                    await page.waitForTimeout(150 + Math.floor(Math.random() * 250));
                } catch (_) {}
            }
        }
 
        for (const selector of selectors) {
            try {
                const locator = page.locator(selector);
                if (await locator.count() === 0) continue;
                const element = locator.first();
 
                await element.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
                const isVisible = await element.isVisible().catch(() => false);
                const isEnabled = await element.isEnabled().catch(() => false);
                if (!isVisible || !isEnabled) continue;
 
                const box = await element.boundingBox().catch(() => null);
                if (box && !noPreJitter) {
                    const jitterX = (Math.random() - 0.5) * Math.min(10, box.width / 5);
                    const jitterY = (Math.random() - 0.5) * Math.min(6, box.height / 5);
                    const tgtX = box.x + box.width / 2 + jitterX;
                    const tgtY = box.y + box.height / 2 + jitterY;
                    await page.mouse.move(tgtX, tgtY, { steps: 3 + Math.floor(Math.random() * 4) });
                    await page.waitForTimeout(200 + Math.floor(Math.random() * 500));
                    await element.hover().catch(() => {});
                }
 
                const preClickDelay = 300 + Math.floor(Math.random() * 1200);
                await page.waitForTimeout(preClickDelay);
 
                await element.click({ delay: 10 + Math.floor(Math.random() * 40) });
                console.log(`✅ Clicked submit button: ${selector}`);
 
                const postClickDelay = 400 + Math.floor(Math.random() * 1200);
                await page.waitForTimeout(postClickDelay);
 
                if (stepConfig.screenshotAfterClick !== false) {
                    try {
                        const screenshotsDir = path.resolve('./automation-results');
                        await fs.ensureDir(screenshotsDir);
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const filePath = path.join(screenshotsDir, `${sessionId}-after-submit-${timestamp}.png`);
                        await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
                        console.log(`📸 Saved screenshot after submit: ${filePath}`);
                    } catch (e) {
                        console.log(`⚠️  Could not save screenshot after submit: ${e.message}`);
                    }
                }
 
                return;
            } catch (error) {
                console.log(`⚠️  Could not click selector ${selector}:`, error.message);
            }
        }
 
        throw new Error('No submit button found or clickable');
    }

    /**
     * Monitor for success response
     */
    async monitorSuccess(stepConfig, page, sessionId) {
        console.log(`👀 Monitoring for success response...`);

        const automation = this.activeAutomations.get(sessionId);
        if (!automation || !automation.requestCaptureSystem) {
            throw new Error('Request capture system not available for monitoring');
        }

        // Apply proxy-aware timeout multipliers for success monitoring
        const proxyMultiplier = this.options.proxyMode ? (this.options.proxyTimeoutMultiplier || 2.5) : 1.0;
        const baseTimeout = stepConfig.timeout || 30000;
        const timeout = Math.round(baseTimeout * proxyMultiplier);
        const successUrls = stepConfig.successUrls || [];
        const successStatuses = stepConfig.successStatuses || [200, 201];
        
        if (this.options.proxyMode) {
            console.log(`🌐 Proxy mode: Success monitoring timeout ${timeout}ms (was ${baseTimeout}ms, ${proxyMultiplier}x multiplier)`);
        }

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const capturedRequests = automation.requestCaptureSystem.getCapturedRequests(sessionId) || [];

                for (const request of capturedRequests) {
                    if (request.type === 'response' &&
                        successStatuses.includes(request.status) &&
                        successUrls.some(url => request.url.includes(url))) {

                        console.log(`✅ Success response detected: ${request.url} (${request.status})`);
                        return request;
                    }
                }

                await page.waitForTimeout(1000);
            } catch (error) {
                console.log(`⚠️  Error monitoring success:`, error.message);
                await page.waitForTimeout(1000);
            }
        }

        try {
            const screenshotsDir = path.resolve('./automation-results');
            await fs.ensureDir(screenshotsDir);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filePath = path.join(screenshotsDir, `${sessionId}-monitor-timeout-${timestamp}.png`);
            await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
            console.log(`📸 Saved screenshot on success-timeout: ${filePath}`);
        } catch (e) {
            console.log(`⚠️  Could not save timeout screenshot: ${e.message}`);
        }

        throw new Error(`Success response not detected within ${timeout}ms`);
    }

    /**
     * Execute custom script
     */
    async executeCustomScript(stepConfig, page, sessionId, hook) {
        console.log(`🔧 Executing custom script...`);

        if (stepConfig.script && typeof stepConfig.script === 'function') {
            await stepConfig.script(page, sessionId, hook, this);
        } else if (stepConfig.scriptPath) {
            const scriptPath = path.resolve(stepConfig.scriptPath);
            const { default: customScript } = await import(scriptPath);
            await customScript(page, sessionId, hook, this);
        } else {
            throw new Error('No script or scriptPath provided for custom_script step');
        }
    }

    /**
     * Deterministic email/password fill owned by automation (used when AutofillHookSystem is disabled)
     */
    async automationFill(stepConfig, page, sessionId, hook) {
        const onlyWhenAutofillDisabled = stepConfig.onlyWhenAutofillDisabled !== false;
        const automation = this.activeAutomations.get(sessionId);
        if (!automation) return;

        if (onlyWhenAutofillDisabled && !(automation.automationAutofillOnly || this.options.automationAutofillOnly)) {
            console.log(`⏭️  Skipping automation_fill (Autofill system active)`);
            return;
        }

        const selectors = stepConfig.selectors || {};
        const emailSelectors = selectors.email || [
            'input[data-testid="form-input-email"]',
            'input[name="email"]',
            'input[type="email"]'
        ];
        const passwordSelectors = selectors.password || [
            'input[data-testid="form-input-password"]',
            'input[name="password"]',
            'input[type="password"]'
        ];
        const minPasswordLength = stepConfig.minPasswordLength || 8;
        const stabilityDelayMs = stepConfig.stabilityDelayMs || 250;

        // Decide values
        let email = stepConfig.values?.email;
        let password = stepConfig.values?.password;

        if (!email || !password) {
            try {
                const userData = this.dataGenerator.generateUserData({
                    sessionId,
                    siteUrl: page.url(),
                    hookName: hook?.name || 'automation'
                });
                email = email || userData.email;
                password = password || userData.password;
                console.log(`🎲 automation_fill generated credentials`);
            } catch (e) {
                // fallback deterministic values if generator not available
                const ts = Date.now();
                email = email || `user${ts}@example.com`;
                password = password || `Aa${ts}!xyz`;
                console.log(`⚠️  Fallback credentials generated`);
            }
        }

        const fillInput = async (sels, value) => {
            for (const sel of sels) {
                try {
                    const loc = page.locator(sel).first();
                    if (await loc.count() === 0) continue;
                    await loc.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
                    const enabled = await loc.isEnabled().catch(() => false);
                    const editable = await loc.isEditable().catch(() => false);
                    if (!enabled || !editable) continue;

                    try { await loc.focus(); } catch (_) {}
                    await page.waitForTimeout(60 + Math.floor(Math.random() * 120));

                    // Clear if needed
                    const existing = await loc.inputValue().catch(() => '');
                    if (existing) {
                        try { await loc.clear(); } catch (_) {}
                        await page.waitForTimeout(50);
                    }

                    // Use fast paste-like filling instead of slow typing for better reliability
                    try {
                        // Method 1: Use fill() for fastest input (paste-like)
                        await loc.fill(value);
                        console.log(`📋 Fast-filled field: ${sel.substring(0, 30)}...`);
                    } catch (fillError) {
                        // Method 2: Fallback to typing if fill() fails
                        console.log(`⚠️  Fill failed, using typing fallback: ${fillError.message}`);
                        const perCharDelay = /password/i.test(sel) ? (40 + Math.floor(Math.random() * 50)) : (20 + Math.floor(Math.random() * 40));
                        await loc.pressSequentially(value, { delay: perCharDelay });
                    }

                    // Verify
                    const actual = await loc.inputValue().catch(() => '');
                    if (actual && actual.trim() === value.trim()) {
                        await page.waitForTimeout(stabilityDelayMs);
                        return true;
                    }
                } catch (e) {
                    // try next selector
                }
            }
            return false;
        };

        let emailOk = await fillInput(emailSelectors, email);
        let passwordOk = await fillInput(passwordSelectors, password);

        // Quick validation
        if (emailOk) {
            try {
                const eLoc = page.locator(emailSelectors[0]).first();
                const val = await eLoc.inputValue().catch(() => '');
                if (!/@/.test(val)) emailOk = false;
            } catch (_) {}
        }
        if (passwordOk) {
            try {
                const pLoc = page.locator(passwordSelectors[0]).first();
                const val = await pLoc.inputValue().catch(() => '');
                if (!val || val.length < minPasswordLength) passwordOk = false;
            } catch (_) {}
        }

        console.log(`🧩 automation_fill: emailOk=${emailOk} passwordOk=${passwordOk}`);
        if (!emailOk || !passwordOk) {
            if (stepConfig.required !== false) {
                throw new Error(`automation_fill could not satisfy required fields (emailOk=${emailOk}, passwordOk=${passwordOk})`);
            }
        }
    }

    /**
     * Try light human-like jitter and resubmit to bypass soft CAPTCHA gating
     */
    async tryHumanJitterResubmit(page, submitSelectors = []) {
        try {
            // Focus/blur jiggle on inputs
            const jiggleTargets = [
                'input[data-testid="form-input-email"]',
                'input[name="email"]',
                'input[type="email"]',
                'input[data-testid="form-input-password"]',
                'input[name="password"]',
                'input[type="password"]'
            ];
            for (const sel of jiggleTargets) {
                try {
                    const loc = page.locator(sel).first();
                    if (await loc.count() === 0) continue;
                    await loc.focus().catch(() => {});
                    await page.waitForTimeout(120 + Math.floor(Math.random() * 180));
                    await page.keyboard.press('Tab').catch(() => {});
                    await page.waitForTimeout(100 + Math.floor(Math.random() * 160));
                } catch (_) {}
            }

            // Re-click submit
            const candidates = submitSelectors.length ? submitSelectors : [
                'button[type="submit"]',
                'input[type="submit"]',
                'button[data-testid="signup-button"]',
                '.submit-btn',
                '#submit'
            ];
            for (const sel of candidates) {
                try {
                    const loc = page.locator(sel).first();
                    if (await loc.count() === 0) continue;
                    await loc.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
                    const vis = await loc.isVisible().catch(() => false);
                    const en = await loc.isEnabled().catch(() => false);
                    if (!vis || !en) continue;
                    await loc.click({ delay: 15 + Math.floor(Math.random() * 35) });
                    await page.waitForTimeout(400 + Math.floor(Math.random() * 600));
                    return true;
                } catch (_) {}
            }
        } catch (_) {}
        return false;
    }

    /**
     * Detect common CAPTCHA states (VidIQ) and attempt mitigations:
     *  - light jitter + resubmit (1-2 tries)
     *  - if still blocked, page reload + (optional) automation_fill + resubmit
     *  - track retry attempts and implement proper strategy after failures
     */
    async detectCaptcha(stepConfig, page, sessionId, hook) {
        const automation = this.activeAutomations.get(sessionId);

        // Initialize retry tracking for this session if not exists
        if (!automation.captchaRetryCount) {
            automation.captchaRetryCount = 0;
        }

        // Heuristics: do not attempt CAPTCHA mitigation if we already see clear success signals in capture buffer
        const hasRecentSuccessSignals = () => {
            try {
                const cap = automation?.requestCaptureSystem?.getCapturedRequests(sessionId) || [];
                if (cap.length === 0) return false;
                // Look back over the last ~6 seconds of captured traffic
                const cutoff = Date.now() - 6000;
                for (let i = cap.length - 1; i >= 0; i--) {
                    const r = cap[i];
                    // Accept success on common VidIQ post-signup/auth endpoints
                    if (r.type === 'response' &&
                        [200, 201].includes(r.status) &&
                        typeof r.url === 'string' &&
                        (
                            r.url.includes('/auth/login') ||
                            r.url.includes('/auth/user') ||
                            r.url.includes('/user/channels') ||
                            r.url.includes('/subscriptions/active') ||
                            r.url.includes('/subscriptions/stripe/next-subscription')
                        )) {
                        // crude timestamp check if present
                        if (!r.timestamp) return true;
                        const t = Date.parse(r.timestamp);
                        if (isFinite(t) && t >= cutoff) return true;
                    }
                    // stop scanning if we went too far back without timestamps
                    if (i < cap.length - 100) break;
                }
            } catch (_) {}
            return false;
        };

        // Check if we're back to login screen after jittering
        const isBackToLoginScreen = async () => {
            try {
                // Look for login form elements that indicate we're back to the login screen
                const loginIndicators = [
                    'input[data-testid="form-input-email"]',
                    'input[name="email"]',
                    'input[type="email"]',
                    'input[data-testid="form-input-password"]',
                    'input[name="password"]',
                    'input[type="password"]',
                    'button[type="submit"]',
                    'button:has-text("Sign Up")',
                    'button:has-text("Create Account")'
                ];

                let loginFieldsFound = 0;
                for (const selector of loginIndicators) {
                    try {
                        const count = await page.locator(selector).count();
                        if (count > 0) {
                            const isVisible = await page.locator(selector).first().isVisible().catch(() => false);
                            if (isVisible) loginFieldsFound++;
                        }
                    } catch (_) {}
                }

                // If we find multiple login form elements, we're likely back to login screen
                return loginFieldsFound >= 2;
            } catch (_) {
                return false;
            }
        };

        // Default detection inputs (refined)
        // NOTE: recaptcha-tos is a legal notice and appears even on success; do NOT treat it as CAPTCHA
        const detectSelectors = stepConfig.detectSelectors || [
            'p[data-testid="authentication-error"]',
            '[data-testid="authentication-error"]',
            'iframe[src*="recaptcha"]',
            'div.g-recaptcha',
            'iframe[src*="hcaptcha"]',
            'div.h-captcha'
        ];
        const submitSelectors = stepConfig.submitSelectors || [
            'button[type="submit"]',
            'input[type="submit"]',
            'button[data-testid="signup-button"]',
            '.submit-btn',
            '#submit'
        ];
        const jitterAttempts = Math.max(0, stepConfig.jitterAttempts ?? 2);
        const reloadOnFail = stepConfig.reloadOnFail !== false;
        const maxRetryAttempts = stepConfig.maxRetryAttempts || 2;

        const markDetected = () => {
            if (automation) automation.captchaDetected = true;
            if (this.eventBus) {
                try {
                    this.eventBus.emitSessionEvent(sessionId, EVENTS.CAPTCHA_DETECTED, {
                        url: page.url(),
                        hookName: hook?.name || 'unknown',
                        retryCount: automation.captchaRetryCount
                    });
                } catch (_) {}
            }
        };

        const errorTextLooksCaptcha = (txt) => {
            if (typeof txt !== 'string') return false;
            return /(captcha|robot|vpn|blocked|failed)/i.test(txt);
        };

        const iframeVisibleAndSized = async (loc) => {
            try {
                const vis = await loc.isVisible().catch(() => false);
                if (!vis) return false;
                const box = await loc.boundingBox().catch(() => null);
                if (!box) return true; // visible but no box info → consider true
                return (box.width >= 20 && box.height >= 20);
            } catch (_) { return false; }
        };

        const isCaptchaLikely = async () => {
            // 1) Strong signal: visible authentication-error with meaningful text
            for (const sel of ['p[data-testid="authentication-error"]','[data-testid="authentication-error"]']) {
                try {
                    const loc = page.locator(sel).first();
                    if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
                        const txt = (await loc.textContent().catch(() => '') || '').trim();
                        if (txt.length > 0 && errorTextLooksCaptcha(txt)) return true;
                    }
                } catch (_) {}
            }
            // 2) Strong signal: visible recaptcha/hcaptcha widgets (not hidden)
            for (const sel of ['iframe[src*="recaptcha"]','div.g-recaptcha','iframe[src*="hcaptcha"]','div.h-captcha']) {
                try {
                    const loc = page.locator(sel).first();
                    if (await loc.count() > 0 && await iframeVisibleAndSized(loc)) return true;
                } catch (_) {}
            }
            return false;
        };

        // Skip if we already have success signals shortly after submit
        if (hasRecentSuccessSignals()) {
            console.log('🧪 CAPTCHA check skipped: success signals already present');
            return;
        }

        const captchaNow = await isCaptchaLikely();
        if (!captchaNow) {
            console.log('🧪 CAPTCHA not detected');
            return;
        }

        console.log(`🧪 CAPTCHA detected - attempting mitigation (attempt ${automation.captchaRetryCount + 1}/${maxRetryAttempts + 1})`);
        markDetected();
        automation.captchaRetryCount++;

        // Check if we've exceeded max retry attempts
        if (automation.captchaRetryCount > maxRetryAttempts) {
            console.log(`❌ Maximum CAPTCHA retry attempts (${maxRetryAttempts}) exceeded. Manual intervention may be required.`);
            if (stepConfig.required === true) {
                throw new Error(`CAPTCHA persisted after ${maxRetryAttempts} retry attempts`);
            }
            return;
        }

        // Light jitter + resubmit attempts
        for (let i = 0; i < jitterAttempts; i++) {
            await this.tryHumanJitterResubmit(page, submitSelectors);
            await page.waitForTimeout(700 + Math.floor(Math.random() * 500));
            
            // Check if we're back to login screen after jittering
            if (await isBackToLoginScreen()) {
                console.log('🔄 Detected return to login screen after jittering - need to refill form');
                
                // If we have automation autofill, trigger it
                if (automation?.automationAutofillOnly || this.options.automationAutofillOnly) {
                    const fillCfg = hook?.workflow?.automation_fill || { type: 'automation_fill', onlyWhenAutofillDisabled: true };
                    try {
                        await this.automationFill(fillCfg, page, sessionId, hook);
                        console.log('✅ Form refilled after returning to login screen');
                    } catch (e) {
                        console.log(`⚠️  automation_fill after login screen return failed: ${e.message}`);
                    }
                } else {
                    // Emit event to trigger autofill system
                    if (this.eventBus) {
                        try {
                            this.eventBus.emitSessionEvent(sessionId, EVENTS.AUTOFILL_REQUESTED, {
                                reason: 'login_screen_return',
                                url: page.url()
                            });
                            console.log('📡 Requested autofill system to refill form');
                        } catch (_) {}
                    }
                }
                
                // Wait a bit for form filling to complete
                await page.waitForTimeout(2000 + Math.floor(Math.random() * 1000));
            }
            
            if (hasRecentSuccessSignals()) {
                console.log(`✅ CAPTCHA bypassed implicitly (success responses observed)`);
                automation.captchaRetryCount = 0; // Reset on success
                return;
            }
            if (!(await isCaptchaLikely())) {
                console.log(`✅ CAPTCHA cleared after jitter attempt ${i + 1}`);
                automation.captchaRetryCount = 0; // Reset on success
                return;
            }
            console.log(`⚠️  CAPTCHA persists after jitter attempt ${i + 1}`);
        }

        // Reload + refill path
        if (reloadOnFail) {
            console.log('🔄 Reloading page to reset state...');
            try { await page.reload({ waitUntil: 'domcontentloaded' }); } catch (_) {}
            await page.waitForTimeout(800 + Math.floor(Math.random() * 900));

            // Always perform automation-owned fill after reload to ensure form is filled
            console.log('📝 Performing automation-owned fill after reload...');
            const fillCfg = hook?.workflow?.automation_fill || {
                type: 'automation_fill',
                onlyWhenAutofillDisabled: false, // Force fill regardless of autofill system state
                selectors: {
                    email: [
                        'input[data-testid="form-input-email"]',
                        'input[name="email"]',
                        'input[type="email"]'
                    ],
                    password: [
                        'input[data-testid="form-input-password"]',
                        'input[name="password"]',
                        'input[type="password"]'
                    ]
                },
                minPasswordLength: 8,
                stabilityDelayMs: 300,
                required: true
            };
            
            try {
                await this.automationFill(fillCfg, page, sessionId, hook);
                console.log('✅ Form refilled successfully after reload');
            } catch (e) {
                console.log(`❌ automation_fill after reload failed: ${e.message}`);
                // Don't continue if we can't fill the form
                if (stepConfig.required === true) {
                    throw new Error(`Failed to refill form after reload: ${e.message}`);
                }
                return;
            }

            // Wait a bit more to ensure form is stable before attempting submit
            await page.waitForTimeout(1000 + Math.floor(Math.random() * 500));

            await this.tryHumanJitterResubmit(page, submitSelectors);
            await page.waitForTimeout(900 + Math.floor(Math.random() * 600));

            if (hasRecentSuccessSignals()) {
                console.log('✅ CAPTCHA bypassed implicitly after reload (success responses observed)');
                automation.captchaRetryCount = 0; // Reset on success
                return;
            }
            if (!(await isCaptchaLikely())) {
                console.log('✅ CAPTCHA cleared after reload/refill');
                automation.captchaRetryCount = 0; // Reset on success
                return;
            }
            console.log('❌ CAPTCHA still present after reload/refill');
        } else {
            console.log('⏭️  Reload mitigation disabled by configuration');
        }

        if (stepConfig.required === true) {
            throw new Error('CAPTCHA persisted after mitigation attempts');
        }
    }

    /**
     * Mark automation as completed
     */
    markAutomationCompleted(sessionId, hookName, status, error = null) {
        const completion = {
            sessionId,
            hookName,
            status,
            completedAt: new Date().toISOString(),
            error
        };

        this.completedAutomations.set(`${sessionId}-${hookName}`, completion);

        if (status === 'success') {
            console.log(`🎉 Automation completed successfully: ${hookName}`);
        } else {
            console.log(`❌ Automation failed: ${hookName} - ${error}`);
        }
    }

    /**
     * Stop automation for a session
     */
    async stopAutomation(sessionId) {
        const automation = this.activeAutomations.get(sessionId);
        if (automation) {
            automation.status = 'stopped';
            console.log(`🛑 Stopped automation for session: ${sessionId}`);
        }

        // Cleanup autofill listener if any
        const unsubscribe = this.autofillCompletionListeners.get(sessionId);
        if (unsubscribe) {
            try { unsubscribe(); } catch (_) {}
            this.autofillCompletionListeners.delete(sessionId);
        }
    }

    /**
     * Get automation status
     */
    getStatus() {
        return {
            hooksLoaded: this.hooks.size,
            activeAutomations: this.activeAutomations.size,
            completedAutomations: this.completedAutomations.size,
            hooks: Array.from(this.hooks.values()).map(hook => ({
                name: hook.name,
                urlPatterns: hook.urlPatterns
            }))
        };
    }

    /**
     * Clean up resources for a session
     */
    async cleanup(sessionId) {
        const automation = this.activeAutomations.get(sessionId);
        if (automation && automation.timeoutHandle) {
            try { clearTimeout(automation.timeoutHandle); } catch (_) {}
        }
        this.activeAutomations.delete(sessionId);

        for (const [key, completion] of this.completedAutomations.entries()) {
            if (completion.sessionId === sessionId) {
                this.completedAutomations.delete(key);
            }
        }

        const keysToDelete = [];
        for (const runKey of this.processedHookRuns) {
            if (runKey.startsWith(`${sessionId}|`)) {
                keysToDelete.push(runKey);
            }
        }
        keysToDelete.forEach(k => this.processedHookRuns.delete(k));

        // Cleanup event listener if present
        const unsubscribe = this.autofillCompletionListeners.get(sessionId);
        if (unsubscribe) {
            try { unsubscribe(); } catch (_) {}
            this.autofillCompletionListeners.delete(sessionId);
        }

        console.log(`🧹 Cleaned up automation for session: ${sessionId}`);
    }

    /**
     * Clean up all resources
     */
    async cleanupAll() {
        this.activeAutomations.clear();
        this.completedAutomations.clear();
        for (const [sessionId, unsubscribe] of this.autofillCompletionListeners.entries()) {
            try { unsubscribe(); } catch (_) {}
            this.autofillCompletionListeners.delete(sessionId);
        }
        console.log(`🧹 Cleaned up all automation resources`);
    }
}