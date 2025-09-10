#!/usr/bin/env node

import { ProfileManager } from './src/ProfileManager.js';

async function recoverProfiles() {
    const profileManager = new ProfileManager();
    await profileManager.initPromise;
    
    console.log('🔧 Recovering missing viq profiles...');
    
    // Template profile to clone from
    const templateProfile = 'vidiq-clean';
    
    // Missing profiles that need to be recreated
    const missingProfiles = ['viq3', 'viq4', 'viq5', 'viq6', 'viq7', 'viq8', 'viq9', 'viq10'];
    
    for (const profileName of missingProfiles) {
        try {
            // Check if profile already exists
            try {
                await profileManager.getProfile(profileName);
                console.log(`✓ Profile ${profileName} already exists, skipping...`);
                continue;
            } catch (error) {
                // Profile doesn't exist, continue with creation
            }
            
            console.log(`🔄 Creating profile: ${profileName}`);
            
            // Create the profile
            const newProfile = await profileManager.createProfile(profileName, {
                description: `Template instance: ${profileName} (from ${templateProfile})`,
                browserType: 'chromium'
            });
            
            // Copy template data if it exists
            const template = await profileManager.getProfile(templateProfile);
            const templateDataDir = `./profiles/data/${template.id}`;
            const newDataDir = newProfile.userDataDir;
            
            try {
                const fs = await import('fs-extra');
                if (await fs.pathExists(templateDataDir)) {
                    await fs.copy(templateDataDir, newDataDir);
                    console.log(`  📁 Copied template data for ${profileName}`);
                } else {
                    console.log(`  ⚠️  Template data directory not found, creating empty profile`);
                }
            } catch (copyError) {
                console.log(`  ⚠️  Could not copy template data: ${copyError.message}`);
            }
            
            console.log(`✅ Profile ${profileName} created successfully`);
            
        } catch (error) {
            console.error(`❌ Failed to create profile ${profileName}: ${error.message}`);
        }
    }
    
    console.log('\n📊 Recovery complete! Listing all profiles:');
    const profiles = await profileManager.listProfiles();
    profiles.forEach(profile => {
        console.log(`  • ${profile.name} (${profile.browserType})`);
    });
    
    await profileManager.close();
}

recoverProfiles().catch(console.error);