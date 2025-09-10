# VidIQ Extension Device ID Fingerprinting Solution

## Problem Analysis

The VidIQ extension (`x-vidiq-device-id: 2ea4752a-6972-4bf1-9376-9d75f62354c7`) generates a **persistent device ID** that survives:
- Profile cloning
- Cookie clearing 
- Extension data deletion
- Browser restarts

## Root Cause: Browser Fingerprinting

VidIQ extension uses **browser fingerprinting techniques** to generate a consistent device ID:

### VidIQ Extension Permissions (from manifest.json):
```json
{
  "permissions": ["cookies", "clipboardWrite", "storage", "background"],
  "host_permissions": ["<all_urls>"],
  "key": "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCCmCY3EoZyLPHmK4MyvummcMBdhj15od4P1qkkiQIk1t595jW4NUrwu81OIKFs4dW5x4v1LYVqihkBMotoQu1n0tY9HWi1ZYgGeoZeLd7gxDp8G8VqKz5B7x+rGyYc+V2InPcxw44v92Yoz17ZeV209RsAYXIm4m07wroBlUfwgQIDAQAB"
}
```

### Likely Fingerprinting Methods Used:
1. **Extension ID + Installation Key**: The hardcoded `key` in manifest.json creates unique extension installation
2. **Browser Hardware Fingerprinting**: WebGL, Canvas, Audio Context fingerprinting
3. **System Information**: Screen resolution, timezone, language, user agent
4. **Chrome Storage API**: Persistent storage across profile resets
5. **Network Fingerprinting**: IP address, DNS resolution timing
6. **Performance Fingerprinting**: JavaScript execution timing patterns

## Solutions to Generate Unique Device IDs

### 1. **Browser-Level Fingerprinting Spoofing** (Recommended)

Enhance your existing stealth system to spoof the exact fingerprinting vectors VidIQ uses:

```javascript
// Enhanced StealthManager configuration
const vidiqAntiFingerprinting = {
    // WebGL spoofing (critical for device ID)
    webgl: {
        enabled: true,
        vendor: randomWebGLVendor(),
        renderer: randomWebGLRenderer(),
        unmaskedVendor: randomWebGLVendor(),
        unmaskedRenderer: randomWebGLRenderer()
    },
    
    // Canvas fingerprinting noise
    canvas: {
        enabled: true,
        noiseAmount: 0.01 // Higher noise for different fingerprints
    },
    
    // Audio fingerprinting variation
    audio: {
        enabled: true,
        noiseAmount: 0.001,
        enableAudioContext: true
    },
    
    // Screen resolution spoofing
    screen: {
        enabled: true,
        width: randomScreenWidth(),
        height: randomScreenHeight(),
        colorDepth: randomColorDepth()
    },
    
    // User agent randomization
    userAgent: {
        enabled: true,
        userAgent: generateRandomUserAgent()
    }
};
```

### 2. **Extension Modification** (Most Effective)

Modify the VidIQ extension to generate random device IDs:

```javascript
// Inject this script before VidIQ extension loads
const originalCrypto = window.crypto;
const originalMath = Math.random;

// Override crypto.getRandomValues for consistent but different UUIDs per profile
window.crypto.getRandomValues = function(array) {
    // Use profile-specific seed for consistent randomness per profile
    const profileSeed = getProfileSpecificSeed();
    const customRandom = seedableRandom(profileSeed);
    
    for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(customRandom() * 256);
    }
    return array;
};

// Override Math.random for fingerprinting functions
Math.random = function() {
    return seedableRandom(getProfileSpecificSeed())();
};
```

### 3. **Extension Storage Isolation** 

Clear extension-specific storage locations:

```javascript
// Clear all possible VidIQ storage locations
const clearVidiqStorage = async (context) => {
    // Clear extension storage
    await context.clearCookies();
    
    // Clear localStorage/sessionStorage for VidIQ domains
    const vidiqDomains = ['*.vidiq.com', '*.app.vidiq.com'];
    
    for (const domain of vidiqDomains) {
        await context.addInitScript(() => {
            localStorage.clear();
            sessionStorage.clear();
            if (window.indexedDB) {
                indexedDB.databases().then(databases => {
                    databases.forEach(db => indexedDB.deleteDatabase(db.name));
                });
            }
        });
    }
    
    // Clear Chrome extension storage via CDP
    const client = await context.newCDPSession();
    await client.send('Storage.clearDataForOrigin', {
        origin: 'chrome-extension://pachckjkecffpdphbpmfolblodfkgbhl',
        storageTypes: 'all'
    });
};
```

### 4. **Network-Level Device ID Interception** 

Intercept and modify the device ID in HTTP requests:

```javascript
// Intercept VidIQ API requests and modify device ID
await context.route('**/api.vidiq.com/**', async (route, request) => {
    const headers = await request.allHeaders();
    
    // Generate profile-specific device ID
    const profileDeviceId = generateProfileDeviceId(profileName);
    
    // Modify the device ID header
    headers['x-vidiq-device-id'] = profileDeviceId;
    
    await route.continue({
        headers: headers
    });
});

function generateProfileDeviceId(profileName) {
    // Generate consistent but unique device ID per profile
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(profileName + 'vidiq-device').digest('hex');
    
    // Format as UUID
    return [
        hash.substring(0, 8),
        hash.substring(8, 12),
        hash.substring(12, 16),
        hash.substring(16, 20),
        hash.substring(20, 32)
    ].join('-');
}
```

## Implementation Priority

1. **Immediate Fix**: Network-level device ID interception (Solution #4)
2. **Better Fix**: Enhanced fingerprinting spoofing (Solution #1) 
3. **Best Fix**: Extension modification + storage isolation (Solutions #2 + #3)

## Testing the Solution

After implementing, verify device ID changes:

```bash
# Launch different profiles and check device IDs
npx ppm launch profile1 --capture
npx ppm launch profile2 --capture

# Compare captured device IDs
grep "x-vidiq-device-id" captured-requests/profile1-*.jsonl
grep "x-vidiq-device-id" captured-requests/profile2-*.jsonl
```

The device IDs should be different for each profile but consistent within the same profile across sessions.
