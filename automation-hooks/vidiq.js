/**
 * VidIQ Automation Hook - Complete automated signup flow
 * 
 * This hook handles the complete VidIQ signup process:
 * 1. Wait for autofill to complete
 * 2. Perform human-like interactions (scrolling, mouse movement)
 * 3. Click submit button
 * 4. Monitor for success response (https://api.vidiq.com/subscriptions/active)
 * 5. Close browser when success is detected
 */

export default {
    name: 'vidiq-automation',
    description: 'Complete VidIQ signup automation workflow',
    
    // URL patterns to match
    urlPatterns: [
        'https://vidiq.com/signup*',
        'https://www.vidiq.com/signup*',
        'https://app.vidiq.com/signup*',
        '*vidiq.com*signup*',
        // Extension install/login-success flows are valid entry points
        'https://app.vidiq.com/extension_install*',
        '*vidiq.com*extension_install*',
        '*vidiq.com*extension_login_success*'
    ],
    
    // Complete automation workflow
    workflow: {
        // Step 1: Wait for autofill to complete
        wait_for_autofill: {
            type: 'wait_for_autofill',
            timeout: 20000, // Increased timeout for complete form filling
            checkInterval: 500, // Check every 500ms
            minFilledFields: 2, // Minimum fields for basic completion
            requiredCriticalFields: 2, // Both email AND password must be filled
            // Allow bypass when page has no fields (extension_install/login_success)
            allowProceedWithoutFields: true,
            bypassAfterAttempts: 3,
            // Increased grace period for form stability
            postAutofillGraceMs: 1200,
            // Critical fields that MUST be filled (email + password)
            criticalFields: [
                'input[data-testid="form-input-email"]',
                'input[name="email"]',
                'input[type="email"]'
            ],
            criticalFieldsPassword: [
                'input[data-testid="form-input-password"]',
                'input[name="password"]',
                'input[type="password"]'
            ],
            // All expected fields for comprehensive detection
            expectedFields: [
                'input[data-testid="form-input-email"]',
                'input[name="email"]',
                'input[type="email"]',
                'input[data-testid="form-input-password"]',
                'input[name="password"]',
                'input[type="password"]',
                'input[name="firstName"]',
                'input[name="first_name"]',
                '#firstName',
                '#first_name'
            ],
            // Ensure autofill system has actually completed its work
            waitForAutofillSystemCompletion: true,
            required: false
        },

        // Step 2: Automation-owned fill (active only when Autofill system is disabled)
        automation_fill: {
            type: 'automation_fill',
            onlyWhenAutofillDisabled: true,
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
            required: false
        },
        
        // Step 2: Perform human-like interactions
        human_interactions: {
            type: 'human_interactions',
            interactions: ['random_delay', 'scroll', 'move_mouse'],
            
            // Longer delay to ensure form is fully stable
            delay: {
                min: 1200,  // Increased minimum delay
                max: 2500   // Increased maximum delay
            },
            
            // Gentler scrolling to avoid field focus issues
            scroll: {
                count: 1, // Reduced scroll actions
                minDelay: 300,
                maxDelay: 800,
                gentle: true // Add gentle scrolling flag
            },
            
            // Minimal mouse movement to avoid field interference
            mouse: {
                count: 1,
                avoidFormFields: true // Avoid moving over form fields
            },
            
            // Remove hover interactions to prevent field interference
            // hover: {
            //     selectors: ['input', 'button', 'label'],
            //     count: 1
            // },
            
            required: false // Optional step
        },
        
        // Step 3: Click submit button
        click_submit: {
            type: 'click_submit',
            selectors: [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Sign Up")',
                'button:has-text("Create Account")',
                'button:has-text("Get Started")',
                'button:has-text("Submit")',
                '.signup-button',
                '.submit-btn',
                '#submit',
                '#signup-submit',
                '[data-testid="signup-submit"]',
                '.btn-primary',
                '.btn-signup',
                // Additional generic actions for extension install/success flows
                'button:has-text("Continue")',
                'a:has-text("Continue")',
                'button:has-text("Next")',
                '[data-testid*="continue"]',
                '#continue'
            ],
            // Enhanced verification to ensure both email AND password are filled and stable
            verifySelectors: [
                'input[data-testid="form-input-email"]',
                'input[name="email"]',
                'input[type="email"]',
                'input[data-testid="form-input-password"]',
                'input[name="password"]',
                'input[type="password"]'
            ],
            // Require both email AND password to have values
            requireAllVerifySelectors: true,
            verifyStabilityTries: 8, // More verification attempts
            verifyStabilityDelayMs: 300, // Longer delay between checks
            // Pause autofill monitoring right before clicking to avoid races
            pauseAutofill: true,
            // Disable pre-click jitter/hover to avoid noise around submission
            noPreJitter: true,
            // Additional pre-submit validation
            preSubmitValidation: {
                checkEmailField: true,
                checkPasswordField: true,
                minPasswordLength: 8
            },
            screenshotAfterClick: true,
            // Some flows (extension_install/login_success) require no submit; make optional
            required: false
        },
        
        // Step 4: Guard against stuck extension success redirects
        custom_script: {
            type: 'custom_script',
            script: async (page, sessionId, hook, system) => {
                try {
                    const url = page.url() || '';
                    const isExtFlow = /extension_install|extension_login_success/.test(url);
                    if (!isExtFlow) return;
                    // Small wait allows backend to complete; system-level watchdog will also run
                    await page.waitForTimeout(3000);
                    const cur = page.url() || '';
                    if (/extension_login_success/.test(cur)) {
                        // If still on success page, nudge to dashboard proactively
                        try { await page.goto('https://app.vidiq.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (_) {}
                    }
                } catch (_) {}
            },
            required: false
        },

        // Step 4.5: Detect and mitigate CAPTCHA
        detect_captcha: {
            type: 'detect_captcha',
            // The red error container and recaptcha area (excluding recaptcha-tos which is just legal notice)
            detectSelectors: [
                'p[data-testid="authentication-error"]',
                '[data-testid="authentication-error"]',
                'iframe[src*="recaptcha"]',
                'div.g-recaptcha',
                'iframe[src*="hcaptcha"]',
                'div.h-captcha'
            ],
            submitSelectors: [
                'button[type="submit"]',
                'input[type="submit"]',
                'button[data-testid="signup-button"]',
                '.submit-btn',
                '#submit'
            ],
            jitterAttempts: 2,
            reloadOnFail: true,
            maxRetryAttempts: 2, // Maximum number of overall retry attempts before giving up
            required: false
        },

        // Step 5: Monitor for success response
        monitor_success: {
            type: 'monitor_success',
            timeout: 45000,
            successUrls: [
                'api.vidiq.com/subscriptions/active',
                'api.vidiq.com/subscriptions/stripe/next-subscription',
                'api.vidiq.com/user/profile',
                'api.vidiq.com/auth/verify',
                // also consider app redirect completion endpoint seen in logs
                'app.vidiq.com/extension_login_success'
            ],
            successStatuses: [200, 201],
            required: true
        }
    },
    
    // Hook-specific options
    options: {
        maxRetries: 3,
        retryDelay: 5000,
        successAction: 'close_browser', // What to do on success
        failureAction: 'retry' // What to do on failure
    }
};