/**
 * RequestExtractor - Reconstructs extension-compatible requests from captured webapp sessions
 * 
 * This tool analyzes captured session data and generates authentic extension requests by:
 * 1. Extracting core authentication and device data from webapp captures
 * 2. Adapting headers for extension-specific context
 * 3. Providing warnings about adaptation requirements and limitations
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProfileManager } from './ProfileManager.js';

export class RequestExtractor {
    constructor(options = {}) {
        this.profileManager = options.profileManager || new ProfileManager('./profiles');
        this.capturedRequestsDir = options.capturedRequestsDir || './captured-requests';
        this.outputDir = options.outputDir || './reconstructed-requests';
        this.quiet = !!options.quiet;
        this._log = (...args) => { if (!this.quiet) console.log(...args); };
        
        // Extension-specific header templates
        this.extensionHeaders = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'priority': 'u=1, i',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'none',
            'x-client-location': 'scorecard' // Default extension location
        };
        
        // Headers that need adaptation from webapp to extension
        this.adaptationRequired = {
            'accept': {
                webapp: 'application/json, text/plain, */*',
                extension: '*/*',
                reason: 'Extension uses simplified accept header'
            },
            'x-vidiq-client': {
                webapp: 'web 61b61ab9f9900c18d51c0605348e4169a6480e95',
                extension: 'ext vch/3.151.0',
                reason: 'Must identify as extension client, not web client'
            },
            'x-client-location': {
                webapp: 'Not present',
                extension: 'scorecard',
                reason: 'Extension-specific header indicating UI context'
            }
        };
        
        // Headers that are extension-specific and cannot be captured from webapp
        this.extensionSpecific = {
            'priority': 'u=1, i',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors', 
            'sec-fetch-site': 'none'
        };
        
        this.ensureOutputDirectory();
    }

    /**
     * Ensure output directory exists
     */
    ensureOutputDirectory() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Find all profiles matching a prefix
     * @param {string} prefix - Profile name prefix
     * @returns {Promise<Array>} Array of profile objects with latest sessions
     */
    async findProfilesWithPrefix(prefix) {
        try {
            const files = fs.readdirSync(this.capturedRequestsDir);
            const profileMap = new Map();
            
            // Group files by profile name and find latest session for each
            files
                .filter(file => file.endsWith('.jsonl') && file.includes('export'))
                .forEach(file => {
                    const match = file.match(/^([^-]+(?:-[^-]+)*)-export-([\w-]+)-(.+)\.jsonl$/);
                    if (match) {
                        const [, profileName, sessionId, timestamp] = match;
                        if (profileName.startsWith(prefix)) {
                            const stats = fs.statSync(path.join(this.capturedRequestsDir, file));
                            const existing = profileMap.get(profileName);
                            
                            if (!existing || stats.mtime > existing.mtime) {
                                profileMap.set(profileName, {
                                    profileName,
                                    sessionId,
                                    timestamp,
                                    file,
                                    mtime: stats.mtime
                                });
                            }
                        }
                    }
                });
            
            return Array.from(profileMap.values()).sort((a, b) => a.profileName.localeCompare(b.profileName));
        } catch (error) {
            if (!this.quiet) console.error('Error finding profiles with prefix:', error.message);
            return [];
        }
    }

    /**
     * Find the latest session for a profile
     * @param {string} profileName - Profile name
     * @returns {Promise<string|null>} Latest session ID or null
     */
    async findLatestSession(profileName) {
        try {
            const files = fs.readdirSync(this.capturedRequestsDir);
            const profileFiles = files
                .filter(file => file.includes(profileName) && file.endsWith('.jsonl'))
                .map(file => {
                    const match = file.match(/(\w+-\w+-\w+-\w+-\w+)/);
                    if (match) {
                        const sessionId = match[1];
                        const stats = fs.statSync(path.join(this.capturedRequestsDir, file));
                        return { sessionId, file, mtime: stats.mtime };
                    }
                    return null;
                })
                .filter(Boolean)
                .sort((a, b) => b.mtime - a.mtime);

            return profileFiles.length > 0 ? profileFiles[0].sessionId : null;
        } catch (error) {
            if (!this.quiet) console.error('Error finding latest session:', error.message);
            return null;
        }
    }

    /**
     * Validate session success based on authentication flow
     * @param {Array} allRequests - All captured requests and responses
     * @returns {Object} Validation result with success status and details
     */
    validateSessionSuccess(allRequests) {
        const validation = {
            success: false,
            reason: 'Unknown',
            details: {
                hasSignup: false,
                signupSuccess: false,
                hasLogin: false,
                loginSuccess: false,
                hasAuthenticatedRequests: false,
                authTokenFound: false,
                hasApiTraffic: false,
                isRefreshSession: false
            }
        };

        // Look for responses (not just requests) to check status codes
        const responses = allRequests.filter(req => req.type === 'response');
        const requests = allRequests.filter(req => req.type === 'request');

        // Check for any VidIQ API traffic (indicates active session)
        const apiResponses = responses.filter(resp =>
            resp.url && resp.url.includes('api.vidiq.com') && resp.status >= 200 && resp.status < 300
        );
        if (apiResponses.length > 0) {
            validation.details.hasApiTraffic = true;
        }

        // Check if this looks like a refresh session (has API traffic but no signup/login flow)
        const hasAuthFlow = requests.some(req =>
            req.url && (req.url.includes('/auth/signup') || req.url.includes('/auth/login'))
        );
        if (apiResponses.length > 0 && !hasAuthFlow) {
            validation.details.isRefreshSession = true;
        }

        // Check signup flow
        const signupResponse = responses.find(resp =>
            resp.url && resp.url.includes('/auth/signup')
        );
        if (signupResponse) {
            validation.details.hasSignup = true;
            validation.details.signupSuccess = signupResponse.status === 200;
        }

        // Check login flow
        const loginResponse = responses.find(resp =>
            resp.url && resp.url.includes('/auth/login')
        );
        if (loginResponse) {
            validation.details.hasLogin = true;
            validation.details.loginSuccess = loginResponse.status === 200;
        }

        // Check for successful subscription check (key success indicator)
        const subscriptionResponse = responses.find(resp =>
            resp.url && resp.url.includes('/subscriptions/active') && resp.status === 200
        );
        if (subscriptionResponse) {
            validation.details.hasAuthenticatedRequests = true;
        }

        // Check for valid authorization tokens in requests
        const authRequest = requests.find(req =>
            req.headers && req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer UKP!')
        );
        if (authRequest) {
            validation.details.authTokenFound = true;
        }

        // Determine overall success
        if (validation.details.signupSuccess && validation.details.loginSuccess &&
            validation.details.hasAuthenticatedRequests && validation.details.authTokenFound) {
            validation.success = true;
            validation.reason = 'Complete successful authentication flow detected';
        } else if (validation.details.authTokenFound && validation.details.hasAuthenticatedRequests) {
            validation.success = true;
            validation.reason = 'Valid authentication and API access detected';
        } else if (validation.details.isRefreshSession && validation.details.hasApiTraffic) {
            // NEW: Accept refresh sessions with API traffic even without auth tokens in headers
            validation.success = true;
            validation.reason = 'Refresh session with valid API traffic detected';
        } else if (signupResponse && signupResponse.status === 400) {
            validation.success = false;
            validation.reason = 'Signup failed with 400 error';
        } else if (loginResponse && loginResponse.status === 400) {
            validation.success = false;
            validation.reason = 'Login failed with 400 error';
        } else {
            validation.success = false;
            validation.reason = 'No valid authentication flow detected';
        }

        return validation;
    }

    /**
     * Load session data from captured requests
     * @param {string} sessionId - Session ID to load
     * @returns {Promise<Array>} Array of captured requests
     */
    async loadSessionData(sessionId) {
        try {
            const files = fs.readdirSync(this.capturedRequestsDir);
            const sessionFiles = files.filter(file => file.includes(sessionId) && file.endsWith('.jsonl'));
            
            if (sessionFiles.length === 0) {
                throw new Error(`No session files found for session ID: ${sessionId}`);
            }

            const allRequests = [];
            for (const file of sessionFiles) {
                const filePath = path.join(this.capturedRequestsDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.trim().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const request = JSON.parse(line);
                        allRequests.push(request);
                    } catch (parseError) {
                        if (!this.quiet) console.warn(`Failed to parse line in ${file}:`, parseError.message);
                    }
                }
            }

            // Validate session success before proceeding
            const validation = this.validateSessionSuccess(allRequests);
            if (!validation.success) {
                throw new Error(`Session validation failed: ${validation.reason}. This appears to be a failed session that should not be processed.`);
            }

            if (!this.quiet) {
                this._log(`✅ Session validation passed: ${validation.reason}`);
            }

            return allRequests.filter(req => req.type === 'request'); // Only requests, not responses
        } catch (error) {
            throw new Error(`Failed to load session data: ${error.message}`);
        }
    }

    /**
     * Extract core data needed for reconstruction
     * @param {Array} requests - Array of captured requests
     * @returns {Object} Core data for reconstruction
     */
    extractCoreData(requests) {
        const coreData = {
            authorization: null,
            deviceId: null,
            userAgent: null,
            timezone: null,
            validRequests: []
        };

        // Find the first authenticated request
        for (const request of requests) {
            const headers = request.headers || {};
            
            // Extract authorization token
            if (headers.authorization && headers.authorization.startsWith('Bearer UKP!')) {
                coreData.authorization = headers.authorization;
            }
            
            // Extract device ID
            if (headers['x-vidiq-device-id']) {
                coreData.deviceId = headers['x-vidiq-device-id'];
            }
            
            // Extract user agent
            if (headers['user-agent']) {
                coreData.userAgent = headers['user-agent'];
            }
            
            // Extract timezone
            if (headers['x-timezone']) {
                coreData.timezone = headers['x-timezone'];
            }
            
            // Store valid API requests
            if (request.url && request.url.includes('api.vidiq.com')) {
                coreData.validRequests.push(request);
            }
        }

        return coreData;
    }

    /**
     * Reconstruct extension headers from webapp data
     * @param {Object} webappHeaders - Original webapp headers
     * @param {Object} coreData - Extracted core data
     * @returns {Object} Reconstructed extension headers
     */
    reconstructExtensionHeaders(webappHeaders, coreData) {
        const extensionHeaders = { ...this.extensionHeaders };
        
        // Core authentication and device data (direct copy)
        if (coreData.authorization) {
            extensionHeaders['authorization'] = coreData.authorization;
        }
        
        if (coreData.deviceId) {
            extensionHeaders['x-amplitude-device-id'] = coreData.deviceId;
            // Intentionally omit x-vidiq-device-id to keep headers minimal
        }
        
        if (coreData.userAgent) {
            extensionHeaders['user-agent'] = coreData.userAgent;
        }
        
        // Intentionally omit x-timezone to avoid over-specifying headers
        
        // Extension-specific client identification
        extensionHeaders['x-vidiq-client'] = 'ext vch/3.151.0';
        
        // Copy a minimal set of compatible webapp headers
        // Avoid referer and client hints by default to better match extension background requests
        const compatibleHeaders = [
            // intentionally empty for now; we may add opt-in flags later
        ];
        
        for (const header of compatibleHeaders) {
            if (webappHeaders[header]) {
                extensionHeaders[header] = webappHeaders[header];
            }
        }
        
        return extensionHeaders;
    }

    /**
     * Generate a UUID v4 string
     */
    generateUuid() {
        if (crypto.randomUUID) return crypto.randomUUID();
        const bytes = crypto.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
        const hex = bytes.toString('hex');
        return (
            hex.substr(0, 8) + '-' +
            hex.substr(8, 4) + '-' +
            hex.substr(12, 4) + '-' +
            hex.substr(16, 4) + '-' +
            hex.substr(20)
        );
    }

    /**
     * Produce a single canonical headers object for extension use.
     * Options:
     *  - randomizeDeviceId (default true): generate a new x-amplitude-device-id
     *  - includeContentType (default true): include content-type: application/json
     *  - quiet (default true): suppress logs
     */
    async generateHeadersObject(sessionIdOrProfile, options = {}) {
        const opts = { randomizeDeviceId: true, includeContentType: true, quiet: true, ...options };
        const wasQuiet = this.quiet;
        this.quiet = !!opts.quiet;
        try {
            this._log(`🔍 Starting reconstruction for: ${sessionIdOrProfile}`);
            let sessionId = sessionIdOrProfile;
            if (!sessionIdOrProfile.match(/^[\w-]{36}$/)) {
                this._log(`📋 Looking for latest session for profile: ${sessionIdOrProfile}`);
                sessionId = await this.findLatestSession(sessionIdOrProfile);
                if (!sessionId) {
                    throw new Error(`No sessions found for profile: ${sessionIdOrProfile}`);
                }
                this._log(`📋 Found latest session: ${sessionId}`);
            }

            this._log(`📊 Loading session data for: ${sessionId}`);
            const requests = await this.loadSessionData(sessionId);
            this._log(`📊 Loaded ${requests.length} requests from validated successful session`);

            const coreData = this.extractCoreData(requests);
            this._log(`🔑 Extracted core data - Auth: ${!!coreData.authorization}, Device: ${!!coreData.deviceId}`);

            const headers = { ...this.extensionHeaders };
            headers['x-vidiq-client'] = 'ext vch/3.151.0';
            if (coreData.authorization) headers['authorization'] = coreData.authorization;
            if (coreData.userAgent) headers['user-agent'] = coreData.userAgent;

            let deviceId = null;
            if (opts.randomizeDeviceId) {
                deviceId = this.generateUuid();
            } else {
                deviceId = coreData.deviceId || this.generateUuid();
            }
            headers['x-amplitude-device-id'] = deviceId;

            if (opts.includeContentType) headers['content-type'] = 'application/json';

            return { extensionHeaders: headers };
        } finally {
            this.quiet = wasQuiet;
        }
    }

    /**
     * Generate curl command for extension request
     * @param {string} url - Request URL
     * @param {string} method - HTTP method
     * @param {Object} headers - Request headers
     * @param {string} postData - POST data (if any)
     * @returns {string} Curl command
     */
    generateCurlCommand(url, method, headers, postData = null) {
        let curl = `curl -X ${method}`;

        const escapeForDollarSingle = (str) => {
            return str
                .replace(/\\/g, "\\\\")
                .replace(/'/g, "\\'")
                .replace(/!/g, "\\u0021");
        };

        // Add headers (zsh-safe: escape ! in header lines)
        for (const [key, value] of Object.entries(headers)) {
            const headerLine = `${key}: ${value}`;
            if (headerLine.includes('!')) {
                curl += ` \\\n  -H $'${escapeForDollarSingle(headerLine)}'`;
            } else {
                curl += ` \\\n  -H '${headerLine}'`;
            }
        }
        
        // Add POST data if present
        if (postData && method === 'POST') {
            // Prefer standard single quotes for data to avoid unexpected escape processing
            curl += ` \\\n  -d '${postData}'`;
        }
        
        curl += ` \\\n  '${url}'`;
        
        return curl;
    }

    /**
     * Generate analysis report
     * @param {Object} coreData - Extracted core data
     * @param {Array} reconstructedRequests - Reconstructed requests
     * @returns {Object} Analysis report
     */
    generateAnalysisReport(coreData, reconstructedRequests) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalRequests: reconstructedRequests.length,
                hasAuthorization: !!coreData.authorization,
                hasDeviceId: !!coreData.deviceId,
                hasUserAgent: !!coreData.userAgent
            },
            coreData: {
                authorization: coreData.authorization ? `${coreData.authorization.substring(0, 30)}...` : 'MISSING',
                deviceId: coreData.deviceId || 'MISSING',
                userAgent: coreData.userAgent || 'MISSING',
                timezone: coreData.timezone || 'MISSING'
            },
            adaptationWarnings: [],
            reconstructionConcerns: [],
            recommendations: []
        };

        // Check for adaptation requirements
        if (!coreData.authorization) {
            report.adaptationWarnings.push({
                severity: 'CRITICAL',
                issue: 'No authorization token found',
                impact: 'Extension requests will fail authentication',
                solution: 'Ensure session data includes authenticated requests'
            });
        }

        if (!coreData.deviceId) {
            report.adaptationWarnings.push({
                severity: 'HIGH',
                issue: 'No device ID found',
                impact: 'Requests may be flagged as suspicious',
                solution: 'Manually extract device ID from extension developer tools'
            });
        }

        // Document adaptation requirements
        Object.entries(this.adaptationRequired).forEach(([header, info]) => {
            report.reconstructionConcerns.push({
                type: 'ADAPTATION_REQUIRED',
                header: header,
                webapp: info.webapp,
                extension: info.extension,
                reason: info.reason
            });
        });

        // Document extension-specific headers
        Object.entries(this.extensionSpecific).forEach(([header, value]) => {
            report.reconstructionConcerns.push({
                type: 'EXTENSION_SPECIFIC',
                header: header,
                value: value,
                reason: 'Cannot be captured from webapp, using standard extension values'
            });
        });

        // Generate recommendations
        if (report.summary.hasAuthorization && report.summary.hasDeviceId) {
            report.recommendations.push('✅ Core authentication data available - reconstruction should work');
        }

        if (reconstructedRequests.length > 0) {
            report.recommendations.push('✅ Successfully reconstructed extension requests');
        }

        report.recommendations.push('⚠️  Test reconstructed requests in small batches first');
        report.recommendations.push('⚠️  Monitor for rate limiting or detection');
        report.recommendations.push('💡 Consider rotating user agents and device IDs for large-scale use');

        return report;
    }

    /**
     * Reconstruct extension requests from session data
     * @param {string} sessionIdOrProfile - Session ID or profile name
     * @param {Object} options - Reconstruction options
     * @returns {Promise<Object>} Reconstruction result
     */
    async reconstructSession(sessionIdOrProfile, options = {}) {
        try {
            this._log(`🔍 Starting reconstruction for: ${sessionIdOrProfile}`);
            
            // Determine if input is session ID or profile name
            let sessionId = sessionIdOrProfile;
            if (!sessionIdOrProfile.match(/^[\w-]{36}$/)) {
                // Looks like profile name, find latest session
                this._log(`📋 Looking for latest session for profile: ${sessionIdOrProfile}`);
                sessionId = await this.findLatestSession(sessionIdOrProfile);
                if (!sessionId) {
                    throw new Error(`No sessions found for profile: ${sessionIdOrProfile}`);
                }
                this._log(`📋 Found latest session: ${sessionId}`);
            }

            // Load session data
            this._log(`📊 Loading session data for: ${sessionId}`);
            const requests = await this.loadSessionData(sessionId);
            this._log(`📊 Loaded ${requests.length} requests from validated successful session`);

            // Extract core data
            const coreData = this.extractCoreData(requests);
            this._log(`🔑 Extracted core data - Auth: ${!!coreData.authorization}, Device: ${!!coreData.deviceId}`);

            // Reconstruct requests
            const reconstructedRequests = [];
            for (const request of coreData.validRequests) {
                const extensionHeaders = this.reconstructExtensionHeaders(request.headers, coreData);
                // Ensure JSON content-type for POST requests with a body if not already present
                if (request.method === 'POST' && request.postData && !extensionHeaders['content-type']) {
                    extensionHeaders['content-type'] = 'application/json';
                }
                if (options.headersOnly) {
                    // Randomize device id by default for headers-only output
                    extensionHeaders['x-amplitude-device-id'] = this.generateUuid();
                }
                if (options.headersOnly) {
                    reconstructedRequests.push({
                        extensionHeaders,
                        endpoint: request.custom?.endpoint || 'unknown',
                        timestamp: request.timestamp
                    });
                } else {
                    const curlCommand = this.generateCurlCommand(
                        request.url,
                        request.method,
                        extensionHeaders,
                        request.postData
                    );
                    reconstructedRequests.push({
                        original: request,
                        extensionHeaders,
                        curlCommand,
                        endpoint: request.custom?.endpoint || 'unknown',
                        timestamp: request.timestamp
                    });
                }
            }

            // Save results
            const outputFile = path.join(this.outputDir, `extension-reconstruction-${sessionId}-${Date.now()}.json`);
            const results = options.headersOnly
                ? { sessionId, reconstructedRequests }
                : { sessionId, report: this.generateAnalysisReport(coreData, reconstructedRequests), reconstructedRequests };

            fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
            this._log(`💾 Results saved to: ${outputFile}`);

            return results;

        } catch (error) {
            throw new Error(`Reconstruction failed: ${error.message}`);
        }
    }

    /**
     * Generate extension headers for multiple profiles with a given prefix
     * @param {string} prefix - Profile name prefix
     * @param {Object} options - Generation options
     * @returns {Promise<Array>} Array of profile objects with extension headers
     */
    async generateHeadersForProfiles(prefix, options = {}) {
        const opts = { randomizeDeviceId: true, includeContentType: false, quiet: true, ...options };
        const profiles = await this.findProfilesWithPrefix(prefix);
        const results = [];
        
        for (const profile of profiles) {
            try {
                const headerResult = await this.generateHeadersObject(profile.sessionId, opts);
                
                // Create headers in the exact order as real extension requests
                const orderedHeaders = {};
                
                // First: accept
                orderedHeaders['accept'] = headerResult.extensionHeaders['accept'];
                
                // Second: accept-language  
                orderedHeaders['accept-language'] = headerResult.extensionHeaders['accept-language'];
                
                // Third: authorization
                if (headerResult.extensionHeaders['authorization']) {
                    orderedHeaders['authorization'] = headerResult.extensionHeaders['authorization'];
                }
                
                // Then add the rest in the exact order as real extension
                const remainingHeadersOrder = [
                    'priority', 
                    'sec-fetch-dest',
                    'sec-fetch-mode',
                    'sec-fetch-site',
                    'user-agent',
                    'x-amplitude-device-id',
                    'x-client-location',
                    'x-vidiq-client'
                ];
                
                remainingHeadersOrder.forEach(key => {
                    if (headerResult.extensionHeaders[key] && !orderedHeaders[key]) {
                        orderedHeaders[key] = headerResult.extensionHeaders[key];
                    }
                });
                
                results.push({
                    name: profile.profileName,
                    extension: {
                        headers: orderedHeaders
                    }
                });
            } catch (error) {
                if (!opts.quiet) {
                    console.error(`Failed to generate headers for profile ${profile.profileName}:`, error.message);
                }
            }
        }
        
        return results;
    }

    /**
     * Generate summary report for reconstruction concerns
     * @returns {Object} Summary of adaptation requirements and concerns
     */
    getReconstructionSummary() {
        return {
            adaptationRequired: {
                description: 'Headers that need modification when converting webapp to extension requests',
                headers: this.adaptationRequired,
                canBeHandled: true,
                impact: 'Automatic conversion with known mappings'
            },
            extensionSpecific: {
                description: 'Headers unique to extension requests that cannot be captured from webapp',
                headers: this.extensionSpecific,
                canBeHandled: true,
                impact: 'Using standard extension values, may need adjustment for specific contexts'
            },
            potentialConcerns: [
                {
                    concern: 'Rate Limiting',
                    severity: 'MEDIUM',
                    description: 'Extension requests may have different rate limits than webapp',
                    mitigation: 'Start with small batches and monitor response codes'
                },
                {
                    concern: 'Request Patterns',
                    severity: 'LOW',
                    description: 'Extension may make requests in different order/timing',
                    mitigation: 'Observe extension behavior and match patterns'
                },
                {
                    concern: 'Security Headers',
                    severity: 'LOW',
                    description: 'Extension-specific security headers use standard values',
                    mitigation: 'Values are based on Chrome extension standards'
                }
            ],
            confidence: {
                coreAuthentication: 'HIGH',
                headerAdaptation: 'HIGH',
                requestTiming: 'MEDIUM',
                overallSuccess: 'HIGH'
            }
        };
    }
}