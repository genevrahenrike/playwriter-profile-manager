import fs from 'fs-extra';
import path from 'path';

/**
 * RequestCaptureSystem - A generalized system for capturing and sniffing network requests
 * based on URL patterns and configurable capture rules. Similar to the AutofillHookSystem
 * but focused on request interception and data extraction.
 */
export class RequestCaptureSystem {
    constructor(options = {}) {
        this.hooks = new Map(); // URL pattern -> hook configuration
        this.activeMonitors = new Map(); // Track active monitors per session
        this.capturedRequests = new Map(); // Track captured requests per session
        this.sessionProfiles = new Map(); // Track profile names per session
        this.requestCounter = 0; // Global counter for unique request IDs
        this.outputFormat = options.outputFormat || 'jsonl';
        this.outputDirectory = options.outputDirectory || './captured-requests';
        this.maxCaptureSize = options.maxCaptureSize || 1000; // Max requests per session (for memory management)
        this.perHookFiles = options.perHookFiles !== false; // Enable per-hook files by default
        
        // Ensure output directory exists
        this.ensureOutputDirectory();
        
        console.log(`🕸️  RequestCaptureSystem initialized with output format: ${this.outputFormat}`);
    }

    /**
     * Ensure output directory exists
     */
    async ensureOutputDirectory() {
        try {
            await fs.ensureDir(this.outputDirectory);
        } catch (error) {
            console.warn(`⚠️  Could not create output directory: ${error.message}`);
        }
    }

