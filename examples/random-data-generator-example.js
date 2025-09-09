#!/usr/bin/env node

/**
 * Random Data Generator Example
 * 
 * This example demonstrates the enhanced autofill capabilities with
 * random name and password generation using international names.
 */

import { RandomDataGenerator } from '../src/RandomDataGenerator.js';
import { AutofillHookSystem } from '../src/AutofillHookSystem.js';

// Example 1: Basic Random Data Generation
console.log('🎲 Example 1: Basic Random Data Generation');
console.log('=' .repeat(50));

const basicGenerator = new RandomDataGenerator({
    usePrefix: false,
    usePostfix: true,
    postfixDigits: 4
});

// Generate 5 random user profiles
for (let i = 1; i <= 5; i++) {
    const userData = basicGenerator.generateUserData();
    console.log(`${i}. ${userData.fullName} | ${userData.email}`);
}

console.log('\n🎲 Example 2: Advanced Configuration with Tracking');
console.log('=' .repeat(50));

// Example 2: Advanced Configuration with SQLite Tracking
const advancedGenerator = new RandomDataGenerator({
    usePrefix: true,        // Add numeric prefix
    usePostfix: true,       // Add numeric postfix
    postfixDigits: 4,       // 4-digit postfix
    enableTracking: true,   // Enable SQLite tracking
    trackingDbPath: './profiles/data/example_generated_names.db',
    
    // Custom email providers
    emailProviders: [
        { domain: 'gmail.com', weight: 25 },
        { domain: 'protonmail.com', weight: 20 },
        { domain: 'tutanota.com', weight: 15 },
        { domain: 'fastmail.com', weight: 10 }
    ],
    
    // Custom password complexity
    passwordComplexity: {
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true
    },
    
    passwordLength: { min: 16, max: 20 }
});

// Generate user data with tracking
console.log('Generating 3 users with tracking enabled:');
for (let i = 1; i <= 3; i++) {
    const userData = advancedGenerator.generateUserData({
        currentIndex: i
    });
    console.log(`${i}. ${userData.fullName}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Password: ${userData.password.substring(0, 8)}... (${userData.password.length} chars)`);
    console.log(`   Generation attempts: ${userData.generationAttempts}`);
    console.log();
}

// Show statistics
const stats = advancedGenerator.getStatistics();
console.log('📊 Generation Statistics:');
console.log(`   Tracking enabled: ${stats.trackingEnabled}`);
if (stats.trackingEnabled) {
    console.log(`   Total generated: ${stats.totalGenerated}`);
    console.log(`   Unique names: ${stats.uniqueNames}`);
    console.log(`   Reused names: ${stats.reusedNames}`);
    console.log(`   Database: ${stats.databasePath}`);
}

console.log('\n🎲 Example 3: AutofillHookSystem Integration');
console.log('=' .repeat(50));

// Example 3: Integration with AutofillHookSystem
const autofillSystem = new AutofillHookSystem({
    usePrefix: false,
    usePostfix: true,
    enableTracking: false,  // Disable for example
    
    // Custom email providers for autofill
    emailProviders: [
        { domain: 'tempmail.org', weight: 30 },
        { domain: 'guerrillamail.com', weight: 20 },
        { domain: 'mailinator.com', weight: 15 },
        { domain: '10minutemail.com', weight: 10 }
    ],
    
    passwordLength: { min: 12, max: 16 }
});

// Demonstrate field value resolution
const mockHookConfig = {
    name: 'example-hook',
    useDynamicGeneration: true,
    generationOptions: {
        usePrefix: false,
        usePostfix: true
    },
    fields: {
        'input[type="email"]': {
            value: '{{email}}',
            description: 'Email field'
        },
        'input[type="password"]': {
            value: '{{password}}',
            description: 'Password field'
        },
        'input[name="fullName"]': {
            value: '{{fullName}}',
            description: 'Full name field'
        },
        'input[name="referralCode"]': {
            value: (userData) => `REF${userData.fullName.substring(0, 4).toUpperCase()}${Math.floor(Math.random() * 1000)}`,
            description: 'Dynamic referral code'
        }
    }
};

// Generate data and resolve field values
const userData = autofillSystem.generateFieldValues(mockHookConfig, 'example-session-123');
console.log('Generated user data for autofill:');
console.log(`   Full name: ${userData.fullName}`);
console.log(`   Email: ${userData.email}`);
console.log(`   Password: ${userData.password.substring(0, 10)}...`);

console.log('\nResolved field values:');
Object.entries(mockHookConfig.fields).forEach(([selector, fieldConfig]) => {
    const resolvedValue = autofillSystem.resolveFieldValue(fieldConfig, userData);
    const displayValue = resolvedValue.length > 30 ? resolvedValue.substring(0, 27) + '...' : resolvedValue;
    console.log(`   ${selector}: ${displayValue}`);
});

console.log('\n🎲 Example 4: Password Generation Variations');
console.log('=' .repeat(50));

// Example 4: Different password generation options
const passwordExamples = [
    { minLength: 8, maxLength: 10, requireSymbols: false },
    { minLength: 12, maxLength: 14, requireSymbols: true },
    { minLength: 16, maxLength: 20, requireSymbols: true }
];

passwordExamples.forEach((options, index) => {
    const password = basicGenerator.generatePassword(options);
    console.log(`Password ${index + 1} (${options.minLength}-${options.maxLength} chars, symbols: ${options.requireSymbols}): ${password}`);
});

console.log('\n🎲 Example 5: Name Generation Variations');
console.log('=' .repeat(50));

// Example 5: Different name generation options
const nameOptions = [
    { usePrefix: false, usePostfix: false },
    { usePrefix: true, usePostfix: false },
    { usePrefix: false, usePostfix: true },
    { usePrefix: true, usePostfix: true }
];

nameOptions.forEach((options, index) => {
    const nameData = basicGenerator.generateUniqueName({ ...options, currentIndex: index + 1 });
    console.log(`Name ${index + 1} (prefix: ${options.usePrefix}, postfix: ${options.usePostfix}): ${nameData.fullName}`);
});

console.log('\n🎲 Example 6: Email Provider Distribution');
console.log('=' .repeat(50));

// Example 6: Email provider distribution
const providerCounts = {};
for (let i = 0; i < 100; i++) {
    const userData = basicGenerator.generateUserData();
    const provider = userData.emailProvider;
    providerCounts[provider] = (providerCounts[provider] || 0) + 1;
}

console.log('Email provider distribution (100 samples):');
Object.entries(providerCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([provider, count]) => {
        const percentage = (count / 100 * 100).toFixed(1);
        console.log(`   ${provider}: ${count} (${percentage}%)`);
    });

// Cleanup
basicGenerator.close();
advancedGenerator.close();
autofillSystem.cleanup();

console.log('\n✅ Examples completed successfully!');
console.log('\n📚 Usage Tips:');
console.log('   • Set useDynamicGeneration: true in hook configs');
console.log('   • Use {{email}}, {{password}}, {{fullName}} placeholders');
console.log('   • Enable tracking for production use');
console.log('   • Customize email providers and password rules');
console.log('   • Use function-based values for complex scenarios');
