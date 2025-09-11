import { RandomDataGenerator } from '../src/RandomDataGenerator.js';

/**
 * Test script to demonstrate the new username generation patterns
 * This validates the two distinct styles and business domain support
 */

console.log('🎲 Testing Enhanced Username Generation Patterns\n');

// Test Pattern A (Concatenated Style)
console.log('=== PATTERN A: Concatenated Style ===');
const generatorA = new RandomDataGenerator({
    usernameStyle: 'concatenated',
    usernamePattern: 'pattern_a',
    usePostfix: true,
    enableTracking: false
});

for (let i = 0; i < 5; i++) {
    const userData = generatorA.generateUserData();
    console.log(`${i + 1}. ${userData.fullName} → ${userData.email}`);
}

console.log('\n=== PATTERN B: Separator-based Style ===');
const generatorB = new RandomDataGenerator({
    usernameStyle: 'separated',
    usernamePattern: 'pattern_b',
    usePostfix: true,
    separatorChars: ['.', '_', '-'],
    enableTracking: false
});

for (let i = 0; i < 5; i++) {
    const userData = generatorB.generateUserData();
    console.log(`${i + 1}. ${userData.fullName} → ${userData.email}`);
}

console.log('\n=== BUSINESS MODE: Professional Usernames ===');
const generatorBusiness = new RandomDataGenerator({
    businessMode: true,
    enableTracking: false
});

for (let i = 0; i < 5; i++) {
    const userData = generatorBusiness.generateUserData();
    console.log(`${i + 1}. ${userData.fullName} → ${userData.email}`);
}

console.log('\n=== AUTO MODE: Random Pattern Selection ===');
const generatorAuto = new RandomDataGenerator({
    usernameStyle: 'auto',
    usernamePattern: 'random',
    enableTracking: false
});

for (let i = 0; i < 10; i++) {
    const userData = generatorAuto.generateUserData();
    console.log(`${i + 1}. ${userData.fullName} → ${userData.email} [${userData.usernameStyle}/${userData.usernamePattern}]`);
}

console.log('\n=== UNIQUENESS TEST: Collision Detection ===');
const generatorUnique = new RandomDataGenerator({
    enableTracking: true,
    trackingDbPath: './test-uniqueness.db',
    maxAttempts: 100
});

const generatedUsernames = new Set();
let collisions = 0;

for (let i = 0; i < 50; i++) {
    const userData = generatorUnique.generateUserData();
    if (generatedUsernames.has(userData.fullName)) {
        collisions++;
        console.log(`⚠️  Collision detected: ${userData.fullName}`);
    } else {
        generatedUsernames.add(userData.fullName);
    }
}

console.log(`\n📊 Uniqueness Results:`);
console.log(`   Generated: 50 usernames`);
console.log(`   Unique: ${generatedUsernames.size}`);
console.log(`   Collisions: ${collisions}`);
console.log(`   Uniqueness Rate: ${((generatedUsernames.size / 50) * 100).toFixed(1)}%`);

// Clean up test database
generatorUnique.close();
import fs from 'fs-extra';
try {
    await fs.remove('./test-uniqueness.db');
    console.log('🧹 Test database cleaned up');
} catch (error) {
    console.log('⚠️  Could not clean up test database:', error.message);
}

console.log('\n✅ Username pattern testing completed!');

// Extra: Pattern C Handle Demo
console.log('\n=== PATTERN C: Short Syllabic Handle ===');
const generatorC = new RandomDataGenerator({
    usernameStyle: 'handle',
    usernamePattern: 'pattern_c',
    handleSyllables: 4,
    enableTracking: false
});

for (let i = 0; i < 10; i++) {
    const userData = generatorC.generateUserData();
    console.log(`${i + 1}. ${userData.fullName} → ${userData.email}`);
}