# Simplified Proxy System Documentation

## Overview

The proxy system has been completely cleaned up and simplified. The previous messy system with multiple hardcoded file paths and complex loading logic has been replaced with a clean, user-controlled approach.

## Key Changes

### ✅ Before (Messy)
- Multiple hardcoded file paths (`http.proxies.json`, `http.proxies.v2.json`, `http.proxies.v2new.json`, `socks5.proxies.json`, etc.)
- Complex auto-detection logic scanning directories
- Confusing priority rules between different formats
- Users couldn't easily control which proxy file to use

### ✅ After (Clean)
- **Single `--proxy-file` argument** to specify exactly which proxy file to use
- **Two supported formats**: `.txt` (colon-delimited) and `.json` (v2 format)
- **No hardcoded paths** - users have full control
- **Simple, predictable behavior**

## Supported Proxy Formats

### 1. TXT Format (Colon-delimited)
**File extension:** `.txt`
**Format:** `host:port:username:password` (one per line)

```txt
# Example: proxies.txt
dc.decodo.com:10001:username:password
dc.decodo.com:10002:username:password
proxy.example.com:3128:user123:pass456
```

**Features:**
- HTTPS detection: Files with "https" in filename are marked as HTTPS proxies
- Comment support: Lines starting with `#` are ignored
- Automatic labeling: Proxies get sequential labels like "Decodo1", "Decodo2", etc.

### 2. JSON Format (v2)
**File extension:** `.json`
**Format:** Array of proxy objects with v2 schema

```json
[
  {
    "_id": "unique-id",
    "host": "geo.floppydata.com", 
    "port": 10080,
    "username": "user123",
    "password": "pass456",
    "country": "US",
    "connectionType": "datacenter",
    "status": true,
    "customName": "US Datacenter 1"
  }
]
```

**Required v2 fields:**
- `country` - Country code (US, GB, FR, etc.)
- `connectionType` - Type of proxy (datacenter, resident, mobile)

**Features:**
- **Pre-filtering**: Bad proxies filtered before conversion for efficiency
- **Status filtering**: Only `status: true` proxies are loaded
- **Quality filtering**: Removes payment required, auth failed, sweep failed proxies
- Geographic filtering support
- Connection type filtering  
- Rich metadata preservation

## Usage Examples

### CLI Usage

```bash
# Use TXT format proxy file
npx ppm launch my-profile --proxy-file ./my-proxies.txt --proxy-strategy random

# Use JSON v2 format proxy file
npx ppm launch my-profile --proxy-file ./proxies/http.proxies.v2.json --proxy-strategy fastest

# Use with geographic filtering
npx ppm launch my-profile --proxy-file ./proxies.json --proxy-country US --proxy-connection-type datacenter

# No proxy file = no proxies (clean default)
npx ppm launch my-profile
```

### Programmatic Usage

```javascript
import { ProfileLauncher } from './src/ProfileLauncher.js';

const launcher = new ProfileLauncher(profileManager);

// Launch with specific proxy file
const result = await launcher.launchProfile('my-profile', {
    proxyFile: './my-custom-proxies.txt',
    proxyStrategy: 'random'
});

// Per-launch proxy file specification
const result2 = await launcher.launchProfile('other-profile', {
    proxyFile: './different-proxies.json',
    proxyStrategy: 'geographic',
    proxyCountry: 'GB'
});
```

## Key Benefits

### 🎯 **User Control**
- Users specify exactly which proxy file to use
- No more guessing which file the system will load
- Different profiles can use different proxy files in the same session

### 🧹 **Clean & Simple**
- Only 2 supported formats (not 5+)
- Clear file extension-based detection
- No complex priority logic

### ⚡ **Predictable**
- If you don't specify `--proxy-file`, no proxies are loaded
- If you specify a file, only that file is loaded
- Clear error messages for unsupported formats
- JSON proxies pre-filtered for quality (only working proxies loaded)

### 🔧 **Flexible**
- Per-launch proxy file specification
- Supports both lightweight TXT and feature-rich JSON formats
- Maintains all existing filtering capabilities (country, connection type, etc.)

## Migration from Old System

### If you were using hardcoded files:

**Before:**
```bash
npx ppm launch my-profile --proxy-strategy random
# (System would automatically scan and load various files)
```

**After:**
```bash
npx ppm launch my-profile --proxy-file ./proxies/http.proxies.v2.json --proxy-strategy random
# (You explicitly specify which file to use)
```

### If you have multiple proxy sources:

**Before:** Complex logic tried to merge multiple files
**After:** Choose the specific file you want per launch

```bash
# Use US proxies for this launch
npx ppm launch profile1 --proxy-file ./proxies/us-proxies.txt

# Use EU proxies for this launch  
npx ppm launch profile2 --proxy-file ./proxies/eu-proxies.json
```

## Error Handling

The system provides clear error messages:

```bash
# File not found
❌ Proxy file not found: /path/to/missing.txt

# Unsupported format
❌ Unsupported proxy file format: .xml. Supported formats: .txt (colon-delimited) or .json (v2 format)

# Invalid JSON structure
❌ JSON proxy file must contain an array of proxy objects

# Wrong JSON format
❌ JSON proxy file must be in v2 format (containing country and connectionType fields)
```

## Testing

All functionality has been tested:

- ✅ TXT format loading and proxy selection
- ✅ JSON v2 format loading with filtering
- ✅ No proxy file specified (clean default)
- ✅ Invalid file paths (proper error handling)
- ✅ Unsupported formats (proper error handling) 
- ✅ CLI integration with `--proxy-file` argument
- ✅ Per-launch proxy file specification
- ✅ Integration with geographic rotation and filtering

Run the test suite:
```bash
node test/test-simplified-proxy-system.js
```

## Conclusion

The proxy system is now **clean, predictable, and user-controlled**. No more confusion about which proxy files are being loaded or complex hardcoded logic. Users have complete control over their proxy configuration with a simple, consistent interface.