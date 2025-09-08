#!/usr/bin/env node

/**
 * Stealth Features Example
 * 
 * This example demonstrates how to use the enhanced stealth features
 * in the Playwright Profile Manager.
 */

import { createProfileSystem } from '../src/index.js';
import { StealthManager } from '../src/StealthManager.js';
import { FingerprintTester } from '../src/FingerprintTester.js';

async function stealthExample() {
    console.log('🛡️  Playwright Profile Manager - Stealth Features Example\n');
    
    // Create profile system
    const system = createProfileSystem('./example-profiles');
    
    try {
        // Create a test profile
        console.log('📝 Creating test profile...');
        const profile = await system.createProfile('stealth-test', {
            description: 'Testing stealth features',
            browserType: 'chromium'
        });
        console.log('✅ Profile created:', profile.name);
        
        // Example 1: Launch with default balanced stealth
        console.log('\n🚀 Example 1: Launch with balanced stealth preset');
        const result1 = await system.launchProfile('stealth-test', {
            stealth: true,
            stealthPreset: 'balanced',
            testFingerprint: true
        });
        
        console.log('✅ Browser launched with stealth features');
        console.log('🧪 Fingerprint test completed');
        
        // Navigate to a test site
        await result1.page.goto('https://example.com');
        console.log('🌐 Navigated to example.com');
        
        // Close this session
        await system.profileLauncher.closeBrowser(result1.sessionId);
        console.log('🔒 Browser session closed');
        
        // Example 2: Launch with maximum stealth
        console.log('\n🚀 Example 2: Launch with maximum stealth preset');
        const result2 = await system.launchProfile('stealth-test', {
            stealth: true,
            stealthPreset: 'maximum'
        });
        
        // Test fingerprint manually
        console.log('🧪 Running comprehensive fingerprint test...');
        const fingerprintResults = await system.profileLauncher.testFingerprint(result2.sessionId, {
            includeMultipleSites: false,
            saveResults: true
        });
        
        // Close this session
        await system.profileLauncher.closeBrowser(result2.sessionId);
        console.log('🔒 Browser session closed');
        
        // Example 3: Custom stealth configuration
        console.log('\n🚀 Example 3: Custom stealth configuration');
        const stealthManager = new StealthManager();
        const customConfig = stealthManager.createPreset('balanced');
        
        // Customize the configuration
        customConfig.webgl.vendor = 'Custom Vendor Inc.';
        customConfig.webgl.renderer = 'Custom GPU Renderer';
        customConfig.screen.width = 1366;
        customConfig.screen.height = 768;
        customConfig.hardwareConcurrency.cores = 4;
        customConfig.memory.deviceMemory = 4;
        
        const result3 = await system.launchProfile('stealth-test', {
            stealth: true,
            stealthConfig: customConfig
        });
        
        // Test the custom configuration
        console.log('🧪 Testing custom stealth configuration...');
        const customTest = await system.profileLauncher.testFingerprint(result3.sessionId);
        
        console.log('📊 Custom configuration fingerprint results:');
        console.log(`   WebGL Vendor: ${customTest.tests.custom.webgl.vendor}`);
        console.log(`   WebGL Renderer: ${customTest.tests.custom.webgl.renderer}`);
        console.log(`   Screen: ${customTest.tests.custom.screen.width}x${customTest.tests.custom.screen.height}`);
        console.log(`   Hardware Cores: ${customTest.tests.custom.navigator.hardwareConcurrency}`);
        
        // Close this session
        await system.profileLauncher.closeBrowser(result3.sessionId);
        console.log('🔒 Browser session closed');
        
        // Example 4: Fingerprint comparison
        console.log('\n🚀 Example 4: Fingerprint comparison');
        
        // Launch two sessions with different configurations
        const session1 = await system.launchProfile('stealth-test', {
            stealth: true,
            stealthPreset: 'minimal'
        });
        
        const session2 = await system.launchProfile('stealth-test', {
            stealth: true,
            stealthPreset: 'maximum'
        });
        
        // Compare their fingerprints
        console.log('🔍 Comparing fingerprints between minimal and maximum presets...');
        const comparison = await system.profileLauncher.compareFingerprints(
            session1.sessionId,
            session2.sessionId
        );
        
        console.log(`📊 Similarity Score: ${comparison.score}%`);
        console.log(`📊 Differences found: ${comparison.differences.length}`);
        
        // Close both sessions
        await system.profileLauncher.closeBrowser(session1.sessionId);
        await system.profileLauncher.closeBrowser(session2.sessionId);
        console.log('🔒 All browser sessions closed');
        
        // Example 5: Save and load stealth configurations
        console.log('\n🚀 Example 5: Save and load stealth configurations');
        
        // Save the custom config to the profile
        await system.profileLauncher.saveStealthConfig(profile.id, customConfig);
        console.log('💾 Custom stealth config saved to profile');
        
        // Load it back
        const loadedConfig = await system.profileLauncher.loadStealthConfig(profile.id);
        console.log('📂 Stealth config loaded from profile');
        console.log(`   WebGL Vendor: ${loadedConfig.webgl.vendor}`);
        
        // Example 6: Test with MixVisit integration
        console.log('\n🚀 Example 6: MixVisit fingerprinting test');
        
        const mixvisitSession = await system.launchProfile('stealth-test', {
            stealth: true,
            stealthPreset: 'balanced'
        });
        
        const fingerprintTester = new FingerprintTester();
        const mixvisitResult = await fingerprintTester.testWithMixVisit(mixvisitSession.page);
        
        if (mixvisitResult.error) {
            console.log('⚠️  MixVisit test failed:', mixvisitResult.error);
        } else {
            console.log('✅ MixVisit test completed');
            console.log(`   Load Time: ${mixvisitResult.loadTime}ms`);
            console.log(`   Fingerprint Hash: ${mixvisitResult.fingerprintHash}`);
        }
        
        await system.profileLauncher.closeBrowser(mixvisitSession.sessionId);
        console.log('🔒 MixVisit test session closed');
        
        console.log('\n🎉 All stealth examples completed successfully!');
        console.log('\n📋 Summary of demonstrated features:');
        console.log('   ✅ Stealth presets (minimal, balanced, maximum)');
        console.log('   ✅ Custom stealth configurations');
        console.log('   ✅ Fingerprint testing and analysis');
        console.log('   ✅ Fingerprint comparison');
        console.log('   ✅ Configuration persistence');
        console.log('   ✅ MixVisit integration');
        
        console.log('\n🔧 Try the CLI commands:');
        console.log('   ppm-stealth stealth-launch stealth-test --preset maximum --test-fingerprint');
        console.log('   ppm-stealth test-fingerprint');
        console.log('   ppm-stealth stealth-config --profile stealth-test --show');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        // Cleanup
        await system.cleanup();
        console.log('\n🧹 Cleanup completed');
    }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
    stealthExample().catch(console.error);
}

export { stealthExample };
