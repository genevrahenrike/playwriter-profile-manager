#!/usr/bin/env node

import { SessionStatusScanner } from './src/SessionStatusScanner.js';
import fs from 'fs';
import path from 'path';

async function identifyMissingSuccessfulProfiles() {
    console.log('🔍 Identifying profiles with successful sessions missing from all-profiles.json...\n');
    
    // Initialize session scanner
    const scanner = new SessionStatusScanner({
        capturedRequestsDir: './captured-requests',
        automationResultsDir: './automation-results',
        profilesDir: './profiles',
        quiet: true
    });
    
    // Get all successful sessions
    console.log('📊 Scanning all sessions for successful ones...');
    const results = await scanner.scanAllSessions();
    
    // Extract profile names from successful sessions
    const successfulProfiles = new Set();
    results.sessions.forEach(session => {
        if (session.finalStatus === 'success') {
            // Use profileName directly from session analysis
            if (session.profileName) {
                successfulProfiles.add(session.profileName);
            }
        }
    });
    
    console.log(`✅ Found ${successfulProfiles.size} unique profiles with successful sessions`);
    
    // Load profiles from all-profiles.json
    console.log('📋 Loading profiles from all-profiles.json...');
    let extractedProfiles = new Set();
    
    try {
        const allProfilesData = JSON.parse(fs.readFileSync('./output/all-profiles.json', 'utf8'));
        allProfilesData.forEach(profile => {
            extractedProfiles.add(profile.name);
        });
        console.log(`📦 Found ${extractedProfiles.size} profiles in all-profiles.json`);
    } catch (error) {
        console.error('❌ Error reading all-profiles.json:', error.message);
        return;
    }
    
    // Find missing profiles
    const missingProfiles = [];
    successfulProfiles.forEach(profileName => {
        if (!extractedProfiles.has(profileName)) {
            missingProfiles.push(profileName);
        }
    });
    
    console.log(`\n🎯 ANALYSIS RESULTS:`);
    console.log(`================`);
    console.log(`Profiles with successful sessions: ${successfulProfiles.size}`);
    console.log(`Profiles in all-profiles.json: ${extractedProfiles.size}`);
    console.log(`Missing profiles (successful but not extracted): ${missingProfiles.length}`);
    
    if (missingProfiles.length > 0) {
        console.log(`\n📝 MISSING PROFILES:`);
        console.log(`===================`);
        
        // Group by prefix for better organization
        const groupedProfiles = {};
        missingProfiles.forEach(profile => {
            const prefix = profile.match(/^([a-zA-Z-]+)/)?.[1] || 'other';
            if (!groupedProfiles[prefix]) {
                groupedProfiles[prefix] = [];
            }
            groupedProfiles[prefix].push(profile);
        });
        
        Object.keys(groupedProfiles).sort().forEach(prefix => {
            console.log(`\n${prefix}: ${groupedProfiles[prefix].length} profiles`);
            groupedProfiles[prefix].sort().forEach(profile => {
                console.log(`  - ${profile}`);
            });
        });
        
        // Save results to file
        const outputData = {
            timestamp: new Date().toISOString(),
            summary: {
                totalSuccessfulSessions: successfulProfiles.size,
                profilesInAllProfiles: extractedProfiles.size,
                missingProfiles: missingProfiles.length
            },
            missingProfiles: missingProfiles.sort(),
            groupedMissingProfiles: groupedProfiles
        };
        
        const outputFile = './output/missing-successful-profiles.json';
        fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
        console.log(`\n💾 Results saved to: ${outputFile}`);
        
        // Generate enhanced refresh command
        console.log(`\n🚀 NEXT STEPS:`);
        console.log(`=============`);
        console.log(`To recover these profiles using the enhanced refresh flow:`);
        console.log(``);
        
        // Show commands for different prefixes
        Object.keys(groupedProfiles).sort().forEach(prefix => {
            if (groupedProfiles[prefix].length > 0) {
                console.log(`# For ${prefix} profiles (${groupedProfiles[prefix].length} profiles):`);
                console.log(`npx ppm refresh-missing --prefix ${prefix} --limit 20 --dry-run --headless --proxy-strategy auto`);
                console.log(``);
            }
        });
        
        console.log(`# Or process all missing profiles (careful - this is ${missingProfiles.length} profiles!):`);
        console.log(`npx ppm refresh-missing --all-missing --limit 50 --dry-run --headless --proxy-strategy auto`);
        
    } else {
        console.log(`\n✅ All profiles with successful sessions are already in all-profiles.json!`);
    }
}

// Run the analysis
identifyMissingSuccessfulProfiles().catch(console.error);