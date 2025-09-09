// VidIQ Autofill Hook Configuration
export default {
    name: 'vidiq-autofill',
    description: 'Autofill VidIQ login and registration forms',
    enabled: true,
    
    // URL patterns to match (supports regex)
    urlPatterns: [
        'https://app.vidiq.com/extension_install',
        'https://app.vidiq.com/login',
        'https://app.vidiq.com/register',
        'https://app.vidiq.com/signup'
    ],
    
    // Field mappings and values
    fields: {
        'input[data-testid="form-input-email"]': {
            value: 'test.automation@example.com',
            description: 'Email field for VidIQ forms'
        },
        'input[data-testid="form-input-password"]': {
            value: 'TestPass123!',
            description: 'Password field for VidIQ forms'
        },
        'input[name="email"]': {
            value: 'test.automation@example.com',
            description: 'Generic email field'
        },
        'input[type="email"]': {
            value: 'test.automation@example.com',
            description: 'Email input type'
        }
    },
    
    // Execution settings
    execution: {
        maxAttempts: 5,
        pollInterval: 1000,
        waitAfterFill: 200,
        autoSubmit: false
    },
    
    // Custom execution logic (optional)
    async customLogic(page, sessionId, hookSystem) {
        console.log(`🎯 VidIQ custom logic executing for session: ${sessionId}`);
        
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
        } catch (error) {
            console.log(`⚠️  Could not analyze VidIQ page: ${error.message}`);
        }
    }
};
