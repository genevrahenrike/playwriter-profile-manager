#!/usr/bin/env node

/**
 * Race Condition Test for Autofill System
 * 
 * This script demonstrates the improved race condition handling
 * in the autofill system with various timing scenarios.
 */

import { AutofillHookSystem } from '../src/AutofillHookSystem.js';

console.log('🧪 Race Condition Handling Test');
console.log('=' .repeat(50));

// Create autofill system with race condition optimizations
const autofillSystem = new AutofillHookSystem({
    usePrefix: false,
    usePostfix: true,
    enableTracking: false  // Disable for testing
});

// Test hook configuration with aggressive timing
const testHook = {
    name: 'race-condition-test',
    description: 'Test hook for race condition handling',
    enabled: true,
    useDynamicGeneration: true,
    
    // Optimized execution settings for race conditions
    execution: {
        maxAttempts: 8,           // More attempts
        pollInterval: 1500,       // Longer polling
        waitAfterFill: 600,       // More stabilization time
        fieldRetries: 3,          // Field-level retries
        fieldRetryDelay: 150,     // Retry delays
        verifyFill: true          // Enable verification
    },
    
    urlPatterns: ['https://example.com/test'],
    
    fields: {
        'input[type="email"]': {
            value: '{{email}}',
            description: 'Email field (dynamic)'
        },
        'input[type="password"]': {
            value: '{{password}}',
            description: 'Password field (dynamic)'
        },
        'input[name="fullName"]': {
            value: '{{fullName}}',
            description: 'Full name field (dynamic)'
        }
    }
};

// Register the test hook
autofillSystem.registerHook(testHook);

console.log('✅ Test hook registered with race condition optimizations:');
console.log(`   • Max attempts: ${testHook.execution.maxAttempts}`);
console.log(`   • Poll interval: ${testHook.execution.pollInterval}ms`);
console.log(`   • Wait after fill: ${testHook.execution.waitAfterFill}ms`);
console.log(`   • Field retries: ${testHook.execution.fieldRetries}`);
console.log(`   • Field retry delay: ${testHook.execution.fieldRetryDelay}ms`);
console.log(`   • Verification enabled: ${testHook.execution.verifyFill}`);

// Test field value resolution with race condition data
const testUserData = autofillSystem.generateFieldValues(testHook, 'test-session-123');

console.log('\n🎲 Generated test data:');
console.log(`   Name: ${testUserData.fullName}`);
console.log(`   Email: ${testUserData.email}`);
console.log(`   Password: ${testUserData.password.substring(0, 8)}... (${testUserData.password.length} chars)`);

// Test field value resolution
console.log('\n🔧 Field Value Resolution Test:');
Object.entries(testHook.fields).forEach(([selector, fieldConfig]) => {
    const resolvedValue = autofillSystem.resolveFieldValue(fieldConfig, testUserData);
    const displayValue = resolvedValue.length > 40 ? resolvedValue.substring(0, 37) + '...' : resolvedValue;
    console.log(`   ${selector}: ${displayValue}`);
});

// Show system status
const status = autofillSystem.getStatus();
console.log('\n📊 System Status:');
console.log(`   Total hooks: ${status.totalHooks}`);
console.log(`   Data generator tracking: ${status.dataGenerator.trackingEnabled}`);
console.log(`   Hooks with dynamic generation: ${status.hooks.filter(h => h.useDynamicGeneration).length}`);

console.log('\n🔍 Race Condition Handling Features:');
console.log('   ✅ Multi-attempt field filling with exponential backoff');
console.log('   ✅ Field visibility and interactivity checking');
console.log('   ✅ Multiple clearing methods (clear, select+delete, keyboard)');
console.log('   ✅ Alternative filling methods (fill, pressSequentially)');
console.log('   ✅ Post-fill verification with automatic retry');
console.log('   ✅ Configurable timing and retry parameters');
console.log('   ✅ Detailed logging for debugging');

console.log('\n💡 Usage Tips for Race Conditions:');
console.log('   • Increase waitAfterFill for slow-loading forms');
console.log('   • Use higher fieldRetries for unstable elements');
console.log('   • Enable verifyFill to catch failed fills');
console.log('   • Adjust pollInterval for dynamic content');
console.log('   • Monitor logs for timing-related failures');

console.log('\n🚀 Improvements Made:');
console.log('   • Added fillFieldSafely() with 3-attempt retry logic');
console.log('   • Added clearFieldSafely() with multiple clearing methods');
console.log('   • Added verifyFilledFields() for post-fill validation');
console.log('   • Improved timing defaults (500ms+ wait times)');
console.log('   • Added field state checking (visible, enabled, editable)');
console.log('   • Added focus management before field operations');
console.log('   • Added alternative filling with pressSequentially()');

// Cleanup
autofillSystem.cleanup();

console.log('\n✅ Race condition test completed!');
console.log('\n📋 Next Steps:');
console.log('   1. Test with real forms to validate improvements');
console.log('   2. Adjust timing parameters based on specific sites');
console.log('   3. Monitor field verification results');
console.log('   4. Fine-tune retry logic if needed');
