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
            business: 3.5,      // j.doe, erik.s - increased for more professional business emails
            handle: 1           // larimo, venaro - reduced for this platform
        },
        
        // Custom number flavor weights for VidIQ
        numberFlavorWeights: {
            none: 2,            // Clean professional look
            d2: 3,              // Two digits common for video platforms
            d4: 0.1             // Four digits less common for this use case
        },
        
        // Business format weights - make super short aliases very rare
        businessFormatWeights: {
            full: 1,            // firstname.lastname style
            alias: 1            // various alias styles
        },
        
        // Control business alias patterns - make super short ones very rare
        businessAliasPatterns: null, // Use default patterns with weighted selection
        
        // Professional email provider preferences for VidIQ
        emailProviders: [
            // Major providers (higher weight for video platform)
            { domain: 'gmail.com', weight: 35 },
            { domain: 'outlook.com', weight: 15 },
            { domain: 'yahoo.com', weight: 6 },
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
        'https://app.vidiq.com/auth/login',
        'https://app.vidiq.com/register',
        'https://app.vidiq.com/signup',
        'https://app.vidiq.com/auth/signup'
    ],
    
    // Field mappings with dynamic values - Both steps
    fields: {
        // Step 1: Email field (always visible)
        'input[type="email"]': {
            value: '{{email}}',
            description: 'Email field (step 1)',
            priority: 1
        },
        'input[data-testid="form-input-email"]': {
            value: '{{email}}',
            description: 'Email field (VidIQ step 1)',
            priority: 1
        },
        'input[name="email"]': {
            value: '{{email}}',
            description: 'Email field (name step 1)',
            priority: 1
        },
        'input[placeholder*="email" i]': {
            value: '{{email}}',
            description: 'Email field (placeholder fallback step 1)',
            priority: 1
        },
        // Step 2: Password fields (appear after step 1 submission)
        'input[type="password"]': {
            value: '{{password}}',
            description: 'Password field (step 2)',
            priority: 2
        },
        'input[id="password"]': {
            value: '{{password}}',
            description: 'Password field by ID (step 2)',
            priority: 2
        },
        'input[data-testid="form-input-password"]': {
            value: '{{password}}',
            description: 'Password field (VidIQ step 2)',
            priority: 2
        },
        'input[name="password"]': {
            value: '{{password}}',
            description: 'Password field (name step 2)',
            priority: 2
        },
        'input[placeholder*="password" i]': {
            value: '{{password}}',
            description: 'Password field (placeholder step 2)',
            priority: 2
        }
    },
    
    // Execution settings optimized for two-step login flow
    execution: {
        maxAttempts: 15,        // More attempts for multi-step dynamic forms
        pollInterval: 1200,     // Slightly faster polling for dynamic forms
        waitAfterFill: 1500,    // More time for step 2 to appear after step 1 submission
        fieldRetries: 4,        // Increased retries per field
        fieldRetryDelay: 200,   // Slightly longer delay between field retries
        verifyFill: true,       // Verify field values after filling
        autoSubmit: true,       // Enable form submission for both steps
        
        // Two-step flow: prevent early completion
        requireBothEmailAndPassword: true, // Custom flag to force waiting for both fields
        
        // Race condition prevention
        stabilityChecks: 3,
        stabilityDelay: 400,
        minFieldsForSuccess: 2, // Need both email AND password for true success
        
        // Sequential fill remains to avoid churn
        fillSequentially: true,
        sequentialDelay: 400
    },
    
    // Custom execution logic for VidIQ two-step login/signup flow
    async customLogic(page, sessionId, hookSystem, userData) {
        console.log(`🎯 VidIQ custom logic executing for session: ${sessionId}`);
        
        if (userData) {
            console.log(`🎲 Using ${userData.mode || 'generated'} data: ${userData.email}`);
        }
        
        // Wait a bit for dynamic content to load
        await page.waitForTimeout(500);
        
        // Detect current step state
        const emailField = page.locator('input[type="email"]').first();
        const passwordField = page.locator('input[type="password"], input[id="password"]').first();
        const emailCount = await emailField.count();
        const passwordCount = await passwordField.count();
        
        console.log(`🔍 Form analysis: email fields=${emailCount}, password fields=${passwordCount}`);
        
        // Check if email field has value (indicates we're past step 1)
        let emailFilled = false;
        if (emailCount > 0) {
            try {
                const emailValue = await emailField.inputValue();
                emailFilled = emailValue && emailValue.length > 0;
                console.log(`📧 Email field status: filled=${emailFilled} (value: "${emailValue || 'empty'}")`);
            } catch (e) {
                console.log(`⚠️  Could not check email value: ${e.message}`);
            }
        }
        
        if (emailCount > 0 && passwordCount === 0 && !emailFilled) {
            console.log(`📧 Step 1 detected: Email-only form (empty)`);
            return { step: 1, needsEmail: true, continueMonitoring: true };
            
        } else if (emailCount > 0 && passwordCount === 0 && emailFilled) {
            console.log(`⏳ Transition state: Email filled, waiting for step 2...`);
            
            // Try clicking continue button if it exists and wasn't clicked yet
            const continueBtn = page.locator('button:has-text("Continue with email"), button[type="submit"]').first();
            if (await continueBtn.count() > 0) {
                try {
                    const isEnabled = await continueBtn.isEnabled();
                    if (isEnabled) {
                        await continueBtn.click();
                        console.log(`� Clicked continue button, waiting for step 2...`);
                        await page.waitForTimeout(2000); // Wait for step 2 to appear
                    }
                } catch (e) {
                    console.log(`⚠️  Continue button click failed: ${e.message}`);
                }
            }
            
            return { step: 'transition', continueMonitoring: true };
            
        } else if (passwordCount > 0) {
            console.log(`🔐 Step 2 detected: Password form visible`);
            
            // Fill password if it's empty and we have the data
            if (userData && userData.password) {
                try {
                    const currentValue = await passwordField.inputValue();
                    if (!currentValue) {
                        await passwordField.fill(userData.password);
                        console.log(`✅ Password filled in step 2`);
                        
                        // Look for final submit button
                        const finalSubmitBtn = page.locator('button[type="submit"]:visible').first();
                        if (await finalSubmitBtn.count() > 0) {
                            const buttonText = await finalSubmitBtn.textContent().catch(() => 'Submit');
                            console.log(`🔘 Found final submit button: "${buttonText}"`);
                            
                            if (userData.submitForm) {
                                await finalSubmitBtn.click();
                                console.log(`🚀 Final form submitted`);
                            }
                        }
                    } else {
                        console.log(`ℹ️  Password field already filled`);
                    }
                } catch (error) {
                    console.log(`⚠️  Step 2 password fill error: ${error.message}`);
                }
            }
            
            return { step: 2, completed: true };
        }
        
        console.log(`❓ Unknown form state - will continue monitoring...`);
        return { step: 'unknown', continueMonitoring: true };
    }
};
