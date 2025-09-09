#!/usr/bin/env node

/**
 * Export CLI - Command line interface for exporting generated user data
 */

import { Command } from 'commander';
import { AutofillHookSystem } from './AutofillHookSystem.js';
import { RandomDataGenerator } from './RandomDataGenerator.js';
import fs from 'fs-extra';
import path from 'path';

const program = new Command();

program
    .name('ppm-export')
    .description('Export generated autofill user data to various password manager formats')
    .version('1.0.0');

program
    .command('list')
    .description('List all generated user data records')
    .option('-l, --limit <number>', 'Limit number of records to show', '10')
    .action(async (options) => {
        try {
            const generator = new RandomDataGenerator({
                enableTracking: true,
                trackingDbPath: './profiles/data/generated_names.db'
            });
            
            const records = generator.getAllUserDataRecords();
            const limit = parseInt(options.limit);
            
            console.log(`📊 Generated User Data Records (showing ${Math.min(limit, records.length)} of ${records.length}):`);
            console.log('=' .repeat(80));
            
            records.slice(0, limit).forEach((record, index) => {
                console.log(`${index + 1}. ${record.full_name} (${record.email})`);
                console.log(`   Site: ${record.site_url || 'N/A'}`);
                console.log(`   Hook: ${record.hook_name}`);
                console.log(`   Created: ${record.created_at}`);
                console.log(`   Exported: ${record.exported_at || 'Not exported'}`);
                console.log();
            });
            
            generator.close();
        } catch (error) {
            console.error('❌ Error listing records:', error.message);
            process.exit(1);
        }
    });

program
    .command('export')
    .description('Export user data to password manager format')
    .argument('<format>', 'Export format (csv, chrome, apple, 1password)')
    .option('-o, --output <path>', 'Output file path')
    .option('--enable-tracking', 'Enable tracking if not already enabled')
    .action(async (format, options) => {
        try {
            const trackingEnabled = options.enableTracking || await checkTrackingEnabled();
            
            if (!trackingEnabled) {
                console.log('⚠️  Tracking is not enabled. No data to export.');
                console.log('💡 To enable tracking, use --enable-tracking flag or configure AutofillHookSystem with enableTracking: true');
                process.exit(1);
            }
            
            const autofillSystem = new AutofillHookSystem({
                enableTracking: true,
                trackingDbPath: './profiles/data/generated_names.db'
            });
            
            console.log(`📤 Exporting user data in ${format} format...`);
            
            const outputPath = await autofillSystem.exportUserData(format, options.output);
            
            if (outputPath) {
                console.log(`✅ Export completed successfully!`);
                console.log(`📄 File saved to: ${outputPath}`);
                
                // Show file info
                const stats = await fs.stat(outputPath);
                console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
                
                // Show sample of exported data
                if (format.toLowerCase() === 'csv' || format.toLowerCase() === 'chrome') {
                    const content = await fs.readFile(outputPath, 'utf-8');
                    const lines = content.split('\n');
                    console.log(`📋 Sample (first 3 lines):`);
                    lines.slice(0, 3).forEach((line, i) => {
                        if (line.trim()) {
                            console.log(`   ${i + 1}: ${line.length > 80 ? line.substring(0, 77) + '...' : line}`);
                        }
                    });
                }
            }
            
            autofillSystem.cleanup();
            
        } catch (error) {
            console.error('❌ Export failed:', error.message);
            process.exit(1);
        }
    });

program
    .command('clear')
    .description('Clear exported flag from records (allows re-export)')
    .option('--confirm', 'Confirm the operation')
    .action(async (options) => {
        if (!options.confirm) {
            console.log('⚠️  This will mark all records as not exported, allowing them to be exported again.');
            console.log('💡 Use --confirm flag to proceed.');
            return;
        }
        
        try {
            const generator = new RandomDataGenerator({
                enableTracking: true,
                trackingDbPath: './profiles/data/generated_names.db'
            });
            
            const db = generator.db;
            const stmt = db.prepare('UPDATE user_data_exports SET exported_at = NULL');
            const result = stmt.run();
            
            console.log(`✅ Cleared export flag from ${result.changes} records`);
            
            generator.close();
        } catch (error) {
            console.error('❌ Error clearing export flags:', error.message);
            process.exit(1);
        }
    });

program
    .command('stats')
    .description('Show statistics about generated data')
    .action(async () => {
        try {
            const generator = new RandomDataGenerator({
                enableTracking: true,
                trackingDbPath: './profiles/data/generated_names.db'
            });
            
            const stats = generator.getStatistics();
            const records = generator.getAllUserDataRecords();
            
            console.log('📊 User Data Generation Statistics:');
            console.log('=' .repeat(50));
            console.log(`Tracking enabled: ${stats.trackingEnabled}`);
            
            if (stats.trackingEnabled) {
                console.log(`Total user records: ${records.length}`);
                console.log(`Exported records: ${records.filter(r => r.exported_at).length}`);
                console.log(`Pending export: ${records.filter(r => !r.exported_at).length}`);
                
                // Group by hook
                const byHook = records.reduce((acc, record) => {
                    acc[record.hook_name] = (acc[record.hook_name] || 0) + 1;
                    return acc;
                }, {});
                
                console.log('\nRecords by hook:');
                Object.entries(byHook).forEach(([hook, count]) => {
                    console.log(`  ${hook}: ${count}`);
                });
                
                // Group by email provider
                const byProvider = records.reduce((acc, record) => {
                    acc[record.email_provider] = (acc[record.email_provider] || 0) + 1;
                    return acc;
                }, {});
                
                console.log('\nRecords by email provider:');
                Object.entries(byProvider).forEach(([provider, count]) => {
                    console.log(`  ${provider}: ${count}`);
                });
                
                console.log(`\nDatabase: ${stats.databasePath}`);
            }
            
            generator.close();
        } catch (error) {
            console.error('❌ Error getting statistics:', error.message);
            process.exit(1);
        }
    });

async function checkTrackingEnabled() {
    try {
        const dbPath = './profiles/data/generated_names.db';
        return await fs.pathExists(dbPath);
    } catch (error) {
        return false;
    }
}

program.parse();
