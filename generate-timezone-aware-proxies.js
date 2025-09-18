#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Timezone mapping for countries (approximate main timezone for each)
const COUNTRY_TIMEZONES = {
    'US': -5,  // EST (can range from -8 to -5 but using eastern as main business timezone)
    'CA': -5,  // EST (similar to US, multiple timezones)
    'UK': 0,   // GMT
    'DE': 1,   // CET
    'FR': 1,   // CET (same as Germany)
    'KR': 9,   // KST
    'SG': 8    // SGT
};

// Business hours (9 AM to 6 PM in local time)
const BUSINESS_HOURS_START = 9;
const BUSINESS_HOURS_END = 18;

/**
 * Calculate timezone weight based on current time
 * Higher weight = better time to use these proxies (local business hours)
 * @param {string} countryCode 
 * @param {Date} currentTime 
 * @returns {number} Weight from 0.1 to 1.0
 */
function calculateTimezoneWeight(countryCode, currentTime = new Date()) {
    const timezoneOffset = COUNTRY_TIMEZONES[countryCode];
    if (timezoneOffset === undefined) {
        return 0.5; // Default weight for unknown countries
    }

    // Calculate local time in the proxy's country
    // currentTime is already in UTC, so just add the timezone offset
    const localTime = new Date(currentTime.getTime() + (timezoneOffset * 3600000));
    const localHour = localTime.getHours();

    // Weight calculation:
    // - Peak weight (1.0) during business hours (9-18)
    // - Reduced weight (0.3) during evening/early morning (6-9, 18-23)
    // - Minimal weight (0.1) during deep night/early morning (23-6)
    
    if (localHour >= BUSINESS_HOURS_START && localHour < BUSINESS_HOURS_END) {
        return 1.0; // Peak business hours
    } else if (localHour >= 6 && localHour < BUSINESS_HOURS_START || 
               localHour >= BUSINESS_HOURS_END && localHour < 23) {
        return 0.3; // Early morning or evening
    } else {
        return 0.1; // Night time
    }
}

/**
 * Parse proxy file and extract proxies
 * @param {string} filePath 
 * @param {string} countryCode 
 * @returns {Array} Array of proxy objects
 */
function parseProxyFile(filePath, countryCode) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    return lines.map(line => {
        const [host, port, username, password] = line.split(':');
        const id = crypto.randomBytes(12).toString('hex');
        
        return {
            _id: id,
            id: id,
            mode: "geolocation",
            host: host,
            port: parseInt(port),
            username: username,
            password: password,
            profiles: [],
            profilesCount: 0,
            customName: getCountryName(countryCode),
            status: true,
            country: countryCode,
            checkDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            connectionType: "datacenter", // Assuming datacenter for floppydata
            timezoneOffset: COUNTRY_TIMEZONES[countryCode] || 0,
            currentWeight: calculateTimezoneWeight(countryCode),
            weightUpdatedAt: new Date().toISOString()
        };
    });
}

/**
 * Get full country name from country code
 * @param {string} countryCode 
 * @returns {string}
 */
function getCountryName(countryCode) {
    const countryNames = {
        'US': 'United States',
        'CA': 'Canada', 
        'UK': 'United Kingdom',
        'DE': 'Germany',
        'FR': 'France',
        'KR': 'South Korea',
        'SG': 'Singapore'
    };
    return countryNames[countryCode] || countryCode;
}

/**
 * Add timezone awareness and weighting to existing proxy list
 * @param {Array} proxies 
 * @returns {Array} Enhanced proxy list with timezone data
 */
function enhanceProxiesWithTimezone(proxies) {
    return proxies.map(proxy => {
        const weight = calculateTimezoneWeight(proxy.country);
        return {
            ...proxy,
            timezoneOffset: COUNTRY_TIMEZONES[proxy.country] || 0,
            currentWeight: weight,
            weightUpdatedAt: new Date().toISOString(),
            // Add business hours info for reference
            businessHoursLocal: `${BUSINESS_HOURS_START}:00-${BUSINESS_HOURS_END}:00 local time`
        };
    });
}

/**
 * Create weighted random sampler that respects timezone preferences
 * @param {Array} proxies 
 * @param {number} sampleSize 
 * @returns {Array} Weighted sample of proxies
 */
