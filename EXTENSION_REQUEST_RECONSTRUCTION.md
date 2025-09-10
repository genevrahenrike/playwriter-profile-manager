# Extension Request Reconstruction Guide

## Overview

This guide explains how to reconstruct authentic browser extension API requests using data captured from webapp sessions. This is particularly useful for automation, testing, and understanding the relationship between webapp and extension authentication flows.

## Background

Browser extensions and webapps often share authentication tokens and session data, but they use different request headers and client identifiers. By capturing webapp session data, we can extract the core authentication components needed to reconstruct extension requests.

## 🔍 Data Sources

### Captured Session Data
- **Source**: Playwright Profile Manager Request Capture System
- **Location**: `./captured-requests/`
- **Format**: JSONL files containing request/response pairs
- **Content**: Headers, URLs, payloads, and authentication tokens

### Manual Extension Capture
- **Source**: Browser DevTools Network tab
- **Method**: Manual inspection of extension requests
- **Purpose**: Provides extension-specific headers not available in webapp

## 🎯 Key Authentication Components

### 1. Bearer Token (`authorization` header)
```
Format: Bearer UKP!{account_id}!{session_id}
Example: Bearer UKP!fa527378-8f02-42eb-a218-684451da6e82!6777d813-642b-4d5e-b724-6c217be5242f
```

**How to Extract:**
1. Look for POST requests to `/auth/login` or `/auth/signup`
2. Check the response body for `session_token` field
3. This token is used in all subsequent API requests

**Location in Captured Data:**
- **Request**: Login/signup POST body contains credentials
- **Response**: Contains the generated `session_token`
- **Subsequent Requests**: Used in `authorization` header

### 2. Device ID (`x-vidiq-device-id` / `x-amplitude-device-id`)
```
Format: UUID v4
Example: 2ea4752a-6972-4bf1-9376-9d75f62354c7
```

**Characteristics:**
- Same value used across webapp and extension
- Persistent across sessions for the same browser profile
- Required for all authenticated requests

### 3. User Agent
```
Example: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36
```

**Purpose:**
- Browser fingerprinting
- Must match between webapp and extension for same session

### 4. Client Identifier (`x-vidiq-client`)
```
Webapp: "web 61b61ab9f9900c18d51c0605348e4169a6480e95"
Extension: "ext vch/3.151.0"
```

**Key Differences:**
- Webapp uses `web` prefix with build hash
- Extension uses `ext vch/{version}` format
- This is the primary differentiator between sources

## 📊 Header Mapping Analysis

### ✅ Headers with Perfect Match
These headers are identical between webapp capture and extension:

| Header | Source | Example Value |
|--------|--------|---------------|
| `authorization` | Captured ✅ | `Bearer UKP!fa527378-8f02-42eb-a218-684451da6e82!6777d813-642b-4d5e-b724-6c217be5242f` |
| `user-agent` | Captured ✅ | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36` |
| `x-vidiq-device-id` | Captured ✅ | `2ea4752a-6972-4bf1-9376-9d75f62354c7` |

### ⚠️ Headers Requiring Adaptation
These headers differ between webapp and extension:

| Header | Webapp Value | Extension Value | Notes |
|--------|-------------|-----------------|-------|
| `accept` | `application/json, text/plain, */*` | `*/*` | Extension uses simplified accept |
| `x-vidiq-client` | `web 61b61ab9f9900c18d51c0605348e4169a6480e95` | `ext vch/3.151.0` | Key differentiator |
| `x-client-location` | Not present | `scorecard` | Extension-specific context |
| `referer` | `https://app.vidiq.com/` | Not typically sent | Extension context differs |

### 🔒 Extension-Specific Headers
These headers are unique to extension requests:

| Header | Value | Purpose |
|--------|-------|---------|
| `accept-language` | `en-US,en;q=0.9` | Browser language preferences |
| `priority` | `u=1, i` | Browser request prioritization |
| `sec-fetch-dest` | `empty` | Security context |
| `sec-fetch-mode` | `cors` | Security context |
| `sec-fetch-site` | `none` | Security context |
| `x-amplitude-device-id` | Same as `x-vidiq-device-id` | Analytics tracking |

