#!/usr/bin/env node

/**
 * Analyze Missing Credentials - Identify profiles without valid token traffic
 * 
 * This script compares the profiles database with extracted credentials to find
 * profiles that need the enhanced refresh flow (extension install detection + signup).
 */

import { ProfileManager } from './src/ProfileManager.js';
import { RequestExtractor } from './src/RequestExtractor.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

async function analyzeProfiles() {
    console.log(chalk.blue('🔍 Analyzing profiles for missing credentials...\n'));
    
    const profileManager = new ProfileManager();
    const extractor = new RequestExtractor({ quiet: true });
    
    // Get all profiles from database
    const allProfiles = await profileManager.listProfiles();
    console.log(chalk.cyan(`📊 Total profiles in database: ${allProfiles.length}`));
    
    // Get profiles with valid credentials (from output/all-profiles.json if exists)
    let profilesWithCredentials = [];
    const credentialsFile = './output/all-profiles.json';
    
    if (await fs.pathExists(credentialsFile)) {
        try {
            const credentialsData = await fs.readJson(credentialsFile);
            profilesWithCredentials = credentialsData.map(p => p.name);
            console.log(chalk.green(`✅ Profiles with valid credentials: ${profilesWithCredentials.length}`));
        } catch (error) {
            console.log(chalk.yellow(`⚠️  Could not read credentials file: ${error.message}`));
        }
    } else {
        console.log(chalk.yellow(`⚠️  Credentials file not found, will analyze from captured requests...`));
        
        // Fallback: analyze captured requests directory
        const capturedDir = './captured-requests';
        if (await fs.pathExists(capturedDir)) {
            const files = await fs.readdir(capturedDir);
            const exportFiles = files.filter(f => f.includes('-export-') && f.endsWith('.jsonl'));
            
            for (const file of exportFiles) {
                const match = file.match(/^([^-]+(?:-[^-]+)*)-export-/);
                if (match) {
                    const profileName = match[1];
                    try {
                        // Quick validation check
                        const headerResult = await extractor.generateHeadersObject(profileName, { quiet: true });
                        if (headerResult.extensionHeaders.authorization) {
                            profilesWithCredentials.push(profileName);
                        }
                    } catch (error) {
                        // Profile failed validation, skip
                    }
                }
            }
            
            // Remove duplicates
            profilesWithCredentials = [...new Set(profilesWithCredentials)];
            console.log(chalk.green(`✅ Profiles with valid credentials (analyzed): ${profilesWithCredentials.length}`));
        }
    }
    
    // Find profiles without credentials
    const profilesWithoutCredentials = allProfiles.filter(profile => 
        !profilesWithCredentials.includes(profile.name)
    );
    
    console.log(chalk.red(`❌ Profiles WITHOUT valid credentials: ${profilesWithoutCredentials.length}`));
    console.log(chalk.yellow(`📈 Missing credential rate: ${((profilesWithoutCredentials.length / allProfiles.length) * 100).toFixed(1)}%`));
    
    // Analyze profile patterns
    const missingByPrefix = {};
    const missingByAge = {
        recent: [], // Last 7 days
        medium: [], // 7-30 days
        old: []     // 30+ days
    };
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    for (const profile of profilesWithoutCredentials) {
        // Analyze by prefix
        const prefix = profile.name.match(/^([a-zA-Z]+)/)?.[1] || 'other';
        missingByPrefix[prefix] = (missingByPrefix[prefix] || 0) + 1;
        
        // Analyze by age
        const createdAt = new Date(profile.createdAt);
        if (createdAt > sevenDaysAgo) {
            missingByAge.recent.push(profile);
        } else if (createdAt > thirtyDaysAgo) {
            missingByAge.medium.push(profile);
        } else {
            missingByAge.old.push(profile);
        }
    }
    
    // Display analysis
    console.log(chalk.blue('\n📊 Missing Credentials Analysis:'));
    console.log(chalk.blue('================================\n'));
    
    console.log(chalk.cyan('By Prefix:'));
    Object.entries(missingByPrefix)
        .sort(([,a], [,b]) => b - a)
        .forEach(([prefix, count]) => {
            console.log(`  ${prefix}: ${count} profiles`);
        });
    
    console.log(chalk.cyan('\nBy Age:'));
    console.log(`  Recent (< 7 days): ${missingByAge.recent.length} profiles`);
    console.log(`  Medium (7-30 days): ${missingByAge.medium.length} profiles`);
    console.log(`  Old (30+ days): ${missingByAge.old.length} profiles`);
    
    // Show some examples
    console.log(chalk.cyan('\nExample profiles without credentials:'));
    profilesWithoutCredentials.slice(0, 10).forEach((profile, i) => {
        const age = Math.floor((now - new Date(profile.createdAt)) / (24 * 60 * 60 * 1000));
        console.log(`  ${i+1}. ${profile.name} (${age} days old)`);
    });
    
    if (profilesWithoutCredentials.length > 10) {
        console.log(`  ... and ${profilesWithoutCredentials.length - 10} more`);
    }
    
    // Save results for enhanced refresh flow
    const analysisResult = {
        timestamp: new Date().toISOString(),
        totalProfiles: allProfiles.length,
        profilesWithCredentials: profilesWithCredentials.length,
        profilesWithoutCredentials: profilesWithoutCredentials.length,
        missingCredentialRate: (profilesWithoutCredentials.length / allProfiles.length) * 100,
        profilesNeedingRefresh: profilesWithoutCredentials.map(p => ({
            name: p.name,
            id: p.id,
            createdAt: p.createdAt,
            lastUsed: p.lastUsed,
            sessionCount: p.sessionCount
        })),
        analysis: {
            byPrefix: missingByPrefix,
            byAge: {
                recent: missingByAge.recent.length,
                medium: missingByAge.medium.length,
                old: missingByAge.old.length
            }
        }
    };
    
    const outputDir = './output';
    await fs.ensureDir(outputDir);
    const analysisFile = path.join(outputDir, 'missing-credentials-analysis.json');
    await fs.writeJson(analysisFile, analysisResult, { spaces: 2 });
    
    console.log(chalk.green(`\n✅ Analysis saved to: ${analysisFile}`));
    console.log(chalk.blue('\n💡 Next Steps:'));
    console.log('  1. Use enhanced refresh flow on profiles without credentials');
    console.log('  2. Detect extension install vs signup flow automatically');
    console.log('  3. Execute appropriate flow based on detection');
    
    await profileManager.close();
    
    return analysisResult;
}

// Run analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    analyzeProfiles().catch(error => {
        console.error(chalk.red('❌ Analysis failed:'), error.message);
        process.exit(1);
    });
}

export { analyzeProfiles };