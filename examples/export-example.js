#!/usr/bin/env node

/**
 * Export Example - Demonstrates the user data export functionality
 */

import { AutofillHookSystem } from '../src/AutofillHookSystem.js';
import { RandomDataGenerator } from '../src/RandomDataGenerator.js';

console.log('📤 User Data Export Example');
console.log('=' .repeat(50));

// Create autofill system with tracking enabled
const autofillSystem = new AutofillHookSystem({
    enableTracking: true,
    trackingDbPath: './profiles/data/example_export.db',
    usePrefix: false,
    usePostfix: true
});

// Generate some sample data
console.log('🎲 Generating sample user data...');
const sampleSites = [
    { url: 'https://app.vidiq.com/signup', hook: 'vidiq-autofill' },
    { url: 'https://example.com/register', hook: 'generic-signup' },
    { url: 'https://test.com/join', hook: 'test-hook' }
];

const generatedUsers = [];

for (let i = 0; i < 5; i++) {
    const site = sampleSites[i % sampleSites.length];
    const userData = autofillSystem.generateFieldValues({
        name: site.hook,
        useDynamicGeneration: true,
        generationOptions: {
            usePrefix: false,
            usePostfix: true
        }
    }, `session-${i + 1}`, site.url);
    
    generatedUsers.push({ ...userData, site: site.url, hook: site.hook });
}

console.log(`✅ Generated ${generatedUsers.length} sample users`);

// Show generated data
console.log('\n📋 Generated Users:');
generatedUsers.forEach((user, index) => {
    console.log(`${index + 1}. ${user.fullName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${user.password.substring(0, 8)}...`);
    console.log(`   Site: ${user.site}`);
    console.log(`   Hook: ${user.hook}`);
    console.log();
});

// Get all records from database
const records = autofillSystem.getUserDataRecords();
console.log(`📊 Total records in database: ${records.length}`);

// Export to different formats
console.log('\n📤 Exporting to different formats...');

try {
    // Export to Chrome CSV format
    const chromeFile = await autofillSystem.exportUserData('chrome', './profiles/data/chrome_passwords.csv');
    console.log(`✅ Chrome CSV export: ${chromeFile}`);
    
    // Clear export flags so we can export again
    const generator = autofillSystem.dataGenerator;
    if (generator.db) {
        const stmt = generator.db.prepare('UPDATE user_data_exports SET exported_at = NULL');
        stmt.run();
    }
    
    // Export to Apple Keychain format
    const appleFile = await autofillSystem.exportUserData('apple', './profiles/data/apple_keychain.csv');
    console.log(`✅ Apple Keychain export: ${appleFile}`);
    
    // Clear export flags again
    if (generator.db) {
        const stmt = generator.db.prepare('UPDATE user_data_exports SET exported_at = NULL');
        stmt.run();
    }
    
    // Export to 1Password format
    const onePasswordFile = await autofillSystem.exportUserData('1password', './profiles/data/1password_import.csv');
    console.log(`✅ 1Password export: ${onePasswordFile}`);
    
} catch (error) {
    console.error('❌ Export error:', error.message);
}

// Show statistics
const stats = autofillSystem.dataGenerator.getStatistics();
console.log('\n📊 Export Statistics:');
console.log(`   Tracking enabled: ${stats.trackingEnabled}`);
if (stats.trackingEnabled) {
    console.log(`   Total generated: ${stats.totalGenerated || records.length}`);
    console.log(`   Database path: ${stats.databasePath}`);
}

console.log('\n💡 Export Usage:');
console.log('   • Use ppm-export list to see all records');
console.log('   • Use ppm-export export chrome to export Chrome CSV');
console.log('   • Use ppm-export export apple to export Apple Keychain CSV');
console.log('   • Use ppm-export export 1password to export 1Password CSV');
console.log('   • Use ppm-export stats to see generation statistics');

console.log('\n📋 File Formats:');
console.log('   • Chrome CSV: url,username,password,note');
console.log('   • Apple Keychain: Title,URL,Username,Password,Notes');
console.log('   • 1Password: Title,Website,Username,Password,Notes,Type');

console.log('\n🔍 The generated data from your recent session:');
console.log('   Name: pawelrasmussen6397');
console.log('   Email: pawelrasmussen6397@protonmail.com');
console.log('   Password: tN*;;,B@o2+B{9');
console.log('   ↳ This data should be recorded if tracking was enabled');

// Cleanup
autofillSystem.cleanup();

console.log('\n✅ Export example completed!');
