import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProfileManager } from './ProfileManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SessionStatusScanner - Comprehensive session status analysis tool
 * 
 * Scans captured sessions to identify their status, especially those not correctly 
 * recorded in the SQLite database. Analyzes various failure types including:
 * - 400 errors (clear failures)
 * - CAPTCHA detection/blocking
 * - Network timeouts
 * - Proxy issues
 * - Authentication failures
 * - Success cases
 */
export class SessionStatusScanner {
    constructor(options = {}) {
        this.capturedRequestsDir = options.capturedRequestsDir || './captured-requests';
        this.automationResultsDir = options.automationResultsDir || './automation-results';
        this.profilesDir = options.profilesDir || './profiles';
        this.quiet = !!options.quiet;
        
        // Initialize ProfileManager for database cross-reference
        this.profileManager = new ProfileManager(this.profilesDir);
    }

    /**
     * Scan all captured sessions and analyze their status
     */
    async scanAllSessions() {
        if (!this.quiet) {
            console.log('🔍 Starting comprehensive session status scan...');
        }

        const results = {
            totalSessions: 0,
            statusCounts: {},
            sessions: [],
            dbMismatches: [],
            summary: {}
        };

        // Get all captured request files
        const capturedFiles = await this.getCapturedRequestFiles();
        results.totalSessions = capturedFiles.length;

        if (!this.quiet) {
            console.log(`📊 Found ${capturedFiles.length} captured session files`);
        }

        // Analyze each session
        for (const file of capturedFiles) {
            try {
                const sessionAnalysis = await this.analyzeSession(file);
                results.sessions.push(sessionAnalysis);
                
                // Count status types
                const status = sessionAnalysis.finalStatus;
                results.statusCounts[status] = (results.statusCounts[status] || 0) + 1;

                // Check for database mismatches
                const dbMismatch = await this.checkDatabaseMismatch(sessionAnalysis);
                if (dbMismatch) {
                    results.dbMismatches.push(dbMismatch);
                }

                if (!this.quiet && results.sessions.length % 50 === 0) {
                    console.log(`📈 Processed ${results.sessions.length}/${capturedFiles.length} sessions...`);
                }
            } catch (error) {
                if (!this.quiet) {
                    console.error(`❌ Error analyzing ${file.name}: ${error.message}`);
                }
            }
        }

        // Generate summary
        results.summary = this.generateSummary(results);

        if (!this.quiet) {
            console.log('✅ Session status scan completed');
        }

        return results;
    }

    /**
     * Get all captured request files
     */
    async getCapturedRequestFiles() {
        const files = [];
        
        if (!fs.existsSync(this.capturedRequestsDir)) {
            return files;
        }

        const entries = fs.readdirSync(this.capturedRequestsDir);
        
        for (const entry of entries) {
            if (entry.endsWith('.jsonl')) {
                const filePath = path.join(this.capturedRequestsDir, entry);
                const stats = fs.statSync(filePath);
                
                // Extract profile name and session ID from filename
                const match = entry.match(/^(.+?)(?:-export)?(?:-vidiq-(?:app-)?capture)?-([a-f0-9-]{36})/);
                const profileName = match ? match[1] : entry.replace(/\.jsonl$/, '');
                const sessionId = match ? match[2] : null;
                
                files.push({
                    name: entry,
                    path: filePath,
                    profileName,
                    sessionId,
                    size: stats.size,
                    modified: stats.mtime
                });
            }
        }

        return files.sort((a, b) => b.modified - a.modified);
    }

