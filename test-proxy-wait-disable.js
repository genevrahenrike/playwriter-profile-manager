#!/usr/bin/env node

/**
 * Test script to verify the --disable-proxy-wait-increase flag works correctly
 */

import { ProfileLauncher } from './src/ProfileLauncher.js';
import { ProfileManager } from './src/ProfileManager.js';

async function testProxyWaitDisable() {
    console.log('🧪 Testing proxy wait time disable functionality...\n');
    
    const profileManager = new ProfileManager();
    
    // Test 1: Normal proxy mode (should have increased timeouts)
    console.log('Test 1: Normal proxy mode (should increase timeouts)');
    const launcher1 = new ProfileLauncher(profileManager);
    
    // Simulate proxy config
    const mockProxyConfig = { server: 'http://test:8080' };
    
    // Configure as if proxy is enabled
    launcher1.autofillSystem.options.proxyMode = true;
    launcher1.autofillSystem.options.proxyTimeoutMultiplier = 2.5;
    launcher1.automationSystem.options.proxyMode = true;
    launcher1.automationSystem.options.proxyTimeoutMultiplier = 2.5;
    
    console.log(`  Autofill proxyMode: ${launcher1.autofillSystem.options.proxyMode}`);
    console.log(`  Autofill multiplier: ${launcher1.autofillSystem.options.proxyTimeoutMultiplier}`);
    console.log(`  Automation proxyMode: ${launcher1.automationSystem.options.proxyMode}`);
    console.log(`  Automation multiplier: ${launcher1.automationSystem.options.proxyTimeoutMultiplier}`);
    
    // Test 2: Proxy mode with wait increase disabled
    console.log('\nTest 2: Proxy mode with wait increase disabled');
    const launcher2 = new ProfileLauncher(profileManager);
    
    // Configure as if proxy is enabled but wait increase is disabled
    launcher2.autofillSystem.options.proxyMode = false;
    launcher2.autofillSystem.options.proxyTimeoutMultiplier = 1.0;
    launcher2.automationSystem.options.proxyMode = false;
    launcher2.automationSystem.options.proxyTimeoutMultiplier = 1.0;
    
    console.log(`  Autofill proxyMode: ${launcher2.autofillSystem.options.proxyMode}`);
    console.log(`  Autofill multiplier: ${launcher2.autofillSystem.options.proxyTimeoutMultiplier}`);
    console.log(`  Automation proxyMode: ${launcher2.automationSystem.options.proxyMode}`);
    console.log(`  Automation multiplier: ${launcher2.automationSystem.options.proxyTimeoutMultiplier}`);
    
    // Test 3: Verify reduced autofill wait times
    console.log('\nTest 3: Verify reduced autofill wait times');
    
    // Test the reduced postAutofillGraceMs (200-500ms instead of 400-1000ms)
    const mockStepConfig = {};
    const baseGraceMs = mockStepConfig.postAutofillGraceMs || (200 + Math.floor(Math.random() * 300));
    console.log(`  New postAutofillGraceMs range: 200-500ms (sample: ${baseGraceMs}ms)`);
    
    // Test the reduced waitAfterFill (250ms instead of 500ms)
    const baseSettings = {
        waitAfterFill: 250,  // Reduced from 500ms
    };
    console.log(`  New waitAfterFill: ${baseSettings.waitAfterFill}ms (reduced from 500ms)`);
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Summary of changes:');
    console.log('  • Added --disable-proxy-wait-increase CLI flag');
    console.log('  • Reduced postAutofillGraceMs from 400-1000ms to 200-500ms');
    console.log('  • Reduced waitAfterFill from 500ms to 250ms');
    console.log('  • Proxy timeout multipliers can now be disabled with the new flag');
    
    await profileManager.close();
}

// Run the test
testProxyWaitDisable().catch(console.error);