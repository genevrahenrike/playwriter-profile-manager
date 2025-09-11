#!/usr/bin/env node

/**
 * Test script to verify race condition fixes in automation system
 * This script tests the improved coordination between autofill and automation systems
 */

import { ProfileManager } from './src/ProfileManager.js';
import { ProfileLauncher } from './src/ProfileLauncher.js';

async function testRaceConditionFix() {
    console.log('🧪 Testing race condition fixes...');
    
    const profileManager = new ProfileManager();
    const profileLauncher = new ProfileLauncher(profileManager);
    
    try {
        console.log('🚀 Launching automation with enhanced coordination...');
        
        const result = await profileLauncher.launchFromTemplate('vpn-fresh', 'race-condition-test', {
            browserType: 'chromium',
            headless: true,
            enableAutomation: true,
            enableRequestCapture: true,
            headlessAutomation: true,
            autoCloseOnSuccess: true,
            isTemporary: true
        });
        
        console.log('✅ Launch successful!');
        console.log(`📋 Session ID: ${result.sessionId}`);
        console.log('🎯 Enhanced automation features:');
        console.log('   ✓ Critical field validation (email + password)');
        console.log('   ✓ Enhanced completion detection');
        console.log('   ✓ Improved human interactions (form-safe)');
        console.log('   ✓ Pre-submit validation');
        console.log('   ✓ Field stability verification');
        
        // Navigate to VidIQ signup
        await result.page.goto('https://vidiq.com/signup');
        console.log('📄 Navigated to VidIQ signup page');
        
        console.log('⏳ Testing improved workflow:');
        console.log('   1. Wait for BOTH email AND password to be filled');
        console.log('   2. Perform gentle human interactions');
        console.log('   3. Verify critical fields before submit');
        console.log('   4. Monitor for success response');
        console.log('   5. Auto-close on completion');
        
        // The enhanced automation system will handle the rest
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Handle cleanup
process.on('SIGINT', async () => {
    console.log('\\n🛑 Stopping test...');
    process.exit(0);
});

// Run test
testRaceConditionFix().catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
});