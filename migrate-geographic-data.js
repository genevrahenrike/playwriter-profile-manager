#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { GeographicAnalyzer } from './analyze-profile-geography.js';
import { GeographicDatabaseManager } from './enhance-geographic-schema.js';

/**
 * Geographic Data Migration Tool
 * 
 * Backfills geographic data from batch automation logs into the profile database.
 * Uses the analysis from batch logs to populate the new geographic columns.
 */
class GeographicDataMigrator {
    constructor(options = {}) {
        this.analyzer = new GeographicAnalyzer(options);
        this.dbManager = new GeographicDatabaseManager(options);
        this.proxiesDir = './proxies';
        
        // Enhanced country mapping
        this.labelToCountryData = {
            'US': { name: 'United States', code: 'US' },
            'UK': { name: 'United Kingdom', code: 'GB' }, 
            'Germany': { name: 'Germany', code: 'DE' },
            'France': { name: 'France', code: 'FR' },
            'Australia': { name: 'Australia', code: 'AU' },
            'Canada': { name: 'Canada', code: 'CA' },
            'Japan': { name: 'Japan', code: 'JP' },
            'Netherlands': { name: 'Netherlands', code: 'NL' },
            'Italy': { name: 'Italy', code: 'IT' },
            'Spain': { name: 'Spain', code: 'ES' },
            'nl': { name: 'Netherlands', code: 'NL' },
            'se': { name: 'Sweden', code: 'SE' },
            'amsterdam': { name: 'Netherlands', code: 'NL' },
            'atlanta': { name: 'United States', code: 'US' },
            'chicago': { name: 'United States', code: 'US' },
            'dallas': { name: 'United States', code: 'US' },
            'los': { name: 'United States', code: 'US' },
            'new': { name: 'United States', code: 'US' },
            'phoenix': { name: 'United States', code: 'US' },
            'san': { name: 'United States', code: 'US' }
        };
    }

    /**
     * Extract enhanced country data from proxy label
     */
    extractCountryData(proxyLabel) {
        if (!proxyLabel) return { name: 'Unknown', code: null };
        
        // Handle labels like "UK1", "Germany2", "US1-DC", etc.
        const countryMatch = proxyLabel.match(/^([A-Za-z]+)/);
        if (countryMatch) {
            const countryPrefix = countryMatch[1];
            return this.labelToCountryData[countryPrefix] || { name: countryPrefix, code: null };
        }
        return { name: 'Unknown', code: null };
    }

    /**
     * Extract connection type from proxy label
     */
    extractConnectionType(proxyLabel) {
        if (!proxyLabel) return null;
        
        // Check for datacenter suffix
        if (proxyLabel.includes('-DC')) {
            return 'datacenter';
        }
        
        // Default to resident for standard labels
        return 'resident';
    }

    /**
     * Load proxy configuration for additional data enrichment
     */
    async loadProxyConfigMap() {
        const httpProxiesV2File = path.join(this.proxiesDir, 'http.proxies.v2.json');
        const httpProxiesFile = path.join(this.proxiesDir, 'http.proxies.json');
        
        try {
            let proxies = [];
            
            if (await fs.pathExists(httpProxiesV2File)) {
                const data = await fs.readJson(httpProxiesV2File);
                proxies = Array.isArray(data) ? data : [];
            } else if (await fs.pathExists(httpProxiesFile)) {
                const data = await fs.readJson(httpProxiesFile);
                proxies = Array.isArray(data) ? data : [];
            }
            
            // Create a map from country to proxy details
            const proxyMap = {};
            proxies.forEach(proxy => {
                const key = proxy.customName || proxy.country;
                if (key) {
                    proxyMap[key] = {
                        host: proxy.host,
                        port: proxy.port,
                        connectionType: proxy.connectionType || 'unknown',
                        country: proxy.country,
                        customName: proxy.customName
                    };
                }
            });
            
            return proxyMap;
            
        } catch (error) {
            console.warn(`⚠️  Could not load proxy config: ${error.message}`);
            return {};
        }
    }

