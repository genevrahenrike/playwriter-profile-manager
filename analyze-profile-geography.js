#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Geographic Profile Analysis Tool
 * 
 * Analyzes profile distribution by geographic region based on proxy usage
 * from batch automation logs and provides insights into regional distribution.
 */
class GeographicAnalyzer {
    constructor(options = {}) {
        this.baseDir = options.baseDir || './profiles';
        this.dbPath = path.join(this.baseDir, 'profiles.db');
        this.automationResultsDir = './automation-results';
        this.proxiesDir = './proxies';
        
        // Country mapping from proxy labels to regions
        this.labelToCountry = {
            'US': 'United States',
            'UK': 'United Kingdom', 
            'Germany': 'Germany',
            'France': 'France',
            'Canada': 'Canada',
            'Australia': 'Australia',
            'Japan': 'Japan',
            'Netherlands': 'Netherlands',
            'Italy': 'Italy',
            'Spain': 'Spain'
        };
    }

    /**
     * Extract country from proxy label
     */
    extractCountryFromProxyLabel(proxyLabel) {
        if (!proxyLabel) return 'Unknown';
        
        // Handle labels like "UK1", "Germany2", "US1-DC", etc.
        const countryMatch = proxyLabel.match(/^([A-Za-z]+)/);
        if (countryMatch) {
            const countryCode = countryMatch[1];
            return this.labelToCountry[countryCode] || countryCode;
        }
        return 'Unknown';
    }

    /**
     * Load proxy configuration to understand geographic distribution
     */
    async loadProxyConfig() {
        const httpProxiesV2File = path.join(this.proxiesDir, 'http.proxies.v2.json');
        const httpProxiesFile = path.join(this.proxiesDir, 'http.proxies.json');
        
        try {
            let proxies = [];
            
            // Try v2 format first
            if (await fs.pathExists(httpProxiesV2File)) {
                const data = await fs.readJson(httpProxiesV2File);
                proxies = Array.isArray(data) ? data : [];
                console.log(`📡 Loaded ${proxies.length} proxies from v2 config`);
            } else if (await fs.pathExists(httpProxiesFile)) {
                const data = await fs.readJson(httpProxiesFile);
                proxies = Array.isArray(data) ? data : [];
                console.log(`📡 Loaded ${proxies.length} proxies from v1 config`);
            }
            
            // Build country distribution from proxy config
            const countryStats = {};
            proxies.forEach(proxy => {
                const country = proxy.customName || proxy.country || 'Unknown';
                const connectionType = proxy.connectionType || 'unknown';
                
                if (!countryStats[country]) {
                    countryStats[country] = { total: 0, resident: 0, datacenter: 0 };
                }
                countryStats[country].total++;
                countryStats[country][connectionType]++;
            });
            
            return countryStats;
        } catch (error) {
            console.warn(`⚠️  Could not load proxy config: ${error.message}`);
            return {};
        }
    }

