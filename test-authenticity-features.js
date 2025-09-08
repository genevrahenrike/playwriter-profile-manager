#!/usr/bin/env node

/**
 * Test script for authenticity analysis features
 */

import { createProfileSystem } from './src/index.js';
import { AuthenticityAnalyzer } from './src/AuthenticityAnalyzer.js';

async function testAuthenticityFeatures() {
    console.log('🧪 Testing Authenticity Analysis Features\n');
    
    // Create profile system
    const system = createProfileSystem('./test-profiles');
    
    try {
        // Create a test profile
        console.log('📝 Creating test profile...');
        const profile = await system.createProfile('authenticity-test', {
            description: 'Testing authenticity features',
            browserType: 'chromium'
        });
        console.log('✅ Profile created:', profile.name);
        
        // Test 1: Basic Authenticity Analysis
        console.log('\n🔍 Test 1: Basic authenticity analysis');
        const result1 = await system.launchProfile('authenticity-test', {
            stealth: true,
            stealthPreset: 'balanced'
        });
        
        const authenticityResults = await system.profileLauncher.testAuthenticity(result1.sessionId, {
            includeMultipleSites: false, // Skip for speed
            includeBehavioralAnalysis: true,
            includeConsistencyCheck: true,
            saveResults: false
        });
        
        console.log(`📊 Authenticity Score: ${(authenticityResults.scores.overall * 100).toFixed(1)}%`);
        console.log(`🎯 Risk Level: ${system.profileLauncher.calculateRiskLevel(authenticityResults.scores.overall)}`);
        console.log(`⚠️  Suspicion Flags: ${authenticityResults.scores.suspicion_flags.length}`);
        
        await system.profileLauncher.closeBrowser(result1.sessionId);
        
        // Test 2: Preflight Authenticity Check
        console.log('\n🚀 Test 2: Preflight authenticity check');
        const preflightResults = await system.profileLauncher.runPreflightAuthenticityCheck(profile.id);
        
        console.log(`📊 Preflight Score: ${(preflightResults.authenticityAnalysis.scores.overall * 100).toFixed(1)}%`);
        console.log(`🎯 Test Result: ${preflightResults.passed ? 'PASSED' : 'FAILED'}`);
        console.log(`⚠️  Risk Level: ${preflightResults.riskLevel}`);
        console.log(`💡 Recommendations: ${preflightResults.recommendations.length}`);
        
        // Test 3: Compare Authenticity Across Presets
        console.log('\n🔬 Test 3: Comparing authenticity across presets');
        const comparisonResults = await system.profileLauncher.compareStealthAuthenticity(profile.id, ['minimal', 'balanced']);
        
        console.log(`🏆 Best Preset: ${comparisonResults.recommendations.best_preset}`);
        console.log(`📊 Best Score: ${(comparisonResults.recommendations.best_score * 100).toFixed(1)}%`);
        
        console.log('\n📋 Comparison Details:');
        comparisonResults.comparisons.forEach(comp => {
            const emoji = comp.passed ? '✅' : '❌';
            console.log(`   ${emoji} ${comp.preset}: ${(comp.overall_score * 100).toFixed(1)}% (${comp.risk_level} risk)`);
        });
        
        // Test 4: Direct AuthenticityAnalyzer Usage
        console.log('\n🔬 Test 4: Direct authenticity analyzer test');
        const result4 = await system.launchProfile('authenticity-test', {
            stealth: true,
            stealthPreset: 'minimal'
        });
        
        const authenticityAnalyzer = new AuthenticityAnalyzer();
        const page = result4.context.pages()[0];
        
        const directResults = await authenticityAnalyzer.analyzeAuthenticity(page, {
            includeMultipleSites: false,
            includeBehavioralAnalysis: true,
            includeConsistencyCheck: false,
            saveResults: false
        });
        
        console.log('📊 Direct Analysis Results:');
        console.log(`   Overall Score: ${(directResults.scores.overall * 100).toFixed(1)}%`);
        console.log(`   Consistency: ${(directResults.scores.consistency * 100).toFixed(1)}%`);
        console.log(`   Behavioral: ${(directResults.scores.behavioral * 100).toFixed(1)}%`);
        
        // Generate and display report
        console.log('\n📄 Authenticity Report:');
        console.log(authenticityAnalyzer.generateAuthenticityReport(directResults));
        
        await system.profileLauncher.closeBrowser(result4.sessionId);
        
        // Test 5: Show scoring criteria
        console.log('\n📏 Test 5: Scoring criteria and thresholds');
        console.log('Authenticity Score Interpretation:');
        console.log('   🟢 80-100%: LOW RISK - Excellent authenticity');
        console.log('   🟡 60-79%:  MEDIUM RISK - Good authenticity');
        console.log('   🟠 40-59%:  HIGH RISK - Suspicious patterns detected');
        console.log('   🔴 0-39%:   CRITICAL RISK - High bot detection probability');
        
        console.log('\nKey Detection Factors:');
        console.log('   • WebDriver property detection');
        console.log('   • Fingerprint consistency across tests');
        console.log('   • Behavioral pattern analysis');
        console.log('   • Performance timing patterns');
        console.log('   • Hardware/software property plausibility');
        
        console.log('\n🎉 All authenticity tests completed successfully!');
        
        console.log('\n📋 Summary of Features Tested:');
        console.log('   ✅ Basic authenticity analysis');
        console.log('   ✅ Preflight authenticity checks');
        console.log('   ✅ Multi-preset authenticity comparison');
        console.log('   ✅ Direct analyzer usage');
        console.log('   ✅ Scoring and risk assessment');
        console.log('   ✅ Automated recommendations');
        
        console.log('\n🔧 Try the CLI commands:');
        console.log('   ppm-stealth preflight-check authenticity-test --preset balanced');
        console.log('   ppm-stealth compare-authenticity authenticity-test');
        console.log('   ppm-stealth test-authenticity --comprehensive');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        // Cleanup
        await system.cleanup();
        console.log('\n🧹 Cleanup completed');
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testAuthenticityFeatures().catch(console.error);
}

export { testAuthenticityFeatures };