    /**
     * Load capture hooks from configuration files
     * @param {string} configDir - Directory containing capture configuration files
     */
    async loadHooks(configDir = './capture-hooks') {
        try {
            console.log(`🔗 Loading request capture hooks from: ${configDir}`);
            
            if (!await fs.pathExists(configDir)) {
                console.log(`📁 Capture hooks directory not found: ${configDir}`);
                console.log(`⚠️  Please create the directory and add hook configuration files`);
                return;
            }

            const files = await fs.readdir(configDir);
            const jsFiles = files.filter(file => file.endsWith('.js'));
            
            for (const file of jsFiles) {
                try {
                    const filePath = path.join(configDir, file);
                    console.log(`📄 Loading capture hook: ${file}`);
                    
                    // Dynamic import of hook configuration
                    const hookModule = await import(`file://${path.resolve(filePath)}`);
                    const hookConfig = hookModule.default || hookModule;
                    
                    if (this.validateHookConfig(hookConfig)) {
                        this.registerHook(hookConfig);
                        console.log(`✅ Registered capture hook: ${hookConfig.name}`);
                    } else {
                        console.warn(`⚠️  Invalid capture hook configuration in ${file}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to load capture hook ${file}:`, error.message);
                }
            }
            
            console.log(`🎯 Total capture hooks loaded: ${this.hooks.size}`);
        } catch (error) {
            console.error(`❌ Failed to load capture hooks:`, error.message);
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
        if (!config.captureRules || typeof config.captureRules !== 'object') return false;
        
        return true;
    }

    /**
     * Register a new capture hook
     * @param {Object} hookConfig - Hook configuration
     */
    registerHook(hookConfig) {
        // Store hook with all URL patterns as keys
        for (const pattern of hookConfig.urlPatterns) {
            this.hooks.set(pattern, hookConfig);
        }
    }

    /**
     * Set profile name for a session (for better file naming)
     * @param {string} sessionId - Session ID
     * @param {string} profileName - Profile name
     */
    setSessionProfile(sessionId, profileName) {
        // Clean profile name for filename use
        const cleanProfileName = profileName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        this.sessionProfiles.set(sessionId, cleanProfileName);
    }

    /**
     * Get profile name for a session
     * @param {string} sessionId - Session ID
     * @returns {string} Profile name or 'unknown'
     */
    getProfileNameForSession(sessionId) {
        return this.sessionProfiles.get(sessionId) || 'unknown';
    }

    /**
     * Start monitoring a browser context for request capture opportunities
     * @param {string} sessionId - Session ID
     * @param {Object} context - Playwright browser context
     * @param {Object} options - Additional options
     */
    async startMonitoring(sessionId, context, options = {}) {
        if (this.hooks.size === 0) {
            console.log(`⚠️  No capture hooks loaded, skipping monitoring for session: ${sessionId}`);
            return;
        }

        // Set profile name if provided
        if (options.profileName) {
            this.setSessionProfile(sessionId, options.profileName);
        }

        console.log(`👀 Starting request capture monitoring for session: ${sessionId}`);
        console.log(`🎯 Monitoring ${this.hooks.size} URL patterns for capture`);
        if (this.perHookFiles) {
            const profileName = this.getProfileNameForSession(sessionId);
            console.log(`📁 Per-hook files: ${profileName}-<hook>-${sessionId}.jsonl`);
        }

        // Initialize captured requests for this session
        this.capturedRequests.set(sessionId, []);

        // Get all pages and set up monitoring on each
        const pages = context.pages();
        const pageHandlers = [];
        
        for (const page of pages) {
            const handlers = this.setupPageMonitoring(page, sessionId);
            pageHandlers.push({ page, handlers });
        }
        
        // Monitor new pages as they're created
        const newPageHandler = async (page) => {
            const handlers = this.setupPageMonitoring(page, sessionId);
            pageHandlers.push({ page, handlers });
        };
        
        context.on('page', newPageHandler);
        
        // NEW: Setup extension/service worker traffic monitoring using Chrome DevTools Protocol
        let cdpMonitor = null;
        try {
            console.log(`🔧 Setting up extension/service-worker traffic monitoring via CDP...`);
            cdpMonitor = await this.setupExtensionMonitoring(sessionId, context);
        } catch (error) {
            console.warn(`⚠️  Could not setup extension monitoring: ${error.message}`);
        }
        
        // Store handlers for cleanup
        this.activeMonitors.set(sessionId, { 
            context, 
            newPageHandler,
            pageHandlers,
            cdpMonitor  // Store CDP monitor bundle for cleanup
        });
    }

    /**
     * Setup global network monitoring using Chrome DevTools Protocol
     * This listens to ALL network traffic globally and filters for our target domains
     * @param {string} sessionId - Session ID
     * @param {Object} context - Browser context
     * @returns {Object} CDP session for cleanup
     */
    async setupExtensionMonitoring(sessionId, context) {
        try {
            const browser = context.browser();
            if (!browser || typeof browser.newBrowserCDPSession !== 'function') {
                throw new Error('CDP is not available for this browser');
            }

            const cdpSession = await browser.newBrowserCDPSession();

            // Routing and RPC plumbing for flattened Target sessions (service workers, background pages)
            let rpcIdCounter = 1;
            const pendingRPC = new Map(); // key: `${sessionId}:${id}` -> { resolve, reject }
            const targetSessions = new Map(); // sessionId -> { targetInfo }
            const pendingByRequestId = new Map(); // key: `${sessionId}:${requestId}` -> response params

            const sendToTarget = (targetSessionId, method, params = {}) => {
                const messageId = rpcIdCounter++;
                const key = `${targetSessionId}:${messageId}`;
                const message = JSON.stringify({ id: messageId, method, params });
                return new Promise((resolve, reject) => {
                    pendingRPC.set(key, { resolve, reject });
                    cdpSession.send('Target.sendMessageToTarget', { sessionId: targetSessionId, message })
                        .catch((error) => {
                            pendingRPC.delete(key);
                            reject(error);
                        });
                    setTimeout(() => {
                        if (pendingRPC.has(key)) {
                            pendingRPC.delete(key);
                            reject(new Error(`CDP RPC timeout for ${method}`));
                        }
                    }, 8000);
                });
            };

            // Enable discovery and auto-attach to all targets including service workers
            await cdpSession.send('Target.setDiscoverTargets', { discover: true }).catch(() => {});
            await cdpSession.send('Target.setAutoAttach', {
                autoAttach: true,
                waitForDebuggerOnStart: false,
                flatten: true
            }).catch(() => {});

            // Attach to existing targets proactively
            try {
                const targets = await cdpSession.send('Target.getTargets', {});
                for (const info of targets.targetInfos || []) {
                    if (['service_worker', 'background_page', 'page', 'worker', 'shared_worker'].includes(info.type)) {
                        try {
                            const { sessionId: childSessionId } = await cdpSession.send('Target.attachToTarget', { targetId: info.targetId, flatten: true });
                            targetSessions.set(childSessionId, { targetInfo: info });
                            // Enable Network on the child
                            await sendToTarget(childSessionId, 'Network.enable');
                        } catch (e) {
                            // ignore
                        }
                    }
                }
            } catch (_) {}

            // Handle attach/detach
            const onAttached = async (event) => {
                const { sessionId: childSessionId, targetInfo } = event;
                targetSessions.set(childSessionId, { targetInfo });
                try {
                    await sendToTarget(childSessionId, 'Network.enable');
                } catch (_) {}
            };

            const onDetached = (event) => {
                const { sessionId: childSessionId } = event;
                targetSessions.delete(childSessionId);
                // Clean buffered responses for this session
                for (const key of Array.from(pendingByRequestId.keys())) {
                    if (key.startsWith(`${childSessionId}:`)) pendingByRequestId.delete(key);
                }
                // Clean pending RPCs for this session
                for (const key of Array.from(pendingRPC.keys())) {
                    if (key.startsWith(`${childSessionId}:`)) pendingRPC.delete(key);
                }
            };

            // Route messages from sub-targets
            const onMessageFromTarget = async (event) => {
                const { sessionId: childSessionId, message } = event;
                let payload;
                try {
                    payload = JSON.parse(message);
                } catch (_) {
                    return;
                }
                // RPC response
                if (payload && typeof payload.id === 'number') {
                    const key = `${childSessionId}:${payload.id}`;
                    const pending = pendingRPC.get(key);
                    if (pending) {
                        pendingRPC.delete(key);
                        if (payload.error) pending.reject(new Error(payload.error.message || 'CDP error'));
                        else pending.resolve(payload.result);
                    }
                    return;
                }
                // Events
                if (!payload || !payload.method) return;
                const p = payload.params || {};
                if (payload.method === 'Network.requestWillBeSent') {
                    this.handleGlobalCDPRequest(p, sessionId);
                } else if (payload.method === 'Network.responseReceived') {
                    pendingByRequestId.set(`${childSessionId}:${p.requestId}`, p);
                } else if (payload.method === 'Network.loadingFinished') {
                    const meta = pendingByRequestId.get(`${childSessionId}:${p.requestId}`);
                    if (meta) {
                        pendingByRequestId.delete(`${childSessionId}:${p.requestId}`);
                        const childSessionShim = { send: (method, params) => sendToTarget(childSessionId, method, params) };
                        await this.handleGlobalCDPResponse(meta, sessionId, childSessionShim);
                    }
                } else if (payload.method === 'Network.webSocketCreated') {
                    this.handleCDPWebSocket(p, sessionId);
                }
            };

            cdpSession.on('Target.attachedToTarget', onAttached);
            cdpSession.on('Target.detachedFromTarget', onDetached);
            cdpSession.on('Target.receivedMessageFromTarget', onMessageFromTarget);

            console.log(`🌐 CDP target auto-attach enabled. Monitoring pages, workers, service workers, and background pages.`);

            return {
                session: cdpSession,
                handlers: {
                    onAttached,
                    onDetached,
                    onMessageFromTarget
                },
                targetSessions,
                pendingByRequestId,
                pendingRPC
            };
        } catch (error) {
            console.warn(`⚠️  Failed to setup global network monitoring: ${error.message}`);
            return null;
        }
    }

    /**
     * Handle global CDP request events (captures ALL requests, filters for our domains)
     * @param {Object} params - CDP request parameters
     * @param {string} sessionId - Session ID
     */
    async handleGlobalCDPRequest(params, sessionId) {
        try {
            const { requestId, request, initiator, timestamp } = params;
            const url = request.url;
            
            // First filter: Only process URLs that match our hooks
            const matchingHooks = this.findMatchingHooks(url);
            if (matchingHooks.length === 0) {
                return; // Skip if not matching our target domains
            }
            
            // Determine the source of this request
            let source = 'page'; // default
            let sourceDescription = 'Page';
            
            if (initiator) {
                if (initiator.url && initiator.url.startsWith('chrome-extension://')) {
                    source = 'extension';
                    sourceDescription = 'Extension';
                } else if (initiator.type === 'other') {
                    // 'other' type often indicates service worker or background script
                    source = 'service_worker';
                    sourceDescription = 'Service Worker';
                } else if (initiator.type === 'script') {
                    source = 'script';
                    sourceDescription = 'Script';
                }
            }
            
            console.log(`🌐 ${sourceDescription.toUpperCase()} REQUEST: ${request.method} ${url}`);
            if (initiator?.url) {
                console.log(`   Initiator: ${initiator.type} ${initiator.url}`);
            }
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                const captureData = {
                    timestamp: new Date(timestamp * 1000).toISOString(),
                    type: 'request',
                    source: source, // Mark source type based on initiator
                    requestId: requestId,
                    hookName: hook.name,
                    sessionId: sessionId,
                    url: url,
                    method: request.method,
                    headers: request.headers || {},
                    postData: request.postData,
                    initiator: {
                        type: initiator?.type || 'unknown',
                        url: initiator?.url || null,
                        stack: initiator?.stack || null
                    }
                };
                
                // Execute custom request capture logic if available
                if (hook.customRequestCapture && typeof hook.customRequestCapture === 'function') {
                    // Create a mock request object for compatibility
                    const mockRequest = {
                        url: () => url,
                        method: () => request.method,
                        headers: () => request.headers || {},
                        postData: () => request.postData || null,
                        resourceType: () => 'xhr', // Default for CDP requests
                        isNavigationRequest: () => false
                    };
                    
                    const customData = await hook.customRequestCapture(mockRequest, sessionId);
                    if (customData) {
                        captureData.custom = customData;
                    }
                }
                
                this.storeCapturedData(sessionId, captureData);
            }
        } catch (error) {
            console.log(`⚠️  Error handling global CDP request: ${error.message}`);
        }
    }

    /**
     * Handle global CDP response events (captures ALL responses, filters for our domains)
     * @param {Object} params - CDP response parameters
     * @param {string} sessionId - Session ID
     * @param {Object} cdpSession - CDP session for getting response body
     */
    async handleGlobalCDPResponse(params, sessionId, cdpSession) {
        try {
            const { requestId, response, timestamp } = params;
            const url = response.url;
            
            // First filter: Only process URLs that match our hooks
            const matchingHooks = this.findMatchingHooks(url);
            if (matchingHooks.length === 0) {
                return; // Skip if not matching our target domains
            }
            
            // We can't easily determine source from response alone, so we'll mark as 'global'
            console.log(`🌐 GLOBAL RESPONSE: ${response.status} ${url}`);
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                const captureData = {
                    timestamp: new Date(timestamp * 1000).toISOString(),
                    type: 'response',
                    source: 'global', // Mark as global since we can't determine exact source from response
                    requestId: requestId,
                    hookName: hook.name,
                    sessionId: sessionId,
                    url: url,
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers || {},
                    mimeType: response.mimeType
                };
                
                // Capture response body if configured and possible
                if (hook.captureRules.captureResponseBody !== false) {
                    try {
                        const responseBody = await cdpSession.send('Network.getResponseBody', { requestId });
                        if (responseBody.body) {
                            const bodyText = responseBody.base64Encoded 
                                ? Buffer.from(responseBody.body, 'base64').toString('utf8')
                                : responseBody.body;
                            
                            if (bodyText.length < 100000) { // Limit body size
                                captureData.body = bodyText;
                            } else {
                                captureData.bodySize = bodyText.length;
                                captureData.bodyTruncated = true;
                                captureData.bodyPreview = bodyText.substring(0, 1000);
                            }
                        }
                    } catch (error) {
                        captureData.bodyError = error.message;
                    }
                }
                
                // Execute custom response capture logic if available
                if (hook.customResponseCapture && typeof hook.customResponseCapture === 'function') {
                    // Create a mock response object for compatibility
                    const mockResponse = {
                        url: () => url,
                        status: () => response.status,
                        statusText: () => response.statusText,
                        headers: () => response.headers || {},
                        text: async () => captureData.body || '',
                        request: () => ({
                            method: () => 'GET', // Default since we don't have original request
                            headers: () => ({})
                        })
                    };
                    
                    const customData = await hook.customResponseCapture(mockResponse, sessionId);
                    if (customData) {
                        captureData.custom = customData;
                    }
                }
                
                this.storeCapturedData(sessionId, captureData);
            }
        } catch (error) {
            console.log(`⚠️  Error handling global CDP response: ${error.message}`);
        }
    }