    /**
     * Migrate geographic data from batch logs to database
     */
    async migrateGeographicData(options = {}) {
        const dryRun = options.dryRun || false;
        const limit = options.limit || null;
        
        console.log(chalk.blue('🔄 Starting geographic data migration...'));
        if (dryRun) {
            console.log(chalk.yellow('🧪 DRY RUN MODE - No database changes will be made'));
        }
        
        try {
            // Load batch data and proxy configuration
            const { batchData, profileToProxy } = await this.analyzer.analyzeBatchLogs();
            const proxyConfigMap = await this.loadProxyConfigMap();
            
            console.log(chalk.green(`📊 Found geographic data for ${profileToProxy.size} profiles`));
            
            let updateCount = 0;
            let errorCount = 0;
            const updates = [];
            
            // Process each profile with batch data
            for (const [profileName, proxyData] of profileToProxy.entries()) {
                if (limit && updateCount >= limit) {
                    console.log(chalk.yellow(`🚫 Reached limit of ${limit} updates`));
                    break;
                }
                
                const countryData = this.extractCountryData(proxyData.proxyLabel);
                const connectionType = this.extractConnectionType(proxyData.proxyLabel);
                
                // Get additional proxy details from config
                const proxyConfig = proxyConfigMap[countryData.name] || 
                                  proxyConfigMap[proxyData.country] || {};
                
                const geographicData = {
                    proxyLabel: proxyData.proxyLabel,
                    proxyCountry: countryData.name,
                    proxyCountryCode: countryData.code,
                    proxyConnectionType: connectionType,
                    proxyHost: proxyConfig.host || null,
                    proxyType: proxyData.proxyType || 'http',
                    creationBatchId: proxyData.batchId,
                    fullProxyData: {
                        originalData: proxyData,
                        configData: proxyConfig,
                        timestamp: proxyData.timestamp,
                        success: proxyData.success
                    }
                };
                
                updates.push({
                    profileName,
                    geographicData
                });
                
                console.log(`📍 ${profileName}: ${proxyData.proxyLabel} -> ${countryData.name} (${countryData.code})`);
                updateCount++;
            }
            
            if (dryRun) {
                console.log(chalk.yellow(`\n🧪 DRY RUN SUMMARY:`));
                console.log(`Would update ${updates.length} profiles with geographic data`);
                
                // Show sample updates
                const sampleUpdates = updates.slice(0, 5);
                console.log(chalk.cyan('\n📋 Sample updates:'));
                sampleUpdates.forEach(update => {
                    const geo = update.geographicData;
                    console.log(`  ${update.profileName}: ${geo.proxyLabel} -> ${geo.proxyCountry} (${geo.proxyConnectionType})`);
                });
                
                if (updates.length > 5) {
                    console.log(`  ... and ${updates.length - 5} more`);
                }
                
            } else {
                console.log(chalk.blue(`\n💾 Applying ${updates.length} database updates...`));
                
                // Get profile IDs from database first
                const profiles = await this.dbManager.queryProfilesWithGeographic();
                const profileNameToId = {};
                profiles.forEach(profile => {
                    profileNameToId[profile.name] = profile.id;
                });
                
                // Apply updates to database
                for (const update of updates) {
                    const profileId = profileNameToId[update.profileName];
                    if (!profileId) {
                        console.warn(`⚠️  Profile not found in database: ${update.profileName}`);
                        errorCount++;
                        continue;
                    }
                    
                    try {
                        await this.dbManager.updateProfileGeographic(profileId, update.geographicData);
                        console.log(`  ✅ Updated ${update.profileName}`);
                    } catch (error) {
                        console.error(`  ❌ Failed to update ${update.profileName}: ${error.message}`);
                        errorCount++;
                    }
                }
                
                console.log(chalk.green(`\n🎉 Migration completed!`));
                console.log(`✅ Successfully updated: ${updateCount - errorCount} profiles`);
                if (errorCount > 0) {
                    console.log(`❌ Errors: ${errorCount} profiles`);
                }
            }
            
            return {
                totalUpdates: updateCount,
                errors: errorCount,
                success: updateCount - errorCount,
                profilesWithGeo: profileToProxy.size
            };
            
        } catch (error) {
            console.error(chalk.red(`❌ Migration failed: ${error.message}`));
            throw error;
        }
    }

    /**
     * Verify migration results
     */
    async verifyMigration() {
        console.log(chalk.blue('🔍 Verifying migration results...'));
        
        try {
            const stats = await this.dbManager.getGeographicStatistics();
            const coverage = stats.geographicCoverage[0];
            
            console.log(chalk.green('\n📈 MIGRATION VERIFICATION:'));
            console.log(`Total profiles: ${coverage.total_profiles}`);
            console.log(`Profiles with geographic data: ${coverage.profiles_with_geo}`);
            console.log(`Coverage: ${coverage.coverage_percent}%`);
            
            if (coverage.profiles_with_geo > 0) {
                console.log(chalk.green('\n🌍 Country distribution:'));
                stats.countryDistribution.forEach(row => {
                    const avgSuccess = row.avg_success ? row.avg_success.toFixed(1) : '0';
                    console.log(`  ${row.proxy_country}: ${row.profile_count} profiles (avg success: ${avgSuccess})`);
                });
                
                console.log(chalk.green('\n🔗 Connection type distribution:'));
                stats.connectionTypeStats.forEach(row => {
                    console.log(`  ${row.proxy_connection_type} (${row.proxy_country}): ${row.count} profiles`);
                });
            }
            
            return coverage;
            
        } catch (error) {
            console.error(chalk.red(`❌ Verification failed: ${error.message}`));
            throw error;
        }
    }
}

// CLI usage
async function main() {
    const migrator = new GeographicDataMigrator();
    
    try {
        if (process.argv.includes('--dry-run')) {
            await migrator.migrateGeographicData({ dryRun: true });
            
        } else if (process.argv.includes('--migrate')) {
            const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
            const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
            
            await migrator.migrateGeographicData({ dryRun: false, limit });
            
        } else if (process.argv.includes('--verify')) {
            await migrator.verifyMigration();
            
        } else {
            console.log(chalk.blue('🗄️  Geographic Data Migration Tool'));
            console.log(chalk.blue('='.repeat(35)));
            console.log('Usage:');
            console.log('  --dry-run           Preview migration without making changes');
            console.log('  --migrate           Migrate geographic data to database');
            console.log('  --migrate --limit=N Migrate only N profiles (for testing)');
            console.log('  --verify            Verify migration results');
            console.log('');
            console.log('Examples:');
            console.log('  node migrate-geographic-data.js --dry-run');
            console.log('  node migrate-geographic-data.js --migrate --limit=10');
            console.log('  node migrate-geographic-data.js --migrate');
            console.log('  node migrate-geographic-data.js --verify');
        }
        
    } catch (error) {
        console.error(chalk.red(`❌ Operation failed: ${error.message}`));
        process.exit(1);
    }
}

// Support both import and direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}