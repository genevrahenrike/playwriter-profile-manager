#!/usr/bin/env node

import { RandomDataGenerator } from '../src/RandomDataGenerator.js';

/**
 * Streamlined test to evaluate username pattern quality and weights
 */

console.log('🔍 Username Pattern Quality Assessment\n');

// Test current defaults
const generator = new RandomDataGenerator({
    enableTracking: false // No DB for quick testing
});

console.log('Current Weight Settings:');
console.log(`Pattern Weights:`, generator.config.patternWeights);
console.log(`Number Flavor Weights:`, generator.config.numberFlavorWeights);
console.log(`Number Flavor Getter:`, generator.numberFlavorWeights);
console.log('');

// Generate sample batch and categorize
const sampleSize = 50;
const results = [];
const categories = {
    'clean_concat': [],      // firstname+lastname (no digits)
    'concat_with_digits': [], // firstname+lastname+digits
    'clean_separated': [],   // first.last or first_last (no digits)  
    'sep_2digit': [],        // first.last.12
    'sep_4digit': [],        // first.last.1234 (potentially odd)
    'business': [],          // professional formats
    'handle': []             // short syllabic
};

console.log(`Generating ${sampleSize} samples...\n`);

for (let i = 0; i < sampleSize; i++) {
    const userData = generator.generateUserData();
    const username = userData.fullName;
    const style = userData.usernameStyle;
    const pattern = userData.usernamePattern;
    const numberFlavor = userData.numberFlavor;
    
    results.push({ username, style, pattern, numberFlavor });
    
    // Categorize for analysis
    if (style === 'business') {
        categories.business.push(username);
    } else if (style === 'handle') {
        categories.handle.push(username);
    } else if (style === 'concatenated') {
        if (numberFlavor === 'none') {
            categories.clean_concat.push(username);
        } else {
            categories.concat_with_digits.push(username);
        }
    } else if (style === 'separated') {
        if (numberFlavor === 'none') {
            categories.clean_separated.push(username);
        } else if (numberFlavor === 'd2') {
            categories.sep_2digit.push(username);
        } else if (numberFlavor === 'd4') {
            categories.sep_4digit.push(username);
        }
    }
}

// Analysis and recommendations
console.log('=== QUALITY ASSESSMENT ===\n');

Object.entries(categories).forEach(([category, usernames]) => {
    const count = usernames.length;
    const percentage = ((count / sampleSize) * 100).toFixed(1);
    const quality = getQualityRating(category, count, sampleSize);
    
    console.log(`📊 ${category.replace('_', ' ').toUpperCase()}: ${count} (${percentage}%) ${quality}`);
    
    // Show a few examples
    if (count > 0) {
        const examples = usernames.slice(0, 3).join(', ');
        console.log(`   Examples: ${examples}`);
        if (count > 3) console.log(`   ... and ${count - 3} more`);
    }
    console.log('');
});

// Overall assessment
const oddLooking = categories.sep_4digit.length + (categories.concat_with_digits.length * 0.3);
const naturalLooking = categories.clean_concat.length + categories.clean_separated.length + categories.sep_2digit.length;

console.log('=== OVERALL QUALITY ===');
console.log(`✅ Natural looking: ${naturalLooking}/${sampleSize} (${((naturalLooking/sampleSize)*100).toFixed(1)}%)`);
console.log(`⚠️  Potentially odd: ${oddLooking.toFixed(1)}/${sampleSize} (${((oddLooking/sampleSize)*100).toFixed(1)}%)`);

if (oddLooking > sampleSize * 0.15) {
    console.log('\n💡 RECOMMENDATION: Consider reducing d4 weight further or adjust pattern distribution');
} else if (naturalLooking > sampleSize * 0.7) {
    console.log('\n✨ GOOD: Natural-looking usernames dominate the output');
} else {
    console.log('\n📝 NEUTRAL: Pattern distribution looks reasonable');
}

function getQualityRating(category, count, total) {
    const percentage = count / total;
    
    switch (category) {
        case 'clean_concat':
        case 'clean_separated':
            return percentage > 0.25 ? '✅ Good' : percentage > 0.15 ? '📝 OK' : '⚠️ Low';
        case 'sep_2digit':
            return percentage > 0.15 ? '✅ Good' : percentage > 0.1 ? '📝 OK' : '⚠️ Low';
        case 'concat_with_digits':
            return percentage < 0.2 ? '✅ Good' : percentage < 0.3 ? '📝 OK' : '⚠️ High';
        case 'sep_4digit':
            return percentage < 0.05 ? '✅ Good' : percentage < 0.1 ? '📝 OK' : '⚠️ High';
        case 'business':
        case 'handle':
            return percentage > 0.05 ? '✅ Present' : '📝 Rare';
        default:
            return '📝 OK';
    }
}