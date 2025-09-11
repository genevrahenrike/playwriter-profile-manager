#!/usr/bin/env node

/**
 * Migration script to convert timestamp-based profile names to autoincremental numbering
 * 
 * Example conversions:
 * auto-2025-09-11T02-37-46-464Z-01 -> auto1
 * auto-2025-09-11T02-38-18-236Z-02 -> auto2
 * etc.
 */

import path from 'path';
import fs from 'fs-extra';
import { ProfileManager } from './src/ProfileManager.js';
import chalk from 'chalk';

const migrateProfileNames = async () => {
    const profileManager = new ProfileManager();
    
    console.log(chalk.cyan('🔄 Starting profile name migration...'));
    
    try {
        // Get all profiles
        const profiles = await profileManager.listProfiles();
        
        // Find profiles with timestamp-based names (format: prefix-timestamp-number)
        const timestampProfiles = profiles.filter(p => {
            return p.name && p.name.match(/^(.*?)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(\d+)$/);
        });
        
        if (timestampProfiles.length === 0) {
            console.log(chalk.green('✅ No timestamp-based profiles found. Migration not needed.'));
            return;
        }
        
        console.log(chalk.yellow(`📋 Found ${timestampProfiles.length} profiles with timestamp-based names`));
        
        // Group by prefix
        const profilesByPrefix = new Map();
        timestampProfiles.forEach(profile => {
            const match = profile.name.match(/^(.*?)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(\d+)$/);
            if (match) {
                const prefix = match[1];
                const oldIndex = parseInt(match[2], 10);
                
                if (!profilesByPrefix.has(prefix)) {
                    profilesByPrefix.set(prefix, []);
                }
                profilesByPrefix.get(prefix).push({
                    profile,
                    oldIndex,
                    oldName: profile.name
                });
            }
        });
        
        // Process each prefix group
        for (const [prefix, prefixProfiles] of profilesByPrefix) {
            console.log(chalk.blue(`\n📁 Processing prefix: ${prefix}`));
            
            // Sort by creation time (oldest first) to maintain chronological order
            prefixProfiles.sort((a, b) => {
                const timeA = new Date(a.profile.createdAt || 0);
                const timeB = new Date(b.profile.createdAt || 0);
                return timeA - timeB;
            });
            
            // Find existing autoincremental profiles for this prefix to avoid conflicts
            const existingAutoProfiles = profiles.filter(p => {
                return p.name && p.name.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+$`));
            });
            
            const existingNumbers = existingAutoProfiles.map(p => {
                const match = p.name.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`));
                return match ? parseInt(match[1], 10) : 0;
            });
            
            const startIndex = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
            
            console.log(chalk.dim(`   Starting index: ${startIndex} (${existingNumbers.length} existing autoincremental profiles)`));
            
            // Rename profiles in chronological order
            let newIndex = startIndex;
            for (const { profile, oldName } of prefixProfiles) {
                const newName = `${prefix}${newIndex}`;
                
                try {
                    console.log(chalk.gray(`   ${oldName} -> ${newName}`));
                    await profileManager.renameProfile(profile.id, newName);
                    
                    // Also rename any request capture files
                    await renameRequestCaptureFiles(oldName, newName);
                    
                    newIndex++;
                } catch (error) {
                    console.error(chalk.red(`   ❌ Failed to rename ${oldName}: ${error.message}`));
                }
            }
            
            console.log(chalk.green(`   ✅ Renamed ${prefixProfiles.length} profiles for prefix "${prefix}"`));
        }
        
        console.log(chalk.cyan('\\n🎉 Profile name migration completed!'));
        
    } catch (error) {
        console.error(chalk.red(`❌ Migration failed: ${error.message}`));
        process.exit(1);
    } finally {
        await profileManager.close();
    }
};

/**
 * Rename request capture files to match new profile name
 */
const renameRequestCaptureFiles = async (oldProfileName, newProfileName) => {
    const capturedRequestsDir = './captured-requests';
    
    if (!await fs.pathExists(capturedRequestsDir)) {
        return;
    }
    
    try {
        const files = await fs.readdir(capturedRequestsDir);
        const oldPrefix = oldProfileName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
        const newPrefix = newProfileName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
        
        for (const file of files) {
            if (file.startsWith(oldPrefix)) {
                const newFileName = file.replace(oldPrefix, newPrefix);
                const oldFilePath = path.join(capturedRequestsDir, file);
                const newFilePath = path.join(capturedRequestsDir, newFileName);
                
                try {
                    await fs.rename(oldFilePath, newFilePath);
                    console.log(chalk.dim(`      📁 ${file} -> ${newFileName}`));
                } catch (error) {
                    console.warn(chalk.yellow(`      ⚠️  Could not rename file ${file}: ${error.message}`));
                }
            }
        }
    } catch (error) {
        console.warn(chalk.yellow(`   ⚠️  Could not process request capture files: ${error.message}`));
    }
};

// Run migration if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    migrateProfileNames();
}

export { migrateProfileNames };