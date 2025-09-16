#!/usr/bin/env node

/**
 * Database Schema Enhancement for Geographic Data
 * 
 * This module contains the proposed schema changes to store geographic/proxy data
 * directly in the profile database, along with migration utilities.
 */

import fs from 'fs-extra';
import path from 'path';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Geographic Database Schema Enhancement
 */
export class GeographicDatabaseManager {
    constructor(options = {}) {
        this.baseDir = options.baseDir || './profiles';
        this.dbPath = path.join(this.baseDir, 'profiles.db');
    }

    /**
     * Enhanced schema migration to include geographic data
     */
    async migrateGeographicSchema() {
        return new Promise(async (resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);
            const run = promisify(db.run.bind(db));
            
            try {
                console.log(chalk.blue('🔄 Migrating database schema for geographic data...'));
                
                // Add geographic columns to profiles table
                const profileGeographicColumns = [
                    'proxy_label TEXT',           // e.g., "UK1", "Germany2", "US4"
                    'proxy_country TEXT',         // e.g., "United Kingdom", "Germany", "United States"  
                    'proxy_country_code TEXT',    // e.g., "GB", "DE", "US"
                    'proxy_connection_type TEXT', // e.g., "resident", "datacenter", "mobile"
                    'proxy_host TEXT',            // proxy server host
                    'proxy_type TEXT',            // e.g., "http", "socks5"
                    'creation_batch_id TEXT',     // batch ID when profile was created
                    'creation_proxy_data TEXT',   // JSON with full proxy config from creation
                    'geographic_updated_at DATETIME' // when geographic data was last updated
                ];

                console.log(chalk.yellow('📝 Adding geographic columns to profiles table...'));
                for (const column of profileGeographicColumns) {
                    try {
                        await run(`ALTER TABLE profiles ADD COLUMN ${column}`);
                        console.log(`  ✅ Added column: ${column.split(' ')[0]}`);
                    } catch (error) {
                        if (error.message.includes('duplicate column name')) {
                            console.log(`  ⏭️  Column already exists: ${column.split(' ')[0]}`);
                        } else {
                            console.warn(`  ⚠️  Warning for ${column.split(' ')[0]}: ${error.message}`);
                        }
                    }
                }

                // Add geographic columns to sessions table  
                const sessionGeographicColumns = [
                    'proxy_label_used TEXT',      // proxy label used for this session
                    'proxy_country_used TEXT',    // country of proxy used
                    'proxy_ip_resolved TEXT',     // actual IP address resolved
                    'geographic_session_data TEXT' // JSON with detailed geographic session info
                ];

                console.log(chalk.yellow('📝 Adding geographic columns to sessions table...'));
                for (const column of sessionGeographicColumns) {
                    try {
                        await run(`ALTER TABLE sessions ADD COLUMN ${column}`);
                        console.log(`  ✅ Added column: ${column.split(' ')[0]}`);
                    } catch (error) {
                        if (error.message.includes('duplicate column name')) {
                            console.log(`  ⏭️  Column already exists: ${column.split(' ')[0]}`);
                        } else {
                            console.warn(`  ⚠️  Warning for ${column.split(' ')[0]}: ${error.message}`);
                        }
                    }
                }

                // Create an index for faster geographic queries
                try {
                    await run(`CREATE INDEX IF NOT EXISTS idx_profiles_proxy_country ON profiles(proxy_country)`);
                    await run(`CREATE INDEX IF NOT EXISTS idx_profiles_proxy_label ON profiles(proxy_label)`);
                    await run(`CREATE INDEX IF NOT EXISTS idx_profiles_creation_batch ON profiles(creation_batch_id)`);
                    console.log(chalk.green('📈 Created geographic indexes'));
                } catch (error) {
                    console.warn(`Index creation warning: ${error.message}`);
                }

                await promisify(db.close.bind(db))();
                console.log(chalk.green('✅ Geographic schema migration completed successfully'));
                resolve(true);

            } catch (error) {
                await promisify(db.close.bind(db))();
                console.error(chalk.red(`❌ Schema migration failed: ${error.message}`));
                reject(error);
            }
        });
    }

    /**
     * Query profiles with geographic data
     */
    async queryProfilesWithGeographic() {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);
            
            const query = `
                SELECT 
                    id, name, description, created_at, last_used, session_count,
                    proxy_label, proxy_country, proxy_country_code, proxy_connection_type,
                    proxy_host, proxy_type, creation_batch_id, geographic_updated_at,
                    success_count, failure_count, last_session_status
                FROM profiles 
                ORDER BY created_at DESC
            `;
            
            db.all(query, (err, rows) => {
                db.close();
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }

    /**
     * Update profile with geographic data
     */
    async updateProfileGeographic(profileId, geographicData) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);
            const run = promisify(db.run.bind(db));
            
            const query = `
                UPDATE profiles 
                SET proxy_label = ?, 
                    proxy_country = ?, 
                    proxy_country_code = ?, 
                    proxy_connection_type = ?,
                    proxy_host = ?, 
                    proxy_type = ?, 
                    creation_batch_id = ?,
                    creation_proxy_data = ?,
                    geographic_updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            
            db.run(query, [
                geographicData.proxyLabel,
                geographicData.proxyCountry, 
                geographicData.proxyCountryCode,
                geographicData.proxyConnectionType,
                geographicData.proxyHost,
                geographicData.proxyType,
                geographicData.creationBatchId,
                JSON.stringify(geographicData.fullProxyData || {}),
                profileId
            ], function(err) {
                db.close();
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ changes: this.changes, lastID: this.lastID });
            });
        });
    }

    /**
     * Get geographic statistics from database
     */
    async getGeographicStatistics() {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);
            
            const queries = {
                countryDistribution: `
                    SELECT proxy_country, COUNT(*) as profile_count,
                           AVG(success_count) as avg_success,
                           AVG(failure_count) as avg_failure
                    FROM profiles 
                    WHERE proxy_country IS NOT NULL 
                    GROUP BY proxy_country 
                    ORDER BY profile_count DESC
                `,
                
                proxyLabelDistribution: `
                    SELECT proxy_label, proxy_country, COUNT(*) as usage_count,
                           AVG(success_count) as avg_success
                    FROM profiles 
                    WHERE proxy_label IS NOT NULL 
                    GROUP BY proxy_label, proxy_country 
                    ORDER BY usage_count DESC
                `,
                
                connectionTypeStats: `
                    SELECT proxy_connection_type, proxy_country, COUNT(*) as count
                    FROM profiles 
                    WHERE proxy_connection_type IS NOT NULL 
                    GROUP BY proxy_connection_type, proxy_country 
                    ORDER BY count DESC
                `,
                
                geographicCoverage: `
                    SELECT 
                        COUNT(*) as total_profiles,
                        COUNT(proxy_country) as profiles_with_geo,
                        ROUND(100.0 * COUNT(proxy_country) / COUNT(*), 2) as coverage_percent
                    FROM profiles
                `
            };
            
            const results = {};
            const promises = Object.entries(queries).map(([key, query]) => {
                return new Promise((resolveQuery, rejectQuery) => {
                    db.all(query, (err, rows) => {
                        if (err) {
                            rejectQuery(err);
                            return;
                        }
                        results[key] = rows;
                        resolveQuery();
                    });
                });
            });
            
            Promise.all(promises)
                .then(() => {
                    db.close();
                    resolve(results);
                })
                .catch(err => {
                    db.close();
                    reject(err);
                });
        });
    }

    /**
     * Check current schema state
     */
    async checkSchemaState() {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);
            
            // Check if geographic columns exist
            db.all("PRAGMA table_info(profiles)", (err, profilesInfo) => {
                if (err) {
                    db.close();
                    reject(err);
                    return;
                }
                
                db.all("PRAGMA table_info(sessions)", (err, sessionsInfo) => {
                    db.close();
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const profileColumns = profilesInfo.map(col => col.name);
                    const sessionColumns = sessionsInfo.map(col => col.name);
                    
                    const geographicProfileColumns = [
                        'proxy_label', 'proxy_country', 'proxy_country_code', 
                        'proxy_connection_type', 'proxy_host', 'proxy_type', 
                        'creation_batch_id', 'creation_proxy_data', 'geographic_updated_at'
                    ];
                    
                    const geographicSessionColumns = [
                        'proxy_label_used', 'proxy_country_used', 
                        'proxy_ip_resolved', 'geographic_session_data'
                    ];
                    
                    const schemaState = {
                        profilesTable: {
                            totalColumns: profileColumns.length,
                            geographicColumns: geographicProfileColumns.filter(col => profileColumns.includes(col)),
                            missingColumns: geographicProfileColumns.filter(col => !profileColumns.includes(col))
                        },
                        sessionsTable: {
                            totalColumns: sessionColumns.length,
                            geographicColumns: geographicSessionColumns.filter(col => sessionColumns.includes(col)),
                            missingColumns: geographicSessionColumns.filter(col => !sessionColumns.includes(col))
                        }
                    };
                    
                    resolve(schemaState);
                });
            });
        });
    }
}

// CLI usage for testing and migration
async function main() {
    const geoDBManager = new GeographicDatabaseManager();
    
    try {
        if (process.argv.includes('--check-schema')) {
            console.log(chalk.blue('🔍 Checking current schema state...'));
            const schemaState = await geoDBManager.checkSchemaState();
            
            console.log(chalk.yellow('\n📊 PROFILES TABLE:'));
            console.log(`Total columns: ${schemaState.profilesTable.totalColumns}`);
            console.log(`Geographic columns present: ${schemaState.profilesTable.geographicColumns.length}`);
            if (schemaState.profilesTable.geographicColumns.length > 0) {
                console.log(`  Present: ${schemaState.profilesTable.geographicColumns.join(', ')}`);
            }
            if (schemaState.profilesTable.missingColumns.length > 0) {
                console.log(chalk.red(`  Missing: ${schemaState.profilesTable.missingColumns.join(', ')}`));
            }
            
            console.log(chalk.yellow('\n📊 SESSIONS TABLE:'));
            console.log(`Total columns: ${schemaState.sessionsTable.totalColumns}`);
            console.log(`Geographic columns present: ${schemaState.sessionsTable.geographicColumns.length}`);
            if (schemaState.sessionsTable.geographicColumns.length > 0) {
                console.log(`  Present: ${schemaState.sessionsTable.geographicColumns.join(', ')}`);
            }
            if (schemaState.sessionsTable.missingColumns.length > 0) {
                console.log(chalk.red(`  Missing: ${schemaState.sessionsTable.missingColumns.join(', ')}`));
            }
            
        } else if (process.argv.includes('--migrate')) {
            await geoDBManager.migrateGeographicSchema();
            
        } else if (process.argv.includes('--stats')) {
            console.log(chalk.blue('📈 Fetching geographic statistics...'));
            const stats = await geoDBManager.getGeographicStatistics();
            
            console.log(chalk.green('\n🌍 GEOGRAPHIC COVERAGE:'));
            const coverage = stats.geographicCoverage[0];
            console.log(`Total profiles: ${coverage.total_profiles}`);
            console.log(`Profiles with geographic data: ${coverage.profiles_with_geo}`);
            console.log(`Coverage: ${coverage.coverage_percent}%`);
            
            console.log(chalk.green('\n🗺️  COUNTRY DISTRIBUTION:'));
            stats.countryDistribution.forEach(row => {
                console.log(`${row.proxy_country}: ${row.profile_count} profiles (avg success: ${row.avg_success?.toFixed(1) || 0})`);
            });
            
        } else {
            console.log(chalk.blue('🗄️  Geographic Database Schema Manager'));
            console.log(chalk.blue('='.repeat(40)));
            console.log('Usage:');
            console.log('  --check-schema  Check current schema state');
            console.log('  --migrate       Run geographic schema migration'); 
            console.log('  --stats         Show geographic statistics from DB');
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