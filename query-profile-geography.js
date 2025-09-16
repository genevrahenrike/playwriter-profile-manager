#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import chalk from 'chalk';
import inquirer from 'inquirer';

class ProfileGeographyQuery {
    constructor() {
        this.dbPath = './profiles/profiles.db';
        this.db = null;
    }

    async init() {
        this.db = new sqlite3.Database(this.dbPath);
        this.dbGet = promisify(this.db.get.bind(this.db));
        this.dbAll = promisify(this.db.all.bind(this.db));
    }

    async close() {
        if (this.db) {
            await promisify(this.db.close.bind(this.db))();
        }
    }

    async getGeographicSummary() {
        const summary = await this.dbGet(`
            SELECT 
                COUNT(*) as total_profiles,
                COUNT(proxy_country) as profiles_with_geography,
                ROUND(COUNT(proxy_country) * 100.0 / COUNT(*), 2) as coverage_percent
            FROM profiles
        `);

        const countries = await this.dbAll(`
            SELECT 
                proxy_country,
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM profiles WHERE proxy_country IS NOT NULL), 2) as percent
            FROM profiles 
            WHERE proxy_country IS NOT NULL
            GROUP BY proxy_country
            ORDER BY count DESC
        `);

        const connectionTypes = await this.dbAll(`
            SELECT 
                proxy_country,
                proxy_connection_type,
                COUNT(*) as count
            FROM profiles 
            WHERE proxy_country IS NOT NULL AND proxy_connection_type IS NOT NULL
            GROUP BY proxy_country, proxy_connection_type
            ORDER BY proxy_country, count DESC
        `);

        return { summary, countries, connectionTypes };
    }

    async searchProfiles(filters = {}) {
        let query = `
            SELECT 
                name,
                proxy_country,
                proxy_connection_type,
                proxy_label,
                success_count,
                failure_count,
                created_at
            FROM profiles 
            WHERE 1=1
        `;
        const params = [];

        if (filters.country) {
            query += ` AND proxy_country = ?`;
            params.push(filters.country);
        }

        if (filters.connectionType) {
            query += ` AND proxy_connection_type = ?`;
            params.push(filters.connectionType);
        }

        if (filters.successRate !== undefined) {
            query += ` AND success_count >= ?`;
            params.push(filters.successRate);
        }

        query += ` ORDER BY created_at DESC`;

        if (filters.limit) {
            query += ` LIMIT ?`;
            params.push(filters.limit);
        }

        return await this.dbAll(query, params);
    }

    async getCountryStats(country) {
        const stats = await this.dbGet(`
            SELECT 
                COUNT(*) as total_profiles,
                AVG(success_count) as avg_success_count,
                MIN(success_count) as min_success_count,
                MAX(success_count) as max_success_count,
                COUNT(DISTINCT proxy_label) as unique_proxies
            FROM profiles 
            WHERE proxy_country = ?
        `, [country]);

        const proxies = await this.dbAll(`
            SELECT 
                proxy_label,
                proxy_connection_type,
                COUNT(*) as profile_count,
                AVG(success_count) as avg_success_count
            FROM profiles 
            WHERE proxy_country = ?
            GROUP BY proxy_label, proxy_connection_type
            ORDER BY profile_count DESC
        `, [country]);

        return { stats, proxies };
    }

    displaySummary(data) {
        console.log(chalk.blue.bold('\n🌍 GEOGRAPHIC SUMMARY'));
        console.log('='.repeat(50));
        
        console.log(`Total Profiles: ${chalk.yellow(data.summary.total_profiles)}`);
        console.log(`Profiles with Geography: ${chalk.green(data.summary.profiles_with_geography)}`);
        console.log(`Coverage: ${chalk.cyan(data.summary.coverage_percent + '%')}`);

        console.log(chalk.blue.bold('\n📊 COUNTRY BREAKDOWN'));
        console.log('-'.repeat(40));
        
        data.countries.forEach(country => {
            const flag = this.getCountryFlag(country.proxy_country);
            console.log(`${flag} ${country.proxy_country.padEnd(15)} ${chalk.yellow(country.count.toString().padStart(4))} profiles (${chalk.cyan(country.percent + '%')})`);
        });

        console.log(chalk.blue.bold('\n🔗 CONNECTION TYPES'));
        console.log('-'.repeat(40));
        
        const connectionGroups = {};
        data.connectionTypes.forEach(row => {
            const key = `${row.proxy_country} (${row.proxy_connection_type})`;
            connectionGroups[key] = row.count;
        });

        Object.entries(connectionGroups)
            .sort((a, b) => b[1] - a[1])
            .forEach(([key, count]) => {
                const type = key.includes('resident') ? '🏠' : '🏢';
                console.log(`${type} ${key.padEnd(25)} ${chalk.yellow(count)} profiles`);
            });
    }

