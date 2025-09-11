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
        
        // Custom pattern weights for VidIQ - favor business/professional styles
        patternWeights: {
            concatenated: 3,    // erikmueller2847 - common for creative platforms
            separated: 4,       // erik.mueller.47 - professional look, increased weight
            business: 2,        // j.doe, erik.s - professional, clean
            handle: 1           // larimo, venaro - reduced for this platform
        },
        
        // Custom number flavor weights for VidIQ
        numberFlavorWeights: {
            none: 2,            // Clean professional look
            d2: 3,              // Two digits common for video platforms
            d4: 0.1             // Four digits less common for this use case
        },
        
        // Professional email provider preferences for VidIQ
        emailProviders: [
            // Major providers (higher weight for video platform)
            { domain: 'gmail.com', weight: 35 },
            { domain: 'outlook.com', weight: 15 },
            { domain: 'yahoo.com', weight: 12 },
            { domain: 'hotmail.com', weight: 8 },
            
            // Professional/privacy providers
            { domain: 'protonmail.com', weight: 6 },
            { domain: 'icloud.com', weight: 8 },
            { domain: 'proton.me', weight: 1 }, // Minimal for professional use
            
            // Alternative providers
            { domain: 'tutanota.com', weight: 2 },
            { domain: 'yandex.com', weight: 2 },
            { domain: 'mail.com', weight: 1 },
            { domain: 'zoho.com', weight: 1 },
            { domain: 'fastmail.com', weight: 1 },
            { domain: 'gmx.com', weight: 0.5 },
            { domain: 'mailbox.org', weight: 0.2 }
        ],
        
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
