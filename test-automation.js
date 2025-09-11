#!/usr/bin/env node

/**
 * Test automation script - Run headless automation for VidIQ signup
 * This script demonstrates the complete headless automation workflow
 */

import { ProfileManager } from './src/ProfileManager.js';
import { ProfileLauncher } from './src/ProfileLauncher.js';

async function runAutomationTest() {
    console.log('🤖 Starting headless automation test...');
    
    const profileManager = new ProfileManager();
    const profileLauncher = new ProfileLauncher(profileManager);
    
    try {
        // Launch with headless automation
        console.log('🚀 Launching headless automation...');
        const result = await profileLauncher.launchFromTemplate('vpn-fresh', 'automation-test', {
            browserType: 'chromium',
            headless: true,
            enableAutomation: true,
            enableRequestCapture: true,
            headlessAutomation: true,
            autoCloseOnSuccess: true,
            isTemporary: true // Clean up after test
        });
        
        console.log('✅ Automation launched successfully!');
        console.log(`Session ID: ${result.sessionId}`);
        console.log('🎯 Automation will now:');
        console.log('   1. Wait for autofill to complete');
        console.log('   2. Perform human-like interactions');
        console.log('   3. Click submit button');
        console.log('   4. Monitor for success response');
        console.log('   5. Auto-close browser on success');
        
        // Navigate to VidIQ signup page
        await result.page.goto('https://vidiq.com/signup');
        
        console.log('📄 Navigated to VidIQ signup page');
        console.log('⏳ Waiting for automation to complete...');
        
        // The automation system will handle the rest automatically
        // including closing the browser when success is detected
        
    } catch (error) {
        console.error('❌ Automation test failed:', error.message);
        process.exit(1);
    }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping automation test...');
    process.exit(0);
});

// Run the test
runAutomationTest().catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
});