    /**
     * Analyze batch automation logs for proxy usage
     */
    async analyzeBatchLogs() {
        const batchData = [];
        const profileToProxy = new Map();
        
        try {
            const files = await fs.readdir(this.automationResultsDir);
            const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && f.startsWith('batch-'));
            
            console.log(`📊 Analyzing ${jsonlFiles.length} batch log files...`);
            
            for (const file of jsonlFiles) {
                const filePath = path.join(this.automationResultsDir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const lines = content.trim().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);
                        if (entry.profileName && entry.proxy && entry.proxy.label) {
                            const country = this.extractCountryFromProxyLabel(entry.proxy.label);
                            
                            // Store profile to proxy mapping
                            profileToProxy.set(entry.profileName, {
                                proxyLabel: entry.proxy.label,
                                country: country,
                                proxyType: entry.proxy.type,
                                timestamp: entry.timestamp,
                                success: entry.success,
                                batchId: entry.batchId
                            });
                            
                            batchData.push({
                                profileName: entry.profileName,
                                profileId: entry.profileId,
                                country: country,
                                proxyLabel: entry.proxy.label,
                                proxyType: entry.proxy.type,
                                timestamp: entry.timestamp,
                                success: entry.success,
                                batchId: entry.batchId,
                                run: entry.run
                            });
                        }
                    } catch (parseError) {
                        // Skip invalid JSON lines
                        continue;
                    }
                }
            }
            
            return { batchData, profileToProxy };
        } catch (error) {
            console.error(`❌ Error analyzing batch logs: ${error.message}`);
            return { batchData: [], profileToProxy: new Map() };
        }
    }

    /**
     * Query profiles database
     */
    async queryProfilesDatabase() {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);
            const get = promisify(db.get.bind(db));
            const all = promisify(db.all.bind(db));
            const close = promisify(db.close.bind(db));
            
            const profiles = [];
            
            const query = `
                SELECT 
                    id, name, description, browser_type, created_at, last_used, 
                    session_count, success_count, failure_count, last_session_status,
                    last_session_reason, last_session_timestamp
                FROM profiles 
                ORDER BY created_at DESC
            `;
            
            db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                resolve(rows);
                db.close();
            });
        });
    }

    /**
     * Generate comprehensive geographic analysis report
     */
    async generateReport() {
        console.log(chalk.blue('🌍 Profile Geographic Distribution Analysis'));
        console.log(chalk.blue('='.repeat(50)));
        
        const { batchData, profileToProxy } = await this.analyzeBatchLogs();
        const proxyConfig = await this.loadProxyConfig();
        const profiles = await this.queryProfilesDatabase();
        
        // Geographic distribution from batch data
        const countryStats = {};
        const proxyLabelStats = {};
        const batchStats = {};
        const successRates = {};
        
        batchData.forEach(entry => {
            const { country, proxyLabel, batchId, success } = entry;
            
            // Country stats
            if (!countryStats[country]) {
                countryStats[country] = { total: 0, successful: 0, failed: 0 };
            }
            countryStats[country].total++;
            if (success) countryStats[country].successful++;
            else countryStats[country].failed++;
            
            // Proxy label stats
            if (!proxyLabelStats[proxyLabel]) {
                proxyLabelStats[proxyLabel] = { total: 0, successful: 0, failed: 0 };
            }
            proxyLabelStats[proxyLabel].total++;
            if (success) proxyLabelStats[proxyLabel].successful++;
            else proxyLabelStats[proxyLabel].failed++;
            
            // Batch stats
            if (!batchStats[batchId]) {
                batchStats[batchId] = { total: 0, countries: new Set() };
            }
            batchStats[batchId].total++;
            batchStats[batchId].countries.add(country);
        });
        
        // Calculate success rates
        Object.keys(countryStats).forEach(country => {
            const stats = countryStats[country];
            successRates[country] = stats.total > 0 ? (stats.successful / stats.total * 100).toFixed(1) : 0;
        });
        
        console.log('\n' + chalk.green('📊 PROFILE DISTRIBUTION BY COUNTRY'));
        console.log(chalk.green('-'.repeat(40)));
        
        // Sort countries by profile count
        const sortedCountries = Object.entries(countryStats)
            .sort(([,a], [,b]) => b.total - a.total);
        
        sortedCountries.forEach(([country, stats]) => {
            const percentage = (stats.total / batchData.length * 100).toFixed(1);
            console.log(`${chalk.yellow(country.padEnd(15))} ${stats.total.toString().padStart(4)} profiles (${percentage}%) - Success: ${chalk.green(stats.successful)} Failed: ${chalk.red(stats.failed)} (${successRates[country]}%)`);
        });
        
        console.log('\n' + chalk.cyan('🏷️  TOP PROXY LABELS'));
        console.log(chalk.cyan('-'.repeat(30)));
        
        // Sort proxy labels by usage
        const sortedProxyLabels = Object.entries(proxyLabelStats)
            .sort(([,a], [,b]) => b.total - a.total)
            .slice(0, 15); // Top 15
        
        sortedProxyLabels.forEach(([label, stats]) => {
            const successRate = stats.total > 0 ? (stats.successful / stats.total * 100).toFixed(1) : 0;
            console.log(`${chalk.yellow(label.padEnd(12))} ${stats.total.toString().padStart(3)} uses - Success: ${chalk.green(stats.successful)} (${successRate}%)`);
        });
        
        console.log('\n' + chalk.magenta('📈 BATCH ANALYSIS'));
        console.log(chalk.magenta('-'.repeat(25)));
        
        const sortedBatches = Object.entries(batchStats)
            .sort(([,a], [,b]) => b.total - a.total)
            .slice(0, 10); // Top 10 batches
        
        sortedBatches.forEach(([batchId, stats]) => {
            const countriesStr = Array.from(stats.countries).join(', ');
            console.log(`${chalk.yellow(batchId.substring(0, 20))}... ${stats.total} profiles, ${stats.countries.size} countries: ${countriesStr}`);
        });
        
        // Profile database summary
        console.log('\n' + chalk.blue('💾 PROFILE DATABASE SUMMARY'));
        console.log(chalk.blue('-'.repeat(30)));
        console.log(`Total profiles in database: ${chalk.yellow(profiles.length)}`);
        console.log(`Profiles with batch data: ${chalk.yellow(profileToProxy.size)}`);
        console.log(`Coverage: ${chalk.yellow((profileToProxy.size / profiles.length * 100).toFixed(1))}%`);
        
        // Profiles without geographic data
        const profilesWithoutGeo = profiles.filter(p => !profileToProxy.has(p.name));
        if (profilesWithoutGeo.length > 0) {
            console.log(`\n${chalk.red('⚠️  PROFILES WITHOUT GEOGRAPHIC DATA:')}`);
            profilesWithoutGeo.slice(0, 10).forEach(p => {
                console.log(`  ${p.name} (created: ${p.created_at?.substring(0, 10)})`);
            });
            if (profilesWithoutGeo.length > 10) {
                console.log(`  ... and ${profilesWithoutGeo.length - 10} more`);
            }
        }
        
        // Proxy configuration vs actual usage
        console.log('\n' + chalk.green('🔄 PROXY CONFIGURATION vs USAGE'));
        console.log(chalk.green('-'.repeat(35)));
        
        Object.entries(proxyConfig).forEach(([country, config]) => {
            const actualUsage = countryStats[country] || { total: 0 };
            console.log(`${chalk.yellow(country.padEnd(15))} Config: ${config.total} proxies (${config.resident}R + ${config.datacenter}DC) | Usage: ${actualUsage.total} profiles`);
        });
        
        return {
            countryStats,
            proxyLabelStats,
            batchStats,
            successRates,
            profileToProxy,
            profiles,
            totalProfiles: profiles.length,
            profilesWithGeo: profileToProxy.size,
            coverage: (profileToProxy.size / profiles.length * 100).toFixed(1)
        };
    }

    /**
     * List all regions/countries found
     */
    async listRegions() {
        const { countryStats } = await this.generateReport();
        
        console.log('\n' + chalk.blue('🌍 ALL PROFILE REGIONS:'));
        console.log(chalk.blue('-'.repeat(25)));
        
        const regions = Object.keys(countryStats).sort();
        regions.forEach((region, index) => {
            console.log(`${(index + 1).toString().padStart(2)}. ${region}`);
        });
        
        return regions;
    }
}

// CLI usage
async function main() {
    const analyzer = new GeographicAnalyzer();
    
    try {
        if (process.argv.includes('--list-regions')) {
            await analyzer.listRegions();
        } else {
            await analyzer.generateReport();
        }
    } catch (error) {
        console.error(chalk.red(`❌ Analysis failed: ${error.message}`));
        process.exit(1);
    }
}

// Support both import and direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { GeographicAnalyzer };