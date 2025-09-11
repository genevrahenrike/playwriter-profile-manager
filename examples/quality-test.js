#!/usr/bin/env node

import { RandomDataGenerator } from '../src/RandomDataGenerator.js';

// Test quality of username generation with current weights
const generator = new RandomDataGenerator({
    usernameStyle: 'auto',
    usernamePattern: 'random'
});

console.log('🎯 Username Quality Test - Current Weights\n');

// Generate samples and categorize by quality
const samples = [];
const categories = {
    'Clean Concat': [],       // firstname+lastname (no digits)
    'Clean Separated': [],    // firstname.lastname (no digits)
    'Clean Handle': [],       // short syllabic handles
    'Concat + 2d': [],        // firstname+lastname + 2 digits
    'Concat + 4d': [],        // firstname+lastname + 4 digits  
    'Sep + 2d': [],           // firstname.lastname.## 
    'Sep + 4d': [],           // firstname.lastname.#### (often looks odd)
    'Business': []            // professional styles
};

// Generate 100 samples
for (let i = 0; i < 100; i++) {
    const userData = generator.generateUserData();
    samples.push(userData);
    
    const { fullName, usernameStyle, usernamePattern, numberFlavor } = userData;
    
    if (usernameStyle === 'business') {
        categories['Business'].push(fullName);
    } else if (usernameStyle === 'handle') {
        categories['Clean Handle'].push(fullName);
    } else if (usernameStyle === 'concatenated') {
        if (numberFlavor === 'none') {
            categories['Clean Concat'].push(fullName);
        } else if (numberFlavor === 'd2') {
            categories['Concat + 2d'].push(fullName);
        } else {
            categories['Concat + 4d'].push(fullName);
        }
    } else if (usernameStyle === 'separated') {
        if (numberFlavor === 'none') {
            categories['Clean Separated'].push(fullName);
        } else if (numberFlavor === 'd2') {
            categories['Sep + 2d'].push(fullName);
        } else {
            categories['Sep + 4d'].push(fullName);
        }
    }
}

// Display results with quality assessment
const totalSamples = samples.length;
console.log('📊 Distribution and Quality Assessment:\n');

for (const [category, usernames] of Object.entries(categories)) {
    const count = usernames.length;
    const percentage = ((count / totalSamples) * 100).toFixed(1);
    
    // Quality indicators
    let quality = '';
    if (category.includes('Clean') || category === 'Business') {
        quality = '✅ Natural';
    } else if (category.includes('2d')) {
        quality = '🟡 Decent';
    } else if (category.includes('4d')) {
        quality = '🔴 Odd';
    }
    
    console.log(`${quality} ${category}: ${count} (${percentage}%)`);
    
    // Show examples (max 3)
    if (count > 0) {
        const examples = usernames.slice(0, 3).join(', ');
        console.log(`   Examples: ${examples}`);
        if (count > 3) console.log(`   ... +${count - 3} more`);
    }
    console.log();
}

// Quality score calculation
const naturalCount = categories['Clean Concat'].length + 
                    categories['Clean Separated'].length + 
                    categories['Clean Handle'].length + 
                    categories['Business'].length;

const decentCount = categories['Concat + 2d'].length + 
                   categories['Sep + 2d'].length;

const oddCount = categories['Concat + 4d'].length + 
                categories['Sep + 4d'].length;

const qualityScore = ((naturalCount * 1.0 + decentCount * 0.6 + oddCount * 0.1) / totalSamples * 100).toFixed(1);

console.log(`🎯 Quality Score: ${qualityScore}/100`);
console.log(`   Natural: ${naturalCount} | Decent: ${decentCount} | Odd: ${oddCount}`);

// Recommendations
if (oddCount > 5) {
    console.log('\n💡 Recommendation: Consider reducing d4 weight further');
}
if (naturalCount < 60) {
    console.log('\n💡 Recommendation: Consider increasing "none" number flavor weight');
}
if (categories['Sep + 4d'].length > 2) {
    console.log('\n💡 Recommendation: Sep + 4d combinations look particularly odd');
}

console.log('\n✅ Quality test completed!');