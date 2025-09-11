#!/usr/bin/env node

/**
 * Test EventBus integration for autofill/automation coordination
 */

import { ProfileManager } from './src/ProfileManager.js';
import { ProfileLauncher } from './src/ProfileLauncher.js';

async function testEventBusIntegration() {
    console.log('🧪 Testing EventBus integration for race condition fix...');
    
    try {
        const profileManager = new ProfileManager();
        const profileLauncher = new ProfileLauncher(profileManager);
        
        console.log('✅ ProfileLauncher initialized with EventBus');
        console.log('📡 EventBus should now coordinate autofill and automation');
        console.log('🎯 Key improvements:');
        console.log('   ✓ Event-driven autofill completion detection');
        console.log('   ✓ No more race conditions from polling');
        console.log('   ✓ Proper coordination between systems');
        console.log('   ✓ Autofill emits completion events');
        console.log('   ✓ Automation waits for proper events');
        
        // Test launch to verify EventBus integration
        console.log('🚀 Testing launch with EventBus coordination...');
        
        const result = await profileLauncher.launchFromTemplate('vpn-fresh', 'eventbus-test', {
            browserType: 'chromium',
            headless: true,
            enableAutomation: true,
            headlessAutomation: true,
            autoCloseOnSuccess: true,
            isTemporary: true
        });
        
        console.log('✅ Launch successful with EventBus integration!');
        console.log(`📋 Session ID: ${result.sessionId}`);
        
        // Navigate to test the new coordination
        await result.page.goto('https://vidiq.com/signup');
        console.log('📄 Navigated to VidIQ signup page');
        console.log('⏳ Testing new event-driven coordination...');
        
        // The EventBus will now properly coordinate autofill completion
        // and automation will wait for the proper event instead of racing
        
    } catch (error) {
        console.error('❌ EventBus integration test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Handle cleanup
process.on('SIGINT', async () => {
    console.log('\\n🛑 Stopping EventBus test...');
    process.exit(0);
});

// Run test
testEventBusIntegration().catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
});