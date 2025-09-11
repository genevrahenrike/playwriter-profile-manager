// Generic Signup Form Autofill Hook - Template for dynamic data generation
export default {
    name: 'generic-signup',
    description: 'Generic signup form autofill with dynamic random data generation',
    enabled: true,
    
    // Enable dynamic data generation
    useDynamicGeneration: true,
    
    // Generation options - customize as needed
    generationOptions: {
        usePrefix: false,       // Set to true for numbered prefixes (01, 02, etc.)
        usePostfix: true,       // Set to false to disable postfix numbers
        
        // Custom pattern weights (uncomment to override defaults)
        // patternWeights: {
        //     concatenated: 4,    // erikmueller2847 - clean firstname+lastname
        //     separated: 2.5,     // erik.mueller.47 - modern professional look  
        //     business: 1.5,      // j.doe, erik.s - professional contexts
        //     handle: 3           // larimo, venaro - distinctive personal style
        // },
        
        // Custom number flavor weights (uncomment to override defaults)
        // numberFlavorWeights: {
        //     none: 4,            // No numbers - clean professional look
        //     d2: 1.5,            // Two digits (10-99)
        //     d4: 0.2             // Four digits (1000-9999)
        // },
        
        // Custom email provider weights (uncomment to override defaults)
        // emailProviders: [
        //     { domain: 'gmail.com', weight: 30 },
        //     { domain: 'yahoo.com', weight: 15 },
        //     { domain: 'outlook.com', weight: 12 },
        //     // ... add more providers as needed
        // ],
        
        password: {
            minLength: 14,      // Minimum password length
            maxLength: 18,      // Maximum password length
            requireUppercase: true,
            requireLowercase: true,
            requireDigits: true,
            requireSymbols: true
        }
    },
    
    // URL patterns - add your target sites here
    urlPatterns: [
        // Example patterns (disabled by default)
        // 'https://example.com/signup',
        // 'https://example.com/register',
        // 'https://*.example.com/auth/*',
        // /https:\/\/.*\.example\.com\/signup/  // Regex pattern
    ],
    
    // Field mappings with dynamic placeholders
    fields: {
        // Email fields - will be populated with generated email
        'input[type="email"]': {
            value: '{{email}}',
            description: 'Email input field (dynamic)'
        },
        'input[name="email"]': {
            value: '{{email}}',
            description: 'Email field by name (dynamic)'
        },
        'input[placeholder*="email" i]': {
            value: '{{email}}',
            description: 'Email field by placeholder text (dynamic)'
        },
        
        // Password fields - will be populated with secure generated password
        'input[type="password"]': {
            value: '{{password}}',
            description: 'Password input field (dynamic)'
        },
        'input[name="password"]': {
            value: '{{password}}',
            description: 'Password field by name (dynamic)'
        },
        'input[name="confirmPassword"]': {
            value: '{{password}}',
            description: 'Password confirmation field (dynamic)'
        },
        'input[name="password_confirmation"]': {
            value: '{{password}}',
            description: 'Password confirmation field alt (dynamic)'
        },
        
        // Name fields - various combinations
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
        'input[name="name"]': {
            value: '{{fullName}}',
            description: 'Generic name field (dynamic)'
        },
        'input[placeholder*="name" i]': {
            value: '{{fullName}}',
            description: 'Name field by placeholder (dynamic)'
        },
        
        // Username fields - use full generated name
        'input[name="username"]': {
            value: '{{fullName}}',
            description: 'Username field (dynamic)'
        },
        'input[name="displayName"]': {
            value: '{{fullName}}',
            description: 'Display name field (dynamic)'
        },
        
        // Function-based dynamic values for complex scenarios
        'input[name="referralCode"]': {
            value: (userData) => {
                // Generate a referral code based on the user data
                return `REF${userData.fullName.substring(0, 4).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
            },
            description: 'Referral code field (function-based dynamic)'
        }
    },
    
    // Execution settings
    execution: {
        maxAttempts: 8,         // More attempts for generic forms
        pollInterval: 1500,     // Slightly longer polling interval
        waitAfterFill: 300,     // Wait after filling fields
        autoSubmit: false       // Never auto-submit for safety
    },
    
    // Custom execution logic
    async customLogic(page, sessionId, hookSystem, userData) {
        console.log(`🎯 Generic signup custom logic executing for session: ${sessionId}`);
        
        if (userData) {
            console.log(`🎲 Generated user data:`);
            console.log(`   Name: ${userData.firstName} ${userData.lastName}`);
            console.log(`   Full: ${userData.fullName}`);
            console.log(`   Email: ${userData.email}`);
            console.log(`   Provider: ${userData.emailProvider}`);
        }
        
        try {
            // Look for common signup indicators
            const signupIndicators = [
                'sign up', 'signup', 'register', 'create account', 'join',
                'get started', 'start free', 'free trial'
            ];
            
            const pageText = await page.textContent('body');
            const foundIndicators = signupIndicators.filter(indicator => 
                pageText.toLowerCase().includes(indicator)
            );
            
            if (foundIndicators.length > 0) {
                console.log(`✅ Signup page confirmed. Found indicators: ${foundIndicators.join(', ')}`);
            }
            
            // Look for terms of service or privacy policy checkboxes
            const checkboxSelectors = [
                'input[type="checkbox"]',
                'input[name*="terms"]',
                'input[name*="privacy"]',
                'input[name*="agree"]',
                'input[name*="accept"]'
            ];
            
            for (const selector of checkboxSelectors) {
                const checkboxes = await page.locator(selector).all();
                for (const checkbox of checkboxes) {
                    try {
                        const isChecked = await checkbox.isChecked();
                        if (!isChecked) {
                            const label = await checkbox.getAttribute('aria-label') || 
                                         await checkbox.getAttribute('name') || 
                                         'Unknown checkbox';
                            console.log(`☑️  Checking checkbox: ${label}`);
                            await checkbox.check();
                        }
                    } catch (error) {
                        console.log(`⚠️  Could not interact with checkbox: ${error.message}`);
                    }
                }
            }
            
            // Look for additional fields that might need attention
            const additionalSelectors = [
                'input[name="company"]',
                'input[name="phone"]',
                'input[name="website"]',
                'select[name="country"]',
                'select[name="industry"]'
            ];
            
            for (const selector of additionalSelectors) {
                const field = page.locator(selector);
                if (await field.count() > 0) {
                    console.log(`🔍 Found additional field: ${selector}`);
                    
                    // Handle different field types
                    const tagName = await field.first().evaluate(el => el.tagName.toLowerCase());
                    
                    if (tagName === 'select') {
                        // For select fields, choose the first non-empty option
                        try {
                            const options = await field.first().locator('option').all();
                            if (options.length > 1) {
                                await field.first().selectOption({ index: 1 }); // Skip first (usually empty)
                                console.log(`✅ Selected option in ${selector}`);
                            }
                        } catch (error) {
                            console.log(`⚠️  Could not select option: ${error.message}`);
                        }
                    } else if (selector.includes('company') && userData) {
                        // Generate a company name
                        const companyName = `${userData.firstName} ${userData.lastName} LLC`;
                        try {
                            await field.first().fill(companyName);
                            console.log(`✅ Filled company field: ${companyName}`);
                        } catch (error) {
                            console.log(`⚠️  Could not fill company field: ${error.message}`);
                        }
                    } else if (selector.includes('phone')) {
                        // Generate a fake phone number
                        const phoneNumber = `+1-555-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`;
                        try {
                            await field.first().fill(phoneNumber);
                            console.log(`✅ Filled phone field: ${phoneNumber}`);
                        } catch (error) {
                            console.log(`⚠️  Could not fill phone field: ${error.message}`);
                        }
                    }
                }
            }
            
        } catch (error) {
            console.log(`⚠️  Error in generic signup custom logic: ${error.message}`);
        }
    }
};
