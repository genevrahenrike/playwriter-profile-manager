/**
 * ExtensionFlowDetector - Detects whether a profile needs signup or is already created
 * 
 * This class analyzes the VidIQ extension install page and subsequent traffic to determine:
 * 1. If the profile leads to signup flow (account not created)
 * 2. If the profile shows existing session traffic (account exists but needs token capture)
 * 3. If the profile requires login (account exists but logged out)
 */

import chalk from 'chalk';

export class ExtensionFlowDetector {
    constructor(options = {}) {
        this.timeout = options.timeout || 30000;
        this.captchaGrace = options.captchaGrace || 15000;
        this.quiet = !!options.quiet;
    }

    /**
     * Detect the flow type by analyzing the extension install page and traffic
     * @param {Object} page - Playwright page
     * @param {Object} requestCaptureSystem - Request capture system
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Detection result
     */
    async detectFlow(page, requestCaptureSystem, sessionId) {
        const result = {
            flowType: 'unknown',
            reason: '',
            needsSignup: false,
            needsLogin: false,
            hasValidSession: false,
            extensionInstallDetected: false,
            signupPageDetected: false,
            loginPageDetected: false,
            apiTrafficDetected: false,
            capturedRequests: 0
        };

        try {
            if (!this.quiet) {
                console.log(chalk.blue('🔍 Detecting extension flow type...'));
            }

            // Wait for initial page load and extension popup
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            
            const initialUrl = page.url();
            if (!this.quiet) {
                console.log(chalk.dim(`📍 Initial URL: ${initialUrl}`));
            }

            // Check if we're on extension install page
            if (initialUrl.includes('extension_install') || initialUrl.includes('extension_login_success')) {
                result.extensionInstallDetected = true;
                if (!this.quiet) {
                    console.log(chalk.cyan('🧩 Extension install page detected'));
                }
                
                // For extension install pages, we need to trigger the flow by interacting
                try {
                    // Wait for page to fully load
                    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
                    
                    // Look for continue/next buttons that might trigger the flow
                    const continueSelectors = [
                        'button:has-text("Continue")',
                        'a:has-text("Continue")',
                        'button:has-text("Next")',
                        'button:has-text("Get Started")',
                        '[data-testid*="continue"]',
                        '.continue-btn',
                        '#continue'
                    ];
                    
                    for (const selector of continueSelectors) {
                        const button = page.locator(selector).first();
                        if (await button.count() > 0 && await button.isVisible()) {
                            if (!this.quiet) {
                                console.log(chalk.cyan(`🔘 Clicking continue button: ${selector}`));
                            }
                            await button.click();
                            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
                            break;
                        }
                    }
                } catch (error) {
                    if (!this.quiet) {
                        console.log(chalk.yellow(`⚠️  Could not interact with extension install page: ${error.message}`));
                    }
                }
            }

            // Monitor for 15 seconds to see what happens after interaction
            const monitorStart = Date.now();
            const monitorDuration = 15000; // 15 seconds
            
            while (Date.now() - monitorStart < monitorDuration) {
                const currentUrl = page.url();
                
                // Check for signup page indicators
                if (this.isSignupPage(currentUrl)) {
                    result.signupPageDetected = true;
                    result.flowType = 'signup_required';
                    result.needsSignup = true;
                    result.reason = 'Redirected to signup page - account not created';
                    break;
                }
                
                // Check for login page indicators
                if (await this.isLoginPage(page)) {
                    result.loginPageDetected = true;
                    result.flowType = 'login_required';
                    result.needsLogin = true;
                    result.reason = 'Login page detected - account exists but logged out';
                    break;
                }
                
                // Check for extension_login_success (successful account, just need to capture traffic)
                if (currentUrl.includes('extension_login_success')) {
                    if (!this.quiet) {
                        console.log(chalk.green('✅ Extension login success page detected - account exists'));
                    }
                    
                    // Navigate to dashboard to trigger API traffic
                    try {
                        console.log(chalk.dim('↪️  Navigating to dashboard to capture API traffic...'));
                        await page.goto('https://app.vidiq.com/dashboard', {
                            waitUntil: 'domcontentloaded',
                            timeout: 15000
                        });
                        
                        // Wait for API traffic to start
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        
                        const captured = requestCaptureSystem.getCapturedRequests(sessionId) || [];
                        const apiTraffic = captured.filter(r =>
                            r.type === 'response' &&
                            r.status >= 200 && r.status < 300 &&
                            r.url && r.url.includes('api.vidiq.com')
                        );
                        
                        if (apiTraffic.length > 0) {
                            result.apiTrafficDetected = true;
                            result.flowType = 'valid_session';
                            result.hasValidSession = true;
                            result.reason = `Extension login success - captured ${apiTraffic.length} API calls`;
                            break;
                        } else {
                            result.flowType = 'extension_login_success_no_traffic';
                            result.hasValidSession = true; // Account exists, just no traffic yet
                            result.reason = 'Extension login success detected but no API traffic captured yet';
                            break;
                        }
                    } catch (navError) {
                        if (!this.quiet) {
                            console.log(chalk.yellow(`⚠️  Navigation to dashboard failed: ${navError.message}`));
                        }
                        result.flowType = 'extension_login_success_nav_failed';
                        result.hasValidSession = true; // Account exists
                        result.reason = 'Extension login success but dashboard navigation failed';
                        break;
                    }
                }
                
                // Check for dashboard/app page (successful session)
                if (this.isDashboardPage(currentUrl)) {
                    // Wait a bit for API traffic to start
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Check for API traffic to confirm valid session
                    const captured = requestCaptureSystem.getCapturedRequests(sessionId) || [];
                    const apiTraffic = captured.filter(r =>
                        r.type === 'response' &&
                        r.status >= 200 && r.status < 300 &&
                        r.url && r.url.includes('api.vidiq.com')
                    );
                    
                    if (apiTraffic.length > 0) {
                        result.apiTrafficDetected = true;
                        result.flowType = 'valid_session';
                        result.hasValidSession = true;
                        result.reason = `Valid session detected - ${apiTraffic.length} API calls captured`;
                        break;
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Final analysis of captured traffic
            const finalCaptured = requestCaptureSystem.getCapturedRequests(sessionId) || [];
            result.capturedRequests = finalCaptured.length;

            // If no clear flow detected, analyze captured traffic patterns
            if (result.flowType === 'unknown') {
                result.flowType = this.analyzeTrafficPatterns(finalCaptured);
                result.reason = this.getReasonForTrafficPattern(result.flowType, finalCaptured);
            }

            // Special handling for extension install pages with no traffic
            if (result.extensionInstallDetected && result.flowType === 'no_traffic') {
                result.flowType = 'extension_install_inactive';
                result.reason = 'Extension install page detected but no subsequent flow - may need manual interaction or account creation';
                result.needsSignup = true; // Assume signup needed if no traffic from extension install
            }

            if (!this.quiet) {
                console.log(chalk.green(`✅ Flow detection complete: ${result.flowType}`));
                console.log(chalk.dim(`   Reason: ${result.reason}`));
                console.log(chalk.dim(`   Captured requests: ${result.capturedRequests}`));
            }

            return result;

        } catch (error) {
            result.flowType = 'error';
            result.reason = `Detection failed: ${error.message}`;
            if (!this.quiet) {
                console.log(chalk.red(`❌ Flow detection error: ${error.message}`));
            }
            return result;
        }
    }

    /**
     * Check if URL indicates a signup page
     * @param {string} url - Current page URL
     * @returns {boolean} Whether this is a signup page
     */
    isSignupPage(url) {
        if (!url) return false;
        return url.includes('/signup') || 
               url.includes('/register') || 
               url.includes('/create-account');
    }

    /**
     * Check if page shows login form
     * @param {Object} page - Playwright page
     * @returns {Promise<boolean>} Whether this is a login page
     */
    async isLoginPage(page) {
        try {
            const emailFields = await page.locator('input[type="email"], input[name="email"]').count();
            const passwordFields = await page.locator('input[type="password"], input[name="password"]').count();
            const loginButtons = await page.locator('button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').count();
            
            return emailFields > 0 && passwordFields > 0 && loginButtons > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if URL indicates a dashboard/app page
     * @param {string} url - Current page URL
     * @returns {boolean} Whether this is a dashboard page
     */
    isDashboardPage(url) {
        if (!url) return false;
        return url.includes('/dashboard') ||
               (url.includes('app.vidiq.com') &&
                !url.includes('/signup') &&
                !url.includes('/login') &&
                !url.includes('/extension_install') &&
                !url.includes('/extension_login_success'));
    }

    /**
     * Analyze traffic patterns to determine flow type
     * @param {Array} capturedRequests - Captured network requests
     * @returns {string} Detected flow type
     */
    analyzeTrafficPatterns(capturedRequests) {
        const responses = capturedRequests.filter(r => r.type === 'response');
        
        // Look for authentication-related responses
        const authResponses = responses.filter(r => 
            r.url && (
                r.url.includes('/auth/') ||
                r.url.includes('/login') ||
                r.url.includes('/signup') ||
                r.url.includes('/token')
            )
        );

        // Look for successful API responses
        const successfulApiResponses = responses.filter(r =>
            r.status >= 200 && r.status < 300 &&
            r.url && r.url.includes('api.vidiq.com')
        );

        // Look for failed auth responses
        const failedAuthResponses = authResponses.filter(r => r.status >= 400);

        if (successfulApiResponses.length >= 3) {
            return 'valid_session';
        } else if (failedAuthResponses.length > 0) {
            return 'login_required';
        } else if (authResponses.length > 0) {
            return 'signup_required';
        } else if (capturedRequests.length === 0) {
            return 'no_traffic';
        } else {
            return 'unclear_state';
        }
    }

    /**
     * Get human-readable reason for traffic pattern
     * @param {string} flowType - Detected flow type
     * @param {Array} capturedRequests - Captured requests
     * @returns {string} Human-readable reason
     */
    getReasonForTrafficPattern(flowType, capturedRequests) {
        switch (flowType) {
            case 'valid_session':
                return `Valid session confirmed by API traffic (${capturedRequests.filter(r => r.type === 'response' && r.status < 300).length} successful responses)`;
            case 'login_required':
                return 'Failed authentication responses detected - login required';
            case 'signup_required':
                return 'Authentication traffic detected but no success - signup may be required';
            case 'no_traffic':
                return 'No network traffic captured - profile may be inactive';
            case 'unclear_state':
                return `Unclear state - ${capturedRequests.length} requests captured but no clear pattern`;
            default:
                return 'Unknown flow type detected';
        }
    }

    /**
     * Wait for extension popup and analyze the resulting flow
     * @param {Object} page - Playwright page
     * @param {Object} context - Browser context
     * @param {Object} requestCaptureSystem - Request capture system
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Flow analysis result
     */
    async waitForExtensionPopupAndAnalyze(page, context, requestCaptureSystem, sessionId) {
        if (!this.quiet) {
            console.log(chalk.blue('⏳ Waiting for extension popup and analyzing flow...'));
        }

        // Wait for extension to trigger popup (VidIQ extension auto-opens post-install page)
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check all pages in context for extension install or signup flows
        const pages = context.pages();
        let targetPage = page;
        
        // Look for extension install or signup pages
        for (const p of pages) {
            const url = p.url();
            if (url.includes('extension_install') || 
                url.includes('signup') || 
                url.includes('app.vidiq.com')) {
                targetPage = p;
                break;
            }
        }

        if (!this.quiet && targetPage !== page) {
            console.log(chalk.cyan(`🔄 Switched to extension page: ${targetPage.url()}`));
        }

        // Perform flow detection on the target page
        return await this.detectFlow(targetPage, requestCaptureSystem, sessionId);
    }
}