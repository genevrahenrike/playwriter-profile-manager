// VidIQ Autofill Hook Configuration with Dynamic Generation
export default {
    name: 'vidiq-autofill',
    description: 'Autofill VidIQ login and registration forms with dynamic data',
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
        // Primary email fields with dynamic generation
        'input[data-testid="form-input-email"]': {
            value: '{{email}}',
            description: 'Email field for VidIQ forms (dynamic)'
        },
        'input[name="email"]': {
            value: '{{email}}',
            description: 'Generic email field (dynamic)'
        },
        'input[type="email"]': {
            value: '{{email}}',
            description: 'Email input type (dynamic)'
        },
        'input[placeholder*="email" i]': {
            value: '{{email}}',
            description: 'Email field by placeholder (dynamic)'
        },
        
        // Password fields with dynamic generation
        'input[data-testid="form-input-password"]': {
            value: '{{password}}',
            description: 'Password field for VidIQ forms (dynamic)'
        },
        'input[name="password"]': {
            value: '{{password}}',
            description: 'Generic password field (dynamic)'
        },
        'input[type="password"]': {
            value: '{{password}}',
            description: 'Password input type (dynamic)'
        },
        
        // Name fields (if present)
        'input[name="firstName"]': {
            value: '{{firstName}}',
            description: 'First name field (dynamic)'
        },
        'input[name="lastName"]': {
            value: '{{lastName}}',
            description: 'Last name field (dynamic)'
        },
        'input[name="fullName"]': {
            value: '{{fullName}}',
            description: 'Full name field (dynamic)'
        },
        'input[placeholder*="name" i]': {
            value: '{{fullName}}',
            description: 'Name field by placeholder (dynamic)'
        }
    },
    
    // Execution settings optimized for race condition handling
    execution: {
        maxAttempts: 8,           // More attempts for dynamic forms
        pollInterval: 1500,       // Longer polling interval
        waitAfterFill: 600,       // More time for fields to stabilize
        fieldRetries: 3,          // Retries per field
        fieldRetryDelay: 150,     // Delay between field retries
        verifyFill: true,         // Verify field values after filling
        autoSubmit: false         // Never auto-submit for safety
    },
    
    // Custom execution logic (optional)
    async customLogic(page, sessionId, hookSystem, userData) {
        console.log(`🎯 VidIQ custom logic executing for session: ${sessionId}`);
        
        if (userData) {
            console.log(`🎲 Using generated data: ${userData.email}`);
        }
        
        // Check page content for VidIQ-specific elements
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
            
            // Check for additional form fields that might need dynamic data
            const additionalFields = [
                'input[name="username"]',
                'input[placeholder*="username" i]',
                'input[name="displayName"]',
                'input[placeholder*="display name" i]'
            ];
            
            for (const selector of additionalFields) {
                const field = page.locator(selector);
                if (await field.count() > 0) {
                    console.log(`🔍 Found additional field: ${selector}`);
                    if (userData) {
                        try {
                            await field.first().clear();
                            await field.first().fill(userData.fullName);
                            console.log(`✅ Filled additional field with: ${userData.fullName}`);
                        } catch (error) {
                            console.log(`⚠️  Could not fill additional field: ${error.message}`);
                        }
                    }
                }
            }
            
        } catch (error) {
            console.log(`⚠️  Could not analyze VidIQ page: ${error.message}`);
        }
    }
};