    /**
     * Analyze a single session file
     */
    async analyzeSession(file) {
        const analysis = {
            fileName: file.name,
            profileName: file.profileName,
            sessionId: file.sessionId,
            fileSize: file.size,
            lastModified: file.modified,
            finalStatus: 'unknown',
            statusReason: '',
            errorDetails: null,
            requestCount: 0,
            responseCount: 0,
            authAttempts: [],
            successIndicators: [],
            failureIndicators: [],
            captchaDetected: false,
            networkIssues: false,
            proxyIssues: false,
            timeoutDetected: false,
            lastActivity: null,
            duration: null
        };

        try {
            // Read and parse the JSONL file efficiently
            const content = fs.readFileSync(file.path, 'utf8');
            const lines = content.trim().split('\n').filter(line => line.trim());
            
            let firstTimestamp = null;
            let lastTimestamp = null;

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    
                    // Track timestamps for duration calculation
                    if (entry.timestamp) {
                        const timestamp = new Date(entry.timestamp);
                        if (!firstTimestamp) firstTimestamp = timestamp;
                        lastTimestamp = timestamp;
                    }

                    // Count request/response types
                    if (entry.type === 'request') {
                        analysis.requestCount++;
                    } else if (entry.type === 'response') {
                        analysis.responseCount++;
                    }

                    // Analyze the entry for status indicators
                    this.analyzeEntry(entry, analysis);

                } catch (parseError) {
                    // Skip malformed JSON lines
                    continue;
                }
            }

            // Calculate session duration
            if (firstTimestamp && lastTimestamp) {
                analysis.duration = lastTimestamp - firstTimestamp;
                analysis.lastActivity = lastTimestamp;
            }