function createTimezoneWeightedSample(proxies, sampleSize) {
    // Create weighted array where each proxy appears multiple times based on weight
    const weightedProxies = [];
    
    proxies.forEach(proxy => {
        const weight = proxy.currentWeight;
        // Convert weight to integer multiplier (1-10)
        const multiplier = Math.max(1, Math.floor(weight * 10));
        
        // Add proxy multiple times based on weight
        for (let i = 0; i < multiplier; i++) {
            weightedProxies.push(proxy);
        }
    });
    
    // Shuffle and sample
    const shuffled = weightedProxies.sort(() => Math.random() - 0.5);
    const sampled = [];
    const usedIds = new Set();
    
    // Select unique proxies up to sample size
    for (let i = 0; i < shuffled.length && sampled.length < sampleSize; i++) {
        const proxy = shuffled[i];
        if (!usedIds.has(proxy.id)) {
            sampled.push(proxy);
            usedIds.add(proxy.id);
        }
    }
    
    return sampled;
}

/**
 * Main function to generate timezone-aware proxy list
 */
function generateTimezoneAwareProxies() {
    console.log('🌍 Generating timezone-aware proxy list...');
    console.log(`Current time: ${new Date().toISOString()}`);
    
    const proxiesDir = path.join(__dirname, 'proxies');
    const allProxies = [];
    
    // Process each country's proxy file
    const countryFiles = [
        { file: 'floppydata-proxies-US-200.txt', country: 'US' },
        { file: 'floppydata-proxies-CA-100.txt', country: 'CA' },
        { file: 'floppydata-proxies-UK-100.txt', country: 'UK' },
        { file: 'floppydata-proxies-DE-100.txt', country: 'DE' },
        { file: 'floppydata-proxies-FR-100.txt', country: 'FR' },
        { file: 'floppydata-proxies-KR-100.txt', country: 'KR' },
        { file: 'floppydata-proxies-SG-100.txt', country: 'SG' }
    ];
    
    // Parse all proxy files
    countryFiles.forEach(({ file, country }) => {
        const filePath = path.join(proxiesDir, file);
        if (fs.existsSync(filePath)) {
            console.log(`📂 Processing ${file}...`);
            const countryProxies = parseProxyFile(filePath, country);
            console.log(`   Found ${countryProxies.length} proxies from ${country}`);
            console.log(`   Current timezone weight: ${countryProxies[0]?.currentWeight.toFixed(2)}`);
            allProxies.push(...countryProxies);
        } else {
            console.log(`⚠️  File not found: ${file}`);
        }
    });
    
    console.log(`\n📊 Total proxies loaded: ${allProxies.length}`);
    
    // Show current timezone weights
    console.log('\n🕐 Current timezone weights:');
    Object.keys(COUNTRY_TIMEZONES).forEach(country => {
        const weight = calculateTimezoneWeight(country);
        const offset = COUNTRY_TIMEZONES[country];
        const currentHour = new Date(Date.now() + (offset * 3600000)).getHours();
        console.log(`   ${country}: Weight ${weight.toFixed(2)} (local time: ${currentHour}:00)`);
    });
    
    // Sort by weight for display
    const sortedProxies = allProxies.sort((a, b) => b.currentWeight - a.currentWeight);
    
    // Write the complete proxy list
    const outputPath = path.join(proxiesDir, 'http.proxies.v3.json');
    fs.writeFileSync(outputPath, JSON.stringify(sortedProxies, null, 2));
    
    console.log(`\n✅ Generated ${sortedProxies.length} timezone-aware proxies`);
    console.log(`📝 Saved to: ${outputPath}`);
    
    // Show distribution
    const distribution = {};
    sortedProxies.forEach(proxy => {
        distribution[proxy.country] = (distribution[proxy.country] || 0) + 1;
    });
    
    console.log('\n📈 Country distribution:');
    Object.entries(distribution)
        .sort(([,a], [,b]) => b - a)
        .forEach(([country, count]) => {
            console.log(`   ${country}: ${count} proxies`);
        });
    
    return sortedProxies;
}

// Export functions for use in other scripts
export {
    calculateTimezoneWeight,
    enhanceProxiesWithTimezone,
    createTimezoneWeightedSample,
    generateTimezoneAwareProxies,
    COUNTRY_TIMEZONES
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    generateTimezoneAwareProxies();
}