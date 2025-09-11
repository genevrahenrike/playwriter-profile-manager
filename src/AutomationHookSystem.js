import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { EVENTS } from './ProfileEventBus.js';

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
            status: 'active'
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

        const timeout = stepConfig.timeout || this.options.defaultTimeout;
        const allowProceedWithoutFields = stepConfig.allowProceedWithoutFields === true;
        const postAutofillGraceMs = stepConfig.postAutofillGraceMs || (400 + Math.floor(Math.random() * 600));

        // Special-case bypasses (e.g., extension install flows)
        // Only bypass if the page truly has NO input fields after a short probe.
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
                // Probe a few times briefly to see if fields appear
                let hasAnyField = false;
                for (let i = 0; i < 3 && !hasAnyField; i++) {
                    for (const sel of probeSelectors) {
                        try {
                            const count = await page.locator(sel).count().catch(() => 0);
                            if (count > 0) { hasAnyField = true; break; }
                        } catch (_) {}
                    }
                    if (!hasAnyField) {
                        await page.waitForTimeout(300);
                    }
                }
                if (!hasAnyField) {
                    console.log(`⤴️  Bypassing autofill wait for extension install flow (no fields detected)`);
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
            const timeoutId = setTimeout(async () => {
                cleanup();
                if (allowProceedWithoutFields) {
                    console.log(`⏰ Autofill wait timed out but bypass is allowed; proceeding`);
                    return resolve();
                }
                // As a last-ditch, try DOM verification
                try {
                    const ok = await verifyDomIfNeeded();
                    if (ok) {
                        console.log(`⏰ Event timeout, but DOM verification passed. Proceeding.`);
                        await page.waitForTimeout(postAutofillGraceMs);
                        return resolve();
                    }
                } catch (_) {}
                return reject(new Error(`Autofill completion event not received within ${timeout}ms`));
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

                    cleanup();
                    console.log(`✅ Autofill completed. Grace wait ${postAutofillGraceMs}ms`);
                    setTimeout(resolve, postAutofillGraceMs);
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

        const timeout = stepConfig.timeout || this.options.defaultTimeout;
        const checkInterval = stepConfig.checkInterval || 500;
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
        const minDelay = delayConfig.min || this.options.humanDelayMin;
        const maxDelay = delayConfig.max || this.options.humanDelayMax;

        const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        console.log(`⏰ Random delay: ${delay}ms`);
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

        const readInputValue = async (sel) => {
            try {
                const loc = page.locator(sel).first();
                if (await loc.count() === 0) return '';
                // Ensure the element is attached before reading
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

            // Gather unique verify selectors and read their values
            const uniqueSels = Array.from(new Set(verifySelectors));
            const vals = {};
            for (const sel of uniqueSels) {
                vals[sel] = await readInputValue(sel);
            }

            const hasValue = (v) => typeof v === 'string' && v.length > 0;

            // Optionally require all to have values or at least one
            const valueChecks = uniqueSels.map(sel => hasValue(vals[sel]));
            const valuesOk = requireAllVerifySelectors ? valueChecks.every(Boolean) : valueChecks.some(Boolean);
            if (!valuesOk) {
                console.log(`⏳ Pre-submit check: required fields not yet filled, retrying...`);
                return false;
            }

            // Optional validation rules
            if (preSubmitValidation) {
                if (preSubmitValidation.checkEmailField) {
                    const emailSel = uniqueSels.find(s => /email/i.test(s));
                    if (emailSel) {
                        const emailVal = vals[emailSel];
                        const looksEmail = /@/.test(emailVal);
                        if (!looksEmail) {
                            console.log(`⏳ Pre-submit check: email field not valid yet`);
                            return false;
                        }
                    }
                }
                if (preSubmitValidation.checkPasswordField) {
                    const pwdSel = uniqueSels.find(s => /password/i.test(s));
                    if (pwdSel) {
                        const minLen = preSubmitValidation.minPasswordLength || 6;
                        const pwdVal = vals[pwdSel];
                        if (!pwdVal || pwdVal.length < minLen) {
                            console.log(`⏳ Pre-submit check: password too short (${(pwdVal||'').length})`);
                            return false;
                        }
                    }
                }
            }

            // Ensure values are stable for a few checks to avoid racing with autofill
            const stable = await valuesStable(uniqueSels);
            if (!stable) {
                console.log(`⏳ Pre-submit check: field values not stable yet`);
                return false;
            }

            return true;
        };

        // Optionally pause autofill to avoid interference at click time
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

        // Wait a short window for the pre-submit readiness if configured
        const preSubmitDeadline = Date.now() + 5000; // up to 5s to become ready
        while (Date.now() < preSubmitDeadline) {
            const ready = await ensurePreSubmitReady();
            if (ready) break;
            await page.waitForTimeout(250);
        }

        // Small randomized humanization before clicking
        const preJitterScrolls = Math.floor(Math.random() * 2); // 0-1
        for (let i = 0; i < preJitterScrolls; i++) {
            try {
                const dy = 100 + Math.floor(Math.random() * 200);
                await page.mouse.wheel(0, dy);
                await page.waitForTimeout(150 + Math.floor(Math.random() * 250));
            } catch (_) {}
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
                if (box) {
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

        const timeout = stepConfig.timeout || 30000;
        const successUrls = stepConfig.successUrls || [];
        const successStatuses = stepConfig.successStatuses || [200, 201];

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