    /**
     * Handle CDP WebSocket events (captures extension WebSocket connections)
     * @param {Object} params - CDP WebSocket parameters
     * @param {string} sessionId - Session ID
     */
    async handleCDPWebSocket(params, sessionId) {
        try {
            const { requestId, url, initiator } = params;
            
            // Check if this matches any of our hooks
            const matchingHooks = this.findMatchingHooks(url);
            
            if (matchingHooks.length > 0) {
                const isExtensionWebSocket = initiator && (
                    initiator.type === 'other' || 
                    (initiator.url && initiator.url.startsWith('chrome-extension://'))
                );
                
                if (isExtensionWebSocket) {
                    console.log(`🧩 EXTENSION WEBSOCKET: ${url}`);
                    console.log(`   Initiator: ${initiator.type} ${initiator.url || 'unknown'}`);
                    
                    for (const hook of matchingHooks) {
                        if (!hook.enabled) continue;
                        
                        const captureData = {
                            timestamp: new Date().toISOString(),
                            type: 'websocket',
                            source: 'extension',
                            requestId: requestId,
                            hookName: hook.name,
                            sessionId: sessionId,
                            url: url,
                            initiator: {
                                type: initiator?.type || 'unknown',
                                url: initiator?.url || null
                            },
                            isExtensionWebSocket: true
                        };
                        
                        this.storeCapturedData(sessionId, captureData);
                    }
                }
            }
        } catch (error) {
            console.log(`⚠️  Error handling CDP WebSocket: ${error.message}`);
        }
    }

