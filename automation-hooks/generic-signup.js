/**
 * Generic Signup Automation Hook - Example for other signup forms
 * 
 * This hook can be used as a template for other signup automation workflows
 */

export default {
    name: 'generic-signup-automation',
    description: 'Generic signup form automation workflow',
    
    // URL patterns to match
    urlPatterns: [
        '*signup*',
        '*register*',
        '*sign-up*',
        '*create-account*'
    ],
    
    // Complete automation workflow
    workflow: {
        // Step 1: Wait for autofill to complete
        wait_for_autofill: {
            type: 'wait_for_autofill',
            timeout: 15000,
            checkInterval: 500,
            minFilledFields: 2,
            expectedFields: [
                'input[name="email"]',
                'input[type="email"]',
                '#email',
                '.email',
                'input[name="password"]',
                'input[type="password"]',
                '#password',
                '.password',
                'input[name="firstName"]',
                'input[name="first_name"]',
                '#firstName',
                '#first_name',
                'input[name="lastName"]',
                'input[name="last_name"]',
                '#lastName',
                '#last_name'
            ],
            required: true
        },
        
        // Step 2: Human-like interactions
        human_interactions: {
            type: 'human_interactions',
            interactions: ['random_delay', 'scroll', 'move_mouse'],
            
            delay: {
                min: 1000,
                max: 3000
            },
            
            scroll: {
                count: 1,
                minDelay: 300,
                maxDelay: 800
            },
            
            mouse: {
                count: 1
            },
            
            required: false
        },
        
        // Step 3: Click submit button
        click_submit: {
            type: 'click_submit',
            selectors: [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Sign Up")',
                'button:has-text("Register")',
                'button:has-text("Create Account")',
                'button:has-text("Submit")',
                'button:has-text("Get Started")',
                '.signup-button',
                '.register-button',
                '.submit-btn',
                '#submit',
                '#signup',
                '#register',
                '.btn-primary',
                '.btn-signup',
                '.btn-register'
            ],
            required: true
        },
        
        // Step 4: Monitor for success (generic patterns)
        monitor_success: {
            type: 'monitor_success',
            timeout: 30000,
            successUrls: [
                'dashboard',
                'welcome',
                'profile',
                'success',
                'thank-you',
                'verify',
                'confirm',
                'activate'
            ],
            successStatuses: [200, 201, 302],
            required: false // Optional because success patterns vary widely
        }
    },
    
    // Hook-specific options
    options: {
        maxRetries: 2,
        retryDelay: 3000,
        successAction: 'close_browser',
        failureAction: 'retry'
    }
};