## 🛠️ Reconstruction Process

### Step 1: Extract Core Authentication
From captured session data (JSONL file):

```javascript
// Find login/signup response
const loginResponse = requests.find(r => 
  r.url.includes('/auth/login') && r.type === 'response'
);

// Extract session token
const sessionData = JSON.parse(loginResponse.body);
const bearerToken = sessionData.session_token;
// Result: "UKP!fa527378-8f02-42eb-a218-684451da6e82!6777d813-642b-4d5e-b724-6c217be5242f"
```

### Step 2: Extract Device Fingerprinting
```javascript
// Find any request with device ID
const deviceRequest = requests.find(r => 
  r.headers && r.headers['x-vidiq-device-id']
);

const deviceId = deviceRequest.headers['x-vidiq-device-id'];
// Result: "2ea4752a-6972-4bf1-9376-9d75f62354c7"

const userAgent = deviceRequest.headers['user-agent'];
// Result: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)..."
```

### Step 3: Determine Extension Client Version
```javascript
// Look for extension client in signup/login requests
const extRequest = requests.find(r => 
  r.headers && r.headers['x-vidiq-client'] && 
  r.headers['x-vidiq-client'].startsWith('ext')
);

const extVersion = extRequest.headers['x-vidiq-client'];
// Result: "ext vch/3.151.0"
```

### Step 4: Construct Extension Headers
```javascript
const extensionHeaders = {
  'accept': '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'authorization': `Bearer ${bearerToken}`,
  'priority': 'u=1, i',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'none',
  'user-agent': userAgent,
  'x-amplitude-device-id': deviceId,
  'x-client-location': 'scorecard',
  'x-vidiq-client': extVersion
};
```

## 📝 Complete Reconstruction Example

### Input: Captured Session Data
```jsonl
{"timestamp":"2025-09-10T07:14:53.481Z","type":"request","requestId":"req_2_1757488493481","hookName":"vidiq-capture","sessionId":"dad1651b-a8a8-4313-a13d-3d5ed5859aac","url":"https://api.vidiq.com/auth/user","method":"GET","headers":{"sec-ch-ua-platform":"\"macOS\"","authorization":"Bearer UKP!fa527378-8f02-42eb-a218-684451da6e82!6777d813-642b-4d5e-b724-6c217be5242f","referer":"https://app.vidiq.com/","sec-ch-ua":"\"Not=A?Brand\";v=\"24\", \"Chromium\";v=\"140\"","x-timezone":"America/Los_Angeles","x-vidiq-device-id":"2ea4752a-6972-4bf1-9376-9d75f62354c7","sec-ch-ua-mobile":"?0","user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36","accept":"application/json, text/plain, */*","x-vidiq-client":"web 61b61ab9f9900c18d51c0605348e4169a6480e95"}}
```

### Output: Reconstructed Extension Request
```bash
curl 'https://api.vidiq.com/auth/user' \
  -H 'accept: */*' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'authorization: Bearer UKP!fa527378-8f02-42eb-a218-684451da6e82!6777d813-642b-4d5e-b724-6c217be5242f' \
  -H 'priority: u=1, i' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: none' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' \
  -H 'x-amplitude-device-id: 2ea4752a-6972-4bf1-9376-9d75f62354c7' \
  -H 'x-client-location: scorecard' \
  -H 'x-vidiq-client: ext vch/3.151.0'
```

## 🔧 Implementation Code