    displayProfiles(profiles, title = 'PROFILES') {
        console.log(chalk.blue.bold(`\n📋 ${title}`));
        console.log('='.repeat(80));
        
        if (profiles.length === 0) {
            console.log(chalk.yellow('No profiles found matching criteria.'));
            return;
        }

        profiles.forEach(profile => {
            const flag = this.getCountryFlag(profile.proxy_country);
            const connection = profile.proxy_connection_type === 'resident' ? '🏠' : '🏢';
            const successColor = profile.success_count >= 1 ? chalk.green : chalk.yellow;
            
            console.log(`${flag} ${connection} ${profile.name.padEnd(20)} | ${profile.proxy_country?.padEnd(15) || 'Unknown'.padEnd(15)} | ${profile.proxy_label?.padEnd(12) || 'No Label'.padEnd(12)} | Success: ${successColor(profile.success_count || 0)} | ${profile.created_at}`);
        });
    }

    displayCountryStats(country, data) {
        const flag = this.getCountryFlag(country);
        
        console.log(chalk.blue.bold(`\n${flag} ${country.toUpperCase()} STATISTICS`));
        console.log('='.repeat(50));
        
        console.log(`Total Profiles: ${chalk.yellow(data.stats.total_profiles)}`);
        console.log(`Average Success Count: ${chalk.green(data.stats.avg_success_count?.toFixed(2) || 0)}`);
        console.log(`Success Count Range: ${chalk.cyan(data.stats.min_success_count || 0)} - ${chalk.cyan(data.stats.max_success_count || 0)}`);
        console.log(`Unique Proxies: ${chalk.magenta(data.stats.unique_proxies)}`);

        console.log(chalk.blue.bold('\n🏷️  PROXY BREAKDOWN'));
        console.log('-'.repeat(60));
        
        data.proxies.forEach(proxy => {
            const connection = proxy.proxy_connection_type === 'resident' ? '🏠' : '🏢';
            console.log(`${connection} ${proxy.proxy_label.padEnd(15)} | ${chalk.yellow(proxy.profile_count)} profiles | Avg Success: ${chalk.green(proxy.avg_success_count?.toFixed(2) || 0)}`);
        });
    }

    getCountryFlag(country) {
        const flags = {
            'United States': '🇺🇸',
            'United Kingdom': '🇬🇧',
            'France': '🇫🇷',
            'Germany': '🇩🇪',
            'Australia': '🇦🇺',
            'Netherlands': '🇳🇱',
            'Sweden': '🇸🇪'
        };
        return flags[country] || '🏳️';
    }

