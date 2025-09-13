#!/usr/bin/env node

import { SessionStatusScanner } from './src/SessionStatusScanner.js';
import { ProfileManager } from './src/ProfileManager.js';
import fs from 'fs';
import path from 'path';

async function analyzePersistedMissingProfiles() {
    console.log('🔍 Analyzing persisted profiles that might have successful sessions but incomplete captures...\n');
    
    // Initialize components
    const scanner = new SessionStatusScanner({
        capturedRequestsDir: './captured-requests',
        automationResultsDir: './automation-results',
        profilesDir: './profiles',
        quiet: true
    });
    
    const profileManager = new ProfileManager('./profiles');
    
    // Get all persisted profiles from database (only those that still exist)
    console.log('📊 Loading all persisted profiles from database...');
    const allProfiles = await profileManager.listProfiles();
    console.log(`📦 Found ${allProfiles.length} total persisted profiles`);
    
    // Load profiles already extracted
    let extractedProfiles = new Set();
    try {
        const allProfilesData = JSON.parse(fs.readFileSync('./output/all-profiles.json', 'utf8'));
        allProfilesData.forEach(profile => {
            extractedProfiles.add(profile.name);
        });
        console.log(`📦 Found ${extractedProfiles.size} profiles already extracted`);
    } catch (error) {
        console.error('❌ Error reading all-profiles.json:', error.message);
        return;
    }
    
    // Get session analysis results
    console.log('📊 Scanning captured sessions...');
    const sessionResults = await scanner.scanAllSessions();
    
    // Create maps for analysis
    const profilesWithCapture = new Map(); // profile -> session analysis
    const profilesWithSuccessfulSessions = new Set();
    
    sessionResults.sessions.forEach(session => {
        if (session.profileName) {
            if (!profilesWithCapture.has(session.profileName)) {
                profilesWithCapture.set(session.profileName, []);
            }
            profilesWithCapture.get(session.profileName).push(session);
            
            if (session.finalStatus === 'success') {
                profilesWithSuccessfulSessions.add(session.profileName);
            }
        }
    });
    
    console.log(`📡 Found ${profilesWithCapture.size} profiles with captured traffic`);
    console.log(`✅ Found ${profilesWithSuccessfulSessions.size} profiles with successful sessions`);
    
    // Analyze persisted profiles
    const analysis = {
        totalPersisted: allProfiles.length,
        alreadyExtracted: extractedProfiles.size,
        withCapture: 0,
        withSuccessfulSessions: 0,
        noCapture: [],
        incompleteCapture: [],
        potentiallySuccessful: [],
        categories: {
            'no-capture': [],
            'failed-sessions': [],
            'incomplete-capture': [],
            'network-issues': [],
            'early-exit': [],
            'potentially-successful': []
        }
    };
    
    // Analyze each persisted profile
    for (const profile of allProfiles) {
        const profileName = profile.name;
        
        // Skip if already extracted
        if (extractedProfiles.has(profileName)) {
            continue;
        }
        
        const sessions = profilesWithCapture.get(profileName) || [];
        
        if (sessions.length === 0) {
            // No captured traffic at all
            analysis.noCapture.push(profileName);
            analysis.categories['no-capture'].push({
                name: profileName,
                reason: 'No captured traffic found',
                created: profile.created_at
            });
        } else {
            analysis.withCapture++;
            
            // Analyze session patterns
            const hasSuccessfulSession = sessions.some(s => s.finalStatus === 'success');
            const hasFailedSession = sessions.some(s => s.finalStatus === 'auth_failure_400');
            const hasNetworkIssues = sessions.some(s => s.finalStatus === 'network_error');
            const hasMinimalTraffic = sessions.some(s => s.requestCount < 5);
            const hasShortDuration = sessions.some(s => s.duration && s.duration < 10000); // < 10 seconds
            
            if (hasSuccessfulSession) {
                analysis.withSuccessfulSessions++;
                analysis.potentiallySuccessful.push({
                    name: profileName,
                    reason: 'Has successful session but not extracted',
                    sessions: sessions.length,
                    successfulSessions: sessions.filter(s => s.finalStatus === 'success').length
                });
                analysis.categories['potentially-successful'].push({
                    name: profileName,
                    reason: 'Has successful session but not extracted',
                    sessions: sessions.map(s => ({
                        status: s.finalStatus,
                        requests: s.requestCount,
                        duration: s.duration
                    }))
                });
            } else if (hasFailedSession) {
                analysis.categories['failed-sessions'].push({
                    name: profileName,
                    reason: 'Has failed authentication sessions',
                    sessions: sessions.map(s => ({
                        status: s.finalStatus,
                        requests: s.requestCount,
                        duration: s.duration
                    }))
                });
            } else if (hasNetworkIssues) {
                analysis.categories['network-issues'].push({
                    name: profileName,
                    reason: 'Network/proxy issues detected',
                    sessions: sessions.map(s => ({
                        status: s.finalStatus,
                        requests: s.requestCount,
                        duration: s.duration
                    }))
                });
            } else if (hasMinimalTraffic || hasShortDuration) {
                analysis.incompleteCapture.push({
                    name: profileName,
                    reason: 'Minimal traffic or short duration - possible early exit',
                    sessions: sessions.length,
                    avgRequests: Math.round(sessions.reduce((sum, s) => sum + s.requestCount, 0) / sessions.length),
                    avgDuration: Math.round(sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / sessions.length)
                });
                analysis.categories['early-exit'].push({
                    name: profileName,
                    reason: 'Possible early exit or incomplete capture',
                    sessions: sessions.map(s => ({
                        status: s.finalStatus,
                        requests: s.requestCount,
                        duration: s.duration
                    }))
                });
            } else {
                analysis.categories['incomplete-capture'].push({
                    name: profileName,
                    reason: 'Has traffic but unclear status',
                    sessions: sessions.map(s => ({
                        status: s.finalStatus,
                        requests: s.requestCount,
                        duration: s.duration
                    }))
                });
            }
        }
    }
    
    // Calculate missing profiles
    const missingProfiles = analysis.totalPersisted - analysis.alreadyExtracted;
    
    console.log(`\n🎯 ANALYSIS RESULTS:`);
    console.log(`==================`);
    console.log(`Total persisted profiles: ${analysis.totalPersisted}`);
    console.log(`Already extracted: ${analysis.alreadyExtracted}`);
    console.log(`Missing extraction: ${missingProfiles}`);
    console.log(`Missing with no capture: ${analysis.noCapture.length}`);
    console.log(`Missing with incomplete capture: ${analysis.incompleteCapture.length}`);
    console.log(`Missing with successful sessions: ${analysis.potentiallySuccessful.length}`);
    
    console.log(`\n📊 BREAKDOWN BY CATEGORY:`);
    console.log(`========================`);
    Object.keys(analysis.categories).forEach(category => {
        const count = analysis.categories[category].length;
        if (count > 0) {
            console.log(`${category}: ${count} profiles`);
        }
    });
    
    // Show potentially successful profiles
    if (analysis.potentiallySuccessful.length > 0) {
        console.log(`\n🎯 POTENTIALLY SUCCESSFUL PROFILES (${analysis.potentiallySuccessful.length}):`);
        console.log(`===============================================`);
        analysis.potentiallySuccessful.forEach(profile => {
            console.log(`  - ${profile.name} (${profile.successfulSessions}/${profile.sessions} successful sessions)`);
        });
    }
    
    // Show profiles with incomplete capture that might be recoverable
    if (analysis.incompleteCapture.length > 0) {
        console.log(`\n⚠️  INCOMPLETE CAPTURE PROFILES (${analysis.incompleteCapture.length}):`);
        console.log(`=========================================`);
        analysis.incompleteCapture.slice(0, 10).forEach(profile => {
            console.log(`  - ${profile.name} (${profile.avgRequests} avg requests, ${Math.round(profile.avgDuration/1000)}s avg duration)`);
        });
        if (analysis.incompleteCapture.length > 10) {
            console.log(`  ... and ${analysis.incompleteCapture.length - 10} more`);
        }
    }
    
    // Save detailed results
    const outputData = {
        timestamp: new Date().toISOString(),
        summary: {
            totalPersisted: analysis.totalPersisted,
            alreadyExtracted: analysis.alreadyExtracted,
            missingExtraction: missingProfiles,
            potentiallySuccessful: analysis.potentiallySuccessful.length,
            incompleteCapture: analysis.incompleteCapture.length,
            noCapture: analysis.noCapture.length
        },
        categories: analysis.categories,
        potentiallySuccessful: analysis.potentiallySuccessful,
        incompleteCapture: analysis.incompleteCapture
    };
    
    const outputFile = './output/persisted-missing-analysis.json';
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`\n💾 Detailed results saved to: ${outputFile}`);
    
    // Generate recovery commands
    console.log(`\n🚀 RECOVERY RECOMMENDATIONS:`);
    console.log(`===========================`);
    
    if (analysis.potentiallySuccessful.length > 0) {
        console.log(`\n1. HIGH PRIORITY - Profiles with successful sessions (${analysis.potentiallySuccessful.length} profiles):`);
        console.log(`   These profiles have successful sessions but weren't extracted - likely timing issues`);
        
        // Group by prefix
        const successfulByPrefix = {};
        analysis.potentiallySuccessful.forEach(profile => {
            const prefix = profile.name.match(/^([a-zA-Z-]+)/)?.[1] || 'other';
            if (!successfulByPrefix[prefix]) successfulByPrefix[prefix] = [];
            successfulByPrefix[prefix].push(profile.name);
        });
        
        Object.keys(successfulByPrefix).forEach(prefix => {
            console.log(`   npx ppm refresh-missing --prefix ${prefix} --limit 20 --dry-run --headless --proxy-strategy auto`);
        });
    }
    
    if (analysis.incompleteCapture.length > 0) {
        console.log(`\n2. MEDIUM PRIORITY - Profiles with incomplete capture (${analysis.incompleteCapture.length} profiles):`);
        console.log(`   These might have successful sessions that were cut short`);
        
        // Group by prefix
        const incompleteByPrefix = {};
        analysis.incompleteCapture.forEach(profile => {
            const prefix = profile.name.match(/^([a-zA-Z-]+)/)?.[1] || 'other';
            if (!incompleteByPrefix[prefix]) incompleteByPrefix[prefix] = [];
            incompleteByPrefix[prefix].push(profile.name);
        });
        
        Object.keys(incompleteByPrefix).forEach(prefix => {
            if (incompleteByPrefix[prefix].length > 5) { // Only show if significant number
                console.log(`   npx ppm refresh-missing --prefix ${prefix} --limit 10 --dry-run --headless --proxy-strategy auto`);
            }
        });
    }
    
    if (analysis.noCapture.length > 0) {
        console.log(`\n3. LOW PRIORITY - Profiles with no capture (${analysis.noCapture.length} profiles):`);
        console.log(`   These likely need full signup/login flows`);
        console.log(`   Consider manual inspection before batch processing`);
    }
}

// Run the analysis
analyzePersistedMissingProfiles().catch(console.error);