### Node.js/JavaScript Implementation
```javascript
class ExtensionRequestReconstructor {
  constructor(capturedSessionFile) {
    this.sessionData = this.loadSessionData(capturedSessionFile);
    this.extractAuthData();
  }

  loadSessionData(filePath) {
    const fs = require('fs');
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    return lines.filter(line => line.trim()).map(line => JSON.parse(line));
  }

  extractAuthData() {
    // Find login response with session token
    const loginResponse = this.sessionData.find(entry => 
      entry.type === 'response' && 
      entry.url.includes('/auth/login') &&
      entry.body
    );

    if (loginResponse) {
      const sessionData = JSON.parse(loginResponse.body);
      this.bearerToken = sessionData.session_token;
    }

    // Find device ID and user agent from any request
    const deviceRequest = this.sessionData.find(entry => 
      entry.type === 'request' && 
      entry.headers && 
      entry.headers['x-vidiq-device-id']
    );

    if (deviceRequest) {
      this.deviceId = deviceRequest.headers['x-vidiq-device-id'];
      this.userAgent = deviceRequest.headers['user-agent'];
    }

    // Find extension client version
    const extRequest = this.sessionData.find(entry => 
      entry.type === 'request' && 
      entry.headers && 
      entry.headers['x-vidiq-client'] &&
      entry.headers['x-vidiq-client'].startsWith('ext')
    );

    this.extVersion = extRequest ? 
      extRequest.headers['x-vidiq-client'] : 
      'ext vch/3.151.0'; // fallback
  }

  generateExtensionHeaders() {
    return {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': `Bearer ${this.bearerToken}`,
      'priority': 'u=1, i',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'none',
      'user-agent': this.userAgent,
      'x-amplitude-device-id': this.deviceId,
      'x-client-location': 'scorecard',
      'x-vidiq-client': this.extVersion
    };
  }

  generateCurlCommand(url, method = 'GET', data = null) {
    const headers = this.generateExtensionHeaders();
    let curl = `curl '${url}'`;
    
    if (method !== 'GET') {
      curl += ` -X ${method}`;
    }
    
    Object.entries(headers).forEach(([key, value]) => {
      curl += ` \\\n  -H '${key}: ${value}'`;
    });
    
    if (data) {
      curl += ` \\\n  -d '${JSON.stringify(data)}'`;
    }
    
    return curl;
  }
}

// Usage
const reconstructor = new ExtensionRequestReconstructor(
  './captured-requests/viq2-export-dad1651b-a8a8-4313-a13d-3d5ed5859aac-2025-09-10T07-33-10-455Z.jsonl'
);

const headers = reconstructor.generateExtensionHeaders();
const curlCommand = reconstructor.generateCurlCommand('https://api.vidiq.com/auth/user');

console.log('Extension Headers:', headers);
console.log('Curl Command:', curlCommand);
```

## ✅ Validation Checklist

When reconstructing extension requests, verify:

- [ ] **Bearer token format** matches `UKP!{account_id}!{session_id}`
- [ ] **Device ID** is valid UUID v4 format
- [ ] **User Agent** matches the captured browser session
- [ ] **Extension client** uses `ext vch/{version}` format
- [ ] **Security headers** (`sec-fetch-*`) are set correctly
- [ ] **Accept header** uses simplified `*/*` format
- [ ] **Client location** is set to `scorecard` for extension context

## 🚨 Important Notes

### Session Validity
- Bearer tokens have expiration times (typically 1 hour)
- Device IDs persist across sessions but are profile-specific
- Always use fresh tokens for active sessions

### Security Considerations
- Never commit actual bearer tokens to version control
- Device IDs should be treated as sensitive fingerprinting data
- Use this method only for legitimate automation and testing

### Rate Limiting
- Extension requests may have different rate limits than webapp
- Some endpoints may require specific client contexts
- Always respect API terms of service

## 📚 Related Documentation

- [REQUEST_CAPTURE_SYSTEM.md](./REQUEST_CAPTURE_SYSTEM.md) - How to capture session data
- [VIDIQ_DEVICE_ID_SOLUTION.md](./VIDIQ_DEVICE_ID_SOLUTION.md) - Device ID management
- [DevLog.md](./DevLog.md) - Development history and implementation notes

---

**Last Updated**: September 10, 2025  
**Tested With**: VidIQ Extension v3.151.0, Chrome 140.0.0.0