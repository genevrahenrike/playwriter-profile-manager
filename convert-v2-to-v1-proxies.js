#!/usr/bin/env node

/**
 * Utility to convert v2 proxy format to v1 format for compatibility
 * Usage: node convert-v2-to-v1-proxies.js [input-file] [output-file]
 */

import fs from 'fs-extra';
import path from 'path';

class ProxyConverter {
    /**
     * Get country name from ISO code
     */
    getCountryName(countryCode) {
        const countryMap = {
            'US': 'US',
            'GB': 'UK', 
            'DE': 'Germany',
            'FR': 'France',
            'AU': 'Australia',
            'CA': 'Canada',
            'JP': 'Japan',
            'NL': 'Netherlands',
            'IT': 'Italy',
            'ES': 'Spain'
        };
        return countryMap[countryCode] || countryCode;
    }

    /**
     * Convert v2 proxy format to v1 format
     */
    convertV2ToV1Format(v2Proxies) {
        return v2Proxies.map((proxy, index) => {
            // Generate a label based on country and connection type
            const countryName = this.getCountryName(proxy.country);
            const connectionTypeSuffix = proxy.connectionType === 'datacenter' ? '-DC' : '';
            
            // Count how many proxies we've seen for this country to create unique labels
            const countryCount = v2Proxies.slice(0, index + 1)
                .filter(p => p.country === proxy.country && p.connectionType === proxy.connectionType)
                .length;
            
            const label = `${countryName}${countryCount}${connectionTypeSuffix}`;

            return {
                // v1 format fields
                label: label,
                host: proxy.host,
                port: proxy.port,
                login: proxy.username, // v2 uses 'username', v1 uses 'login'
                username: proxy.username, // Keep both for compatibility
                password: proxy.password,
                url: `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`,
                status: proxy.status === true ? 'OK' : 'ERROR',
                lastChecked: proxy.checkDate,
                
                // v2 format fields (preserved for filtering)
                _id: proxy._id,
                id: proxy.id,
                customName: proxy.customName,
                country: proxy.country,
                connectionType: proxy.connectionType,
                mode: proxy.mode,
                profiles: proxy.profiles,
                profilesCount: proxy.profilesCount,
                checkDate: proxy.checkDate,
                createdAt: proxy.createdAt,
                timezone: proxy.timezone
            };
        });
    }

    /**
     * Convert v2 proxy file to v1 format
     */
    async convertFile(inputFile, outputFile) {
        try {
            console.log(`📖 Reading v2 proxy file: ${inputFile}`);
            const v2Data = await fs.readJson(inputFile);
            
            if (!Array.isArray(v2Data)) {
                throw new Error('Input file must contain an array of proxy objects');
            }
            
            console.log(`🔄 Converting ${v2Data.length} proxies from v2 to v1 format...`);
            const v1Data = this.convertV2ToV1Format(v2Data);
            
            console.log(`💾 Writing v1 proxy file: ${outputFile}`);
            await fs.writeJson(outputFile, v1Data, { spaces: 2 });
            
            console.log(`✅ Conversion completed successfully!`);
            console.log(`   Input: ${inputFile} (${v2Data.length} proxies)`);
            console.log(`   Output: ${outputFile} (${v1Data.length} proxies)`);
            
            // Show summary by connection type and country
            const summary = {};
            v1Data.forEach(proxy => {
                const key = `${proxy.country}-${proxy.connectionType}`;
                summary[key] = (summary[key] || 0) + 1;
            });
            
            console.log('\n📊 Conversion Summary:');
            Object.entries(summary).forEach(([key, count]) => {
                const [country, connectionType] = key.split('-');
                console.log(`   ${country} ${connectionType}: ${count} proxies`);
            });
            
        } catch (error) {
            console.error(`❌ Conversion failed: ${error.message}`);
            process.exit(1);
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const inputFile = args[0] || './proxies/http.proxies.v2.json';
    const outputFile = args[1] || './proxies/http.proxies.converted.json';
    
    console.log('🔄 Proxy Format Converter (v2 → v1)');
    console.log('=====================================\n');
    
    // Validate input file exists
    if (!await fs.pathExists(inputFile)) {
        console.error(`❌ Input file not found: ${inputFile}`);
        console.log('\nUsage: node convert-v2-to-v1-proxies.js [input-file] [output-file]');
        console.log('Example: node convert-v2-to-v1-proxies.js ./proxies/http.proxies.v2.json ./proxies/http.proxies.json');
        process.exit(1);
    }
    
    // Warn if output file exists
    if (await fs.pathExists(outputFile)) {
        console.log(`⚠️  Output file already exists: ${outputFile}`);
        console.log('   It will be overwritten.');
    }
    
    const converter = new ProxyConverter();
    await converter.convertFile(inputFile, outputFile);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { ProxyConverter };