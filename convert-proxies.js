import fs from 'fs';
import crypto from 'crypto';

// Read the original file
const originalData = JSON.parse(fs.readFileSync('proxies/http.proxies.json', 'utf8'));

// Function to generate a random 24-character hex ID
function generateId() {
    return crypto.randomBytes(12).toString('hex');
}

// Function to extract country code from label
function getCountryFromLabel(label) {
    if (label.startsWith('US')) return 'US';
    if (label.startsWith('UK')) return 'GB';
    if (label.startsWith('Germany')) return 'DE';
    if (label.startsWith('France')) return 'FR';
    if (label.startsWith('Australia')) return 'AU';
    return 'US'; // default
}

// Function to get full country name from label
function getCustomNameFromLabel(label) {
    if (label.startsWith('US')) return 'United States';
    if (label.startsWith('UK')) return 'United Kingdom';
    if (label.startsWith('Germany')) return 'Germany';
    if (label.startsWith('France')) return 'France';
    if (label.startsWith('Australia')) return 'Australia';
    return 'United States'; // default
}

// Convert the data
const convertedData = originalData.map(proxy => {
    const id = generateId();
    const country = getCountryFromLabel(proxy.label);
    const customName = getCustomNameFromLabel(proxy.label);
    
    return {
        "_id": id,
        "id": id,
        "mode": "geolocation",
        "host": proxy.host,
        "port": proxy.port,
        "username": proxy.login,
        "password": proxy.password,
        "profiles": [],
        "profilesCount": 1,
        "customName": customName,
        "status": proxy.status === "OK",
        "country": country,
        "checkDate": proxy.lastChecked,
        "createdAt": new Date().toISOString(),
        "connectionType": "resident"
    };
});

// Write the converted data to a new file
fs.writeFileSync('proxies/http.proxies.converted.json', JSON.stringify(convertedData, null, 2));

console.log(`Converted ${convertedData.length} proxies from old format to new format`);
console.log('Output saved to: proxies/http.proxies.converted.json');