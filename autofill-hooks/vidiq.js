// VidIQ Autofill Hook Configuration with Dynamic Generation
export default {
    name: 'vidiq-autofill',
    description: 'Autofill VidIQ login with reliable selectors (email + password only)',
    enabled: true,
    
    // Enable dynamic data generation
    useDynamicGeneration: true,
    
    // Generation options
    generationOptions: {
        usePrefix: false,      // No prefix for cleaner names
        usePostfix: true,      // Use postfix for uniqueness
        password: {
            minLength: 12,
            maxLength: 16,
            requireUppercase: true,
            requireLowercase: true,
            requireDigits: true,
            requireSymbols: true
        }
    },
    
    // URL patterns to match (supports regex)
    urlPatterns: [
        'https://app.vidiq.com/extension_install',
        'https://app.vidiq.com/login',
        'https://app.vidiq.com/register',
        'https://app.vidiq.com/signup',
        'https://app.vidiq.com/auth/signup'
    ],
    
    // Field mappings with dynamic values
    fields: {
        // Prefer VidIQ-specific selectors, but keep standard fallbacks
        'input[data-testid="form-input-email"]': {
            value: '{{email}}',
            description: 'Email field (VidIQ)'
        },
        'input[name="email"]': {
            value: '{{email}}',
            description: 'Email field (name)'
        },
        'input[type="email"]': {
            value: '{{email}}',
            description: 'Email field (type)'
        },
        'input[placeholder*="email" i]': {
            value: '{{email}}',
            description: 'Email field (placeholder fallback)'
        },
        'input[data-testid="form-input-password"]': {
            value: '{{password}}',
            description: 'Password field (VidIQ)'
        },
        'input[name="password"]': {
            value: '{{password}}',
            description: 'Password field (name)'
        },
        'input[type="password"]': {
            value: '{{password}}',
            description: 'Password field (type)'
        },
        'input[placeholder*="password" i]': {
            value: '{{password}}',
            description: 'Password field (placeholder fallback)'
        }
    },
    
    // Execution settings optimized for race condition handling
    execution: {
    maxAttempts: 8,         // More attempts for dynamic forms
    pollInterval: 1500,     // Longer polling interval
    waitAfterFill: 800,     // More time for fields to stabilize
    fieldRetries: 4,        // Increased retries per field
    fieldRetryDelay: 200,   // Slightly longer delay between field retries
        verifyFill: true,       // Verify field values after filling
        autoSubmit: false,      // Never auto-submit

        // Race condition prevention
        stabilityChecks: 3,
        stabilityDelay: 300,
        minFieldsForSuccess: 2,

        // Sequential fill remains to avoid churn
        fillSequentially: true,
        sequentialDelay: 400
    },
    
    // Custom execution logic (optional)
    async customLogic(page, sessionId, hookSystem, userData) {
        console.log(`🎯 VidIQ custom logic executing for session: ${sessionId}`);
        
        if (userData) {
            console.log(`🎲 Using generated data: ${userData.email}`);
        }
        
        // Check page content for VidIQ-specific elements (non-blocking)
        try {
            const pageContent = await page.textContent('body');
            if (pageContent && pageContent.includes('extension')) {
                console.log(`✅ Confirmed: VidIQ extension page detected`);
            }
            
            // Look for install buttons
            const installButton = await page.locator('text=/install|add to chrome|get extension/i').first();
            if (await installButton.count() > 0) {
                console.log(`🎯 Found extension install button`);
            }
            
            // Look for submit buttons (don't click, just detect)
            const submitButton = await page.locator('button[type="submit"], button[data-testid="signup-button"]').first();
            if (await submitButton.count() > 0) {
                const buttonText = await submitButton.textContent();
                console.log(`🔘 Found submit button: "${buttonText}" (not clicking for safety)`);
            }
            
            // Do not probe or fill optional/unknown fields to avoid noise
            
        } catch (error) {
            console.log(`⚠️  Could not analyze VidIQ page: ${error.message}`);
        }
    }
};