    async runInteractiveQuery() {
        const action = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '📊 Show geographic summary', value: 'summary' },
                    { name: '🔍 Search profiles by country', value: 'search_country' },
                    { name: '🏷️  View country statistics', value: 'country_stats' },
                    { name: '🔗 Filter by connection type', value: 'search_connection' },
                    { name: '📈 Find high-success profiles', value: 'search_success' },
                    { name: '❌ Exit', value: 'exit' }
                ]
            }
        ]);

        switch (action.action) {
            case 'summary':
                const summary = await this.getGeographicSummary();
                this.displaySummary(summary);
                break;

            case 'search_country':
                const countries = await this.dbAll('SELECT DISTINCT proxy_country FROM profiles WHERE proxy_country IS NOT NULL ORDER BY proxy_country');
                const countryChoice = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'country',
                        message: 'Select a country:',
                        choices: countries.map(c => c.proxy_country)
                    },
                    {
                        type: 'input',
                        name: 'limit',
                        message: 'How many profiles to show? (default: 10)',
                        default: '10'
                    }
                ]);

                const countryProfiles = await this.searchProfiles({
                    country: countryChoice.country,
                    limit: parseInt(countryChoice.limit)
                });
                this.displayProfiles(countryProfiles, `${countryChoice.country.toUpperCase()} PROFILES`);
                break;

            case 'country_stats':
                const statsCountries = await this.dbAll('SELECT DISTINCT proxy_country FROM profiles WHERE proxy_country IS NOT NULL ORDER BY proxy_country');
                const statsChoice = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'country',
                        message: 'Select a country for detailed statistics:',
                        choices: statsCountries.map(c => c.proxy_country)
                    }
                ]);

                const countryStats = await this.getCountryStats(statsChoice.country);
                this.displayCountryStats(statsChoice.country, countryStats);
                break;

            case 'search_connection':
                const connectionChoice = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'connectionType',
                        message: 'Select connection type:',
                        choices: ['resident', 'datacenter']
                    },
                    {
                        type: 'input',
                        name: 'limit',
                        message: 'How many profiles to show? (default: 20)',
                        default: '20'
                    }
                ]);

                const connectionProfiles = await this.searchProfiles({
                    connectionType: connectionChoice.connectionType,
                    limit: parseInt(connectionChoice.limit)
                });
                this.displayProfiles(connectionProfiles, `${connectionChoice.connectionType.toUpperCase()} PROFILES`);
                break;

            case 'search_success':
                const successChoice = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'minSuccess',
                        message: 'Minimum success rate (0-3):',
                        default: '1'
                    },
                    {
                        type: 'input',
                        name: 'limit',
                        message: 'How many profiles to show? (default: 30)',
                        default: '30'
                    }
                ]);

                const successProfiles = await this.searchProfiles({
                    successRate: parseInt(successChoice.minSuccess),
                    limit: parseInt(successChoice.limit)
                });
                this.displayProfiles(successProfiles, `HIGH-SUCCESS PROFILES (≥${successChoice.minSuccess})`);
                break;

            case 'exit':
                console.log(chalk.green('\n👋 Goodbye!'));
                return false;
        }

        // Ask if user wants to continue
        const continueChoice = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'continue',
                message: 'Would you like to perform another query?',
                default: true
            }
        ]);

        return continueChoice.continue;
    }
}

// CLI usage
if (process.argv[2]) {
    const query = new ProfileGeographyQuery();
    await query.init();

    const command = process.argv[2];
    
    switch (command) {
        case '--summary':
        case '-s':
            const summary = await query.getGeographicSummary();
            query.displaySummary(summary);
            break;
            
        case '--country':
        case '-c':
            if (!process.argv[3]) {
                console.log(chalk.red('Please specify a country: --country "United States"'));
                process.exit(1);
            }
            const countryProfiles = await query.searchProfiles({ 
                country: process.argv[3],
                limit: parseInt(process.argv[4]) || 20
            });
            query.displayProfiles(countryProfiles, `${process.argv[3].toUpperCase()} PROFILES`);
            break;
            
        case '--connection':
            if (!process.argv[3] || !['resident', 'datacenter'].includes(process.argv[3])) {
                console.log(chalk.red('Please specify connection type: --connection resident|datacenter'));
                process.exit(1);
            }
            const connectionProfiles = await query.searchProfiles({ 
                connectionType: process.argv[3],
                limit: parseInt(process.argv[4]) || 20
            });
            query.displayProfiles(connectionProfiles, `${process.argv[3].toUpperCase()} PROFILES`);
            break;
            
        default:
            console.log(chalk.yellow('Available commands:'));
            console.log('  --summary, -s              Show geographic summary');
            console.log('  --country "Country" [limit] Show profiles by country');
            console.log('  --connection type [limit]   Show profiles by connection type');
            console.log('  [no args]                   Interactive mode');
    }

    await query.close();
} else {
    // Interactive mode
    const query = new ProfileGeographyQuery();
    await query.init();

    console.log(chalk.green.bold('🌍 Profile Geography Query Tool'));
    console.log(chalk.gray('Interactive mode - Use Ctrl+C to exit anytime\n'));

    let continueQuery = true;
    while (continueQuery) {
        continueQuery = await query.runInteractiveQuery();
        if (continueQuery) {
            console.log('\n' + '='.repeat(60) + '\n');
        }
    }

    await query.close();
}