    /**
     * Setup monitoring on a specific page (like the working signup.js example)
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     * @returns {Object} Handler functions for cleanup
     */
    setupPageMonitoring(page, sessionId) {
        console.log(`🕸️  Setting up request capture on page: ${page.url()}`);
        
        // Request handler - based on working signup.js example
        const requestHandler = (request) => {
            const url = request.url();
            
            // Debug: Log all requests to see what's happening
            if (url.includes('api.vidiq.com')) {
                console.log(`🔍 DEBUG: VidIQ request detected: ${request.method()} ${url}`);
            }
            
            // Check if this request matches any hooks
            const matchingHooks = this.findMatchingHooks(url);
            
            // if (matchingHooks.length > 0) {
            //     console.log(`📡 Found ${matchingHooks.length} matching hooks for: ${url}`);
            // }
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                if (this.shouldCaptureRequest(request, hook)) {
                    console.log(`🎯 VidIQ API: ${request.method()} ${url}`);
                    this.captureRequest(request, hook, sessionId);
                }
            }
        };
        
        // Response handler - based on working signup.js example
        const responseHandler = async (response) => {
            const url = response.url();
            
            // Debug: Log all responses to see what's happening
            if (url.includes('api.vidiq.com')) {
                console.log(`🔍 DEBUG: VidIQ response detected: ${response.status()} ${url}`);
            }
            
            // Check if this response matches any hooks
            const matchingHooks = this.findMatchingHooks(url);
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                if (this.shouldCaptureResponse(response, hook)) {
                    console.log(`🎯 VidIQ API Response: ${response.status()} ${url}`);
                    await this.captureResponse(response, hook, sessionId);
                }
            }
        };
        
        // Attach handlers to page (like working example)
        page.on('request', requestHandler);
        page.on('response', responseHandler);
        
        return { requestHandler, responseHandler };
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
            
            console.log(`🔗 Checking page for request capture: ${url}`);
            
            // Find matching hooks
            const matchingHooks = this.findMatchingHooks(url);
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                console.log(`🎯 CAPTURE MATCH: ${hook.name}`);
                console.log(`   Description: ${hook.description}`);
                console.log(`   URL: ${url}`);
                
                // Execute page-level capture logic
                await this.executePageCapture(hook, page, sessionId);
            }
        } catch (error) {
            console.log(`⚠️  Error handling new page for capture: ${error.message}`);
        }
    }

    /**
     * Handle network requests
     * @param {Object} request - Playwright request
     * @param {string} sessionId - Session ID
     */
    async handleRequest(request, sessionId) {
        try {
            const url = request.url();
            const matchingHooks = this.findMatchingHooks(url);
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                // Check if this request matches capture rules
                if (this.shouldCaptureRequest(request, hook)) {
                    await this.captureRequest(request, hook, sessionId);
                }
            }
        } catch (error) {
            console.log(`⚠️  Error handling request: ${error.message}`);
        }
    }

    /**
     * Handle network responses
     * @param {Object} response - Playwright response
     * @param {string} sessionId - Session ID
     */
    async handleResponse(response, sessionId) {
        try {
            const url = response.url();
            const matchingHooks = this.findMatchingHooks(url);
            
            for (const hook of matchingHooks) {
                if (!hook.enabled) continue;
                
                // Check if this response matches capture rules
                if (this.shouldCaptureResponse(response, hook)) {
                    await this.captureResponse(response, hook, sessionId);
                }
            }
        } catch (error) {
            console.log(`⚠️  Error handling response: ${error.message}`);
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
                    .replace(/\./g, '\\.') // Escape dots first
                    .replace(/\*\*/g, '.*') // ** matches any characters
                    .replace(/\*/g, '.*'); // * matches any characters
                
                return new RegExp(`^${regexPattern}$`).test(url);
            } else {
                // Exact match or starts with
                return url === pattern || url.startsWith(pattern);
            }
        }
        
        return false;
    }

    /**
     * Check if request should be captured based on hook rules
     * @param {Object} request - Playwright request
     * @param {Object} hook - Hook configuration
     * @returns {boolean} Whether request should be captured
     */
    shouldCaptureRequest(request, hook) {
        const rules = hook.captureRules;
        
        // Check request method
        if (rules.methods && rules.methods.length > 0) {
            if (!rules.methods.includes(request.method())) {
                return false;
            }
        }
        
        // Check URL patterns
        if (rules.requestUrlPatterns) {
            const url = request.url();
            const matches = rules.requestUrlPatterns.some(pattern => 
                this.urlMatches(url, pattern)
            );
            if (!matches) return false;
        }
        
        // Check headers
        if (rules.requestHeaders) {
            const headers = request.headers();
            for (const [headerName, expectedValue] of Object.entries(rules.requestHeaders)) {
                const headerValue = headers[headerName.toLowerCase()];
                if (!headerValue || (expectedValue && !headerValue.includes(expectedValue))) {
                    return false;
                }
            }
        }
        
        return true;
    }

    /**
     * Check if response should be captured based on hook rules
     * @param {Object} response - Playwright response
     * @param {Object} hook - Hook configuration
     * @returns {boolean} Whether response should be captured
     */
    shouldCaptureResponse(response, hook) {
        const rules = hook.captureRules;
        
        // Check if response capture is disabled
        if (rules.captureResponses === false) {
            return false;
        }
        
        // Check status codes (empty array = capture all)
        if (rules.statusCodes && rules.statusCodes.length > 0) {
            if (!rules.statusCodes.includes(response.status())) {
                return false;
            }
        }
        
        // Check response URL patterns
        if (rules.responseUrlPatterns) {
            const url = response.url();
            const matches = rules.responseUrlPatterns.some(pattern => 
                this.urlMatches(url, pattern)
            );
            if (!matches) return false;
        }
        
        // Check response headers
        if (rules.responseHeaders) {
            const headers = response.headers();
            for (const [headerName, expectedValue] of Object.entries(rules.responseHeaders)) {
                const headerValue = headers[headerName.toLowerCase()];
                if (!headerValue || (expectedValue && !headerValue.includes(expectedValue))) {
                    return false;
                }
            }
        }
        
        return true;
    }

    /**
     * Capture a request
     * @param {Object} request - Playwright request
     * @param {Object} hook - Hook configuration
     * @param {string} sessionId - Session ID
     */
    async captureRequest(request, hook, sessionId) {
        try {
            // Generate unique request ID for pairing with response
            const requestId = `req_${this.requestCounter++}_${Date.now()}`;
            
            const captureData = {
                timestamp: new Date().toISOString(),
                type: 'request',
                requestId: requestId,
                hookName: hook.name,
                sessionId: sessionId,
                url: request.url(),
                method: request.method(),
                headers: request.headers(),
                resourceType: request.resourceType(),
                isNavigationRequest: request.isNavigationRequest(),
                frame: {
                    url: request.frame()?.url() || null,
                    name: request.frame()?.name() || null
                }
            };
            
            // Store request ID on the request object for later pairing
            request._captureRequestId = requestId;

            // Capture post data if available
            try {
                const postData = request.postData();
                if (postData) {
                    captureData.postData = postData;
                }
            } catch (error) {
                // Ignore errors getting post data
            }

            // Execute custom request capture logic if available
            if (hook.customRequestCapture && typeof hook.customRequestCapture === 'function') {
                const customData = await hook.customRequestCapture(request, sessionId);
                if (customData) {
                    captureData.custom = customData;
                }
            }

            // Store captured request
            this.storeCapturedData(sessionId, captureData);

            console.log(`📡 Captured REQUEST: ${request.method()} ${request.url()}`);
            
        } catch (error) {
            console.log(`⚠️  Error capturing request: ${error.message}`);
        }
    }

    /**
     * Capture a response
     * @param {Object} response - Playwright response
     * @param {Object} hook - Hook configuration
     * @param {string} sessionId - Session ID
     */
    async captureResponse(response, hook, sessionId) {
        try {
            // Get request ID from the original request for pairing
            const requestId = response.request()._captureRequestId || null;
            
            const captureData = {
                timestamp: new Date().toISOString(),
                type: 'response',
                requestId: requestId,
                hookName: hook.name,
                sessionId: sessionId,
                url: response.url(),
                status: response.status(),
                statusText: response.statusText(),
                headers: response.headers(),
                request: {
                    method: response.request().method(),
                    headers: response.request().headers()
                }
            };

            // Capture response body if configured
            if (hook.captureRules.captureResponseBody !== false) {
                try {
                    const body = await response.text();
                    if (body && body.length < 100000) { // Limit body size
                        captureData.body = body;
                    } else if (body) {
                        captureData.bodySize = body.length;
                        captureData.bodyTruncated = true;
                        captureData.bodyPreview = body.substring(0, 1000);
                    }
                } catch (error) {
                    captureData.bodyError = error.message;
                }
            }

            // Execute custom response capture logic if available
            if (hook.customResponseCapture && typeof hook.customResponseCapture === 'function') {
                const customData = await hook.customResponseCapture(response, sessionId);
                if (customData) {
                    captureData.custom = customData;
                }
            }

            // Store captured response
            this.storeCapturedData(sessionId, captureData);

            console.log(`📡 Captured RESPONSE: ${response.status()} ${response.url()}`);
            
        } catch (error) {
            console.log(`⚠️  Error capturing response: ${error.message}`);
        }
    }

    /**
     * Execute page-level capture logic
     * @param {Object} hook - Hook configuration
     * @param {Object} page - Playwright page
     * @param {string} sessionId - Session ID
     */
    async executePageCapture(hook, page, sessionId) {
        try {
            if (hook.customPageCapture && typeof hook.customPageCapture === 'function') {
                const pageData = await hook.customPageCapture(page, sessionId, this);
                
                if (pageData) {
                    const captureData = {
                        timestamp: new Date().toISOString(),
                        type: 'page',
                        hookName: hook.name,
                        sessionId: sessionId,
                        url: page.url(),
                        title: await page.title().catch(() => 'Unknown'),
                        custom: pageData
                    };

                    this.storeCapturedData(sessionId, captureData);
                    console.log(`📄 Captured PAGE data from: ${page.url()}`);
                }
            }
        } catch (error) {
            console.log(`⚠️  Error executing page capture: ${error.message}`);
        }
    }

    /**
     * Store captured data for a session
     * @param {string} sessionId - Session ID
     * @param {Object} captureData - Captured data
     */
    storeCapturedData(sessionId, captureData) {
        const sessionRequests = this.capturedRequests.get(sessionId) || [];
        
        // Check if we're at the limit
        if (sessionRequests.length >= this.maxCaptureSize) {
            // Remove oldest request
            sessionRequests.shift();
        }
        
        sessionRequests.push(captureData);
        this.capturedRequests.set(sessionId, sessionRequests);
        
        // Auto-save if configured
        if (this.outputFormat === 'jsonl') {
            this.appendToJSONL(sessionId, captureData);
        }
    }

    /**
     * Append captured data to JSONL file
     * @param {string} sessionId - Session ID
     * @param {Object} captureData - Captured data
     */
    async appendToJSONL(sessionId, captureData) {
        try {
            // Get profile name from session context if available
            const profileName = this.getProfileNameForSession(sessionId) || 'unknown';
            
            // Create filename based on hook name (site) and profile
            const hookName = captureData.hookName || 'general';
            const filename = `${profileName}-${hookName}-${sessionId}.jsonl`;
            const filepath = path.join(this.outputDirectory, filename);
            const jsonLine = JSON.stringify(captureData) + '\n';
            
            await fs.appendFile(filepath, jsonLine);
        } catch (error) {
            console.warn(`⚠️  Could not append to JSONL: ${error.message}`);
        }
    }

    /**
     * Export captured requests for a session
     * @param {string} sessionId - Session ID
     * @param {string} format - Export format ('json', 'jsonl', 'csv')
     * @param {string} outputPath - Output file path (optional)
     */
    async exportCapturedRequests(sessionId, format = 'jsonl', outputPath = null) {
        const sessionRequests = this.capturedRequests.get(sessionId) || [];
        
        if (sessionRequests.length === 0) {
            console.log(`⚠️  No captured requests found for session: ${sessionId}`);
            return null;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const profileName = this.getProfileNameForSession(sessionId);
        const defaultPath = path.join(
            this.outputDirectory, 
            `${profileName}-export-${sessionId}-${timestamp}.${format}`
        );
        const filePath = outputPath || defaultPath;

        try {
            switch (format.toLowerCase()) {
                case 'json':
                    await fs.writeJson(filePath, sessionRequests, { spaces: 2 });
                    break;
                    
                case 'jsonl':
                    const jsonlContent = sessionRequests
                        .map(req => JSON.stringify(req))
                        .join('\n');
                    await fs.writeFile(filePath, jsonlContent);
                    break;
                    
                case 'csv':
                    // Basic CSV export - could be enhanced
                    const csvRows = sessionRequests.map(req => ({
                        timestamp: req.timestamp,
                        type: req.type,
                        hookName: req.hookName,
                        url: req.url,
                        method: req.method || '',
                        status: req.status || '',
                        headers: JSON.stringify(req.headers || {})
                    }));
                    
                    const csvHeader = Object.keys(csvRows[0]).join(',');
                    const csvContent = [
                        csvHeader,
                        ...csvRows.map(row => Object.values(row).map(val => 
                            typeof val === 'string' && val.includes(',') ? `"${val}"` : val
                        ).join(','))
                    ].join('\n');
                    
                    await fs.writeFile(filePath, csvContent);
                    break;
                    
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            console.log(`💾 Exported ${sessionRequests.length} captured requests to: ${filePath}`);
            return {
                filePath,
                format,
                count: sessionRequests.length,
                size: (await fs.stat(filePath)).size
            };
            
        } catch (error) {
            console.error(`❌ Error exporting captured requests: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get captured requests for a session
     * @param {string} sessionId - Session ID
     * @returns {Array} Array of captured requests
     */
    getCapturedRequests(sessionId) {
        return this.capturedRequests.get(sessionId) || [];
    }

    /**
     * Stop monitoring for a session
     * @param {string} sessionId - Session ID
     */
    async stopMonitoring(sessionId) {
        const monitor = this.activeMonitors.get(sessionId);
        if (monitor) {
            // Remove context page handler
            monitor.context.off('page', monitor.newPageHandler);
            
            // Remove page-level handlers
            for (const { page, handlers } of monitor.pageHandlers) {
                try {
                    page.off('request', handlers.requestHandler);
                    page.off('response', handlers.responseHandler);
                } catch (error) {
                    // Page might be closed already
                }
            }
            
            // Clean up CDP monitor if exists
            if (monitor.cdpMonitor && monitor.cdpMonitor.session) {
                const { session, handlers } = monitor.cdpMonitor;
                try {
                    if (handlers) {
                        if (handlers.onRequest) session.off('Network.requestWillBeSent', handlers.onRequest);
                        if (handlers.onResponse) session.off('Network.responseReceived', handlers.onResponse);
                        if (handlers.onLoadingFinished) session.off('Network.loadingFinished', handlers.onLoadingFinished);
                        if (handlers.onWebSocket) session.off('Network.webSocketCreated', handlers.onWebSocket);
                    }
                } catch (_) {}
                try {
                    await session.detach();
                    console.log(`🔧 CDP session detached for session: ${sessionId}`);
                } catch (error) {
                    console.warn(`⚠️  Error detaching CDP session: ${error.message}`);
                }
            }
            
            this.activeMonitors.delete(sessionId);
        }
        
        console.log(`🛑 Stopped request capture monitoring for session: ${sessionId}`);
    }

    /**
     * Clean up resources for a session
     * @param {string} sessionId - Session ID
     * @param {Object} options - Cleanup options (unused, kept for compatibility)
     */
    async cleanup(sessionId, options = {}) {
        // Stop monitoring
        await this.stopMonitoring(sessionId);
        
        // Clear captured requests and session profile
        this.capturedRequests.delete(sessionId);
        this.sessionProfiles.delete(sessionId);
        
        console.log(`🧹 Request capture cleanup completed for session: ${sessionId}`);
    }

    /**
     * Get status information about the capture system
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
        
        const activeSessions = Array.from(this.capturedRequests.keys());
        const totalCaptured = activeSessions.reduce((sum, sessionId) => {
            return sum + (this.capturedRequests.get(sessionId) || []).length;
        }, 0);
        
        return {
            totalHooks: hooksByName.size,
            totalPatterns: this.hooks.size,
            activeSessions: this.activeMonitors.size,
            totalCaptured,
            outputFormat: this.outputFormat,
            outputDirectory: this.outputDirectory,
            hooks: Array.from(hooksByName.values()),
            sessionStats: activeSessions.map(sessionId => ({
                sessionId,
                capturedCount: (this.capturedRequests.get(sessionId) || []).length
            }))
        };
    }

    /**
     * Reload hooks from configuration directory
     * @param {string} configDir - Configuration directory
     */
    async reloadHooks(configDir = './capture-hooks') {
        console.log(`🔄 Reloading capture hooks...`);
        this.hooks.clear();
        await this.loadHooks(configDir);
    }

    /**
     * Clean up all resources
     */
    async cleanupAll() {
        // Stop all monitoring
        for (const sessionId of this.activeMonitors.keys()) {
            await this.cleanup(sessionId);
        }
        
        console.log(`🧹 RequestCaptureSystem cleanup completed`);
    }
}