            // Determine final status based on analysis
            analysis.finalStatus = this.determineFinalStatus(analysis);

        } catch (error) {
            analysis.finalStatus = 'file_error';
            analysis.statusReason = `Failed to read file: ${error.message}`;
        }

        return analysis;
    }

    /**
     * Analyze a single JSONL entry for status indicators
     */
    analyzeEntry(entry, analysis) {
        const url = entry.url || '';
        const status = entry.status;
        const body = entry.body || '';
        const method = entry.method || '';

        // Check for authentication attempts
        if (url.includes('/auth/signup') || url.includes('/auth/login')) {
            analysis.authAttempts.push({
                type: url.includes('signup') ? 'signup' : 'login',
                method,
                status,
                timestamp: entry.timestamp,
                success: status >= 200 && status < 300
            });
        }

        // Check for clear 400 errors (like the example provided)
        if (status === 400) {
            let errorDetail = { status: 400, url, timestamp: entry.timestamp };
            
            try {
                if (body) {
                    const bodyData = JSON.parse(body);
                    errorDetail.code = bodyData.code;
                    errorDetail.message = bodyData.message;
                    errorDetail.details = bodyData.details;
                }
            } catch (e) {
                errorDetail.rawBody = body;
            }
            
            analysis.failureIndicators.push(errorDetail);

            // Specific error type detection
            if (body.includes('does not appear to be a valid email address')) {
                analysis.statusReason = 'Invalid email address';
            } else if (body.includes('illegal_input')) {
                analysis.statusReason = 'Illegal input error';
            }
        }

        // Check for success indicators
        if (status >= 200 && status < 300) {
            if (url.includes('/subscriptions/active') || 
                url.includes('/subscriptions/stripe/next-subscription') ||
                url.includes('/auth/user')) {
                analysis.successIndicators.push({
                    type: 'api_success',
                    url,
                    status,
                    timestamp: entry.timestamp
                });
            }
        }

        // Check for CAPTCHA indicators
        if (body.includes('captcha') || body.includes('recaptcha') || 
            url.includes('captcha') || url.includes('recaptcha')) {
            analysis.captchaDetected = true;
            analysis.failureIndicators.push({
                type: 'captcha',
                url,
                timestamp: entry.timestamp
            });
        }

        // Check for network/proxy issues
        if (status === 0 || status >= 500 || 
            body.includes('timeout') || body.includes('network error')) {
            analysis.networkIssues = true;
            analysis.failureIndicators.push({
                type: 'network_error',
                status,
                url,
                timestamp: entry.timestamp
            });
        }

        // Check for proxy-specific issues
        if (status === 407 || body.includes('proxy') || 
            body.includes('authentication required')) {
            analysis.proxyIssues = true;
            analysis.failureIndicators.push({
                type: 'proxy_error',
                status,
                url,
                timestamp: entry.timestamp
            });
        }
    }

    /**
     * Determine the final status based on analysis
     */
    determineFinalStatus(analysis) {
        // Clear success cases
        if (analysis.successIndicators.length > 0) {
            const hasAuthSuccess = analysis.authAttempts.some(attempt => attempt.success);
            if (hasAuthSuccess) {
                return 'success';
            }
        }

        // Clear failure cases
        if (analysis.failureIndicators.length > 0) {
            // Check for 400 errors first (most definitive)
            const has400Error = analysis.failureIndicators.some(f => f.status === 400);
            if (has400Error) {
                return 'auth_failure_400';
            }

            // Check for CAPTCHA blocking
            if (analysis.captchaDetected) {
                return 'captcha_blocked';
            }

            // Check for network issues
            if (analysis.networkIssues) {
                return 'network_error';
            }

            // Check for proxy issues
            if (analysis.proxyIssues) {
                return 'proxy_error';
            }
        }

        // Check for timeout indicators
        if (analysis.duration && analysis.duration > 300000) { // 5 minutes
            return 'timeout_likely';
        }

        // Check if session seems incomplete
        if (analysis.requestCount === 0) {
            return 'no_activity';
        }

        if (analysis.authAttempts.length === 0) {
            return 'no_auth_attempt';
        }

        // If we have auth attempts but no clear success/failure
        if (analysis.authAttempts.length > 0) {
            const lastAuth = analysis.authAttempts[analysis.authAttempts.length - 1];
            if (lastAuth.status === 200) {
                return 'auth_success_unclear';
            } else {
                return 'auth_failure_unclear';
            }
        }

        return 'unknown';
    }

    /**
     * Check for database mismatches
     */
    async checkDatabaseMismatch(sessionAnalysis) {
        try {
            // Get profile from database
            const profile = await this.profileManager.getProfileByName(sessionAnalysis.profileName);
            
            if (!profile) {
                return {
                    type: 'profile_not_in_db',
                    profileName: sessionAnalysis.profileName,
                    sessionStatus: sessionAnalysis.finalStatus,
                    issue: 'Profile exists in captured requests but not in database'
                };
            }

            // Check if the session status matches what we'd expect from the database
            // This would require additional database schema to track session outcomes
            // For now, we'll flag potential mismatches based on status patterns

            if (sessionAnalysis.finalStatus === 'success' && 
                sessionAnalysis.successIndicators.length > 0) {
                // This should be marked as successful in the database
                return {
                    type: 'potential_success_not_recorded',
                    profileName: sessionAnalysis.profileName,
                    sessionId: sessionAnalysis.sessionId,
                    sessionStatus: sessionAnalysis.finalStatus,
                    successIndicators: sessionAnalysis.successIndicators.length,
                    issue: 'Session appears successful but may not be recorded as such'
                };
            }

            return null;
        } catch (error) {
            return {
                type: 'db_check_error',
                profileName: sessionAnalysis.profileName,
                error: error.message
            };
        }
    }

    /**
     * Generate summary statistics
     */
    generateSummary(results) {
        const summary = {
            totalSessions: results.totalSessions,
            statusBreakdown: results.statusCounts,
            successRate: 0,
            failureRate: 0,
            unknownRate: 0,
            dbMismatchCount: results.dbMismatches.length,
            topFailureReasons: {},
            recommendations: []
        };

        // Calculate rates
        const successCount = (results.statusCounts.success || 0) + 
                           (results.statusCounts.auth_success_unclear || 0);
        const failureCount = Object.keys(results.statusCounts)
            .filter(status => status.includes('failure') || status.includes('error') || 
                             status.includes('blocked') || status.includes('timeout'))
            .reduce((sum, status) => sum + results.statusCounts[status], 0);
        const unknownCount = (results.statusCounts.unknown || 0) + 
                           (results.statusCounts.auth_success_unclear || 0);

        summary.successRate = ((successCount / results.totalSessions) * 100).toFixed(1);
        summary.failureRate = ((failureCount / results.totalSessions) * 100).toFixed(1);
        summary.unknownRate = ((unknownCount / results.totalSessions) * 100).toFixed(1);

        // Generate recommendations
        if (results.statusCounts.auth_failure_400 > 0) {
            summary.recommendations.push(
                `${results.statusCounts.auth_failure_400} sessions failed with 400 errors - check email validation and input data`
            );
        }

        if (results.statusCounts.captcha_blocked > 0) {
            summary.recommendations.push(
                `${results.statusCounts.captcha_blocked} sessions blocked by CAPTCHA - consider CAPTCHA solving or rate limiting`
            );
        }

        if (results.statusCounts.network_error > 0) {
            summary.recommendations.push(
                `${results.statusCounts.network_error} sessions had network errors - check proxy stability and network connectivity`
            );
        }

        if (results.dbMismatches.length > 0) {
            summary.recommendations.push(
                `${results.dbMismatches.length} potential database mismatches found - review session recording logic`
            );
        }

        return summary;
    }

    /**
     * Get automation results for cross-reference
     */
    async getAutomationResults() {
        const results = [];
        
        if (!fs.existsSync(this.automationResultsDir)) {
            return results;
        }

        const files = fs.readdirSync(this.automationResultsDir)
            .filter(file => file.endsWith('.jsonl') && file.startsWith('batch-'));

        for (const file of files) {
            try {
                const filePath = path.join(this.automationResultsDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.trim().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);
                        results.push(entry);
                    } catch (e) {
                        // Skip malformed lines
                    }
                }
            } catch (error) {
                // Skip files that can't be read
            }
        }

        return results;
    }

    /**
     * Cross-reference with automation results
     */
    async crossReferenceAutomationResults(sessionResults) {
        const automationResults = await this.getAutomationResults();
        const crossReference = [];

        for (const session of sessionResults.sessions) {
            const matchingAutomation = automationResults.find(auto => 
                auto.profileName === session.profileName ||
                auto.sessionId === session.sessionId
            );

            if (matchingAutomation) {
                const mismatch = session.finalStatus !== 'success' && matchingAutomation.success;
                const agreement = (session.finalStatus === 'success') === matchingAutomation.success;

                crossReference.push({
                    profileName: session.profileName,
                    sessionId: session.sessionId,
                    capturedStatus: session.finalStatus,
                    automationStatus: matchingAutomation.success ? 'success' : 'failure',
                    automationReason: matchingAutomation.reason,
                    agreement,
                    mismatch: !agreement,
                    automationData: matchingAutomation
                });
            }
        }

        return crossReference;
    }

    /**
     * Export results to file
     */
    async exportResults(results, outputPath) {
        const exportData = {
            scanTimestamp: new Date().toISOString(),
            summary: results.summary,
            statusCounts: results.statusCounts,
            totalSessions: results.totalSessions,
            dbMismatches: results.dbMismatches,
            sessions: results.sessions.map(session => ({
                fileName: session.fileName,
                profileName: session.profileName,
                sessionId: session.sessionId,
                finalStatus: session.finalStatus,
                statusReason: session.statusReason,
                requestCount: session.requestCount,
                responseCount: session.responseCount,
                authAttempts: session.authAttempts.length,
                successIndicators: session.successIndicators.length,
                failureIndicators: session.failureIndicators.length,
                captchaDetected: session.captchaDetected,
                networkIssues: session.networkIssues,
                proxyIssues: session.proxyIssues,
                duration: session.duration,
                lastActivity: session.lastActivity
            }))
        };

        fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
        
        if (!this.quiet) {
            console.log(`📄 Results exported to: ${outputPath}`);
        }
    }
}