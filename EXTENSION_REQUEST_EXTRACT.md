# Request Extractor Guide

## Overview

This guide explains how to extract and reconstruct authentic browser extension API requests using data captured from webapp sessions. The system now includes **session validation** to ensure only successful authentication flows are processed, preventing extraction from failed sessions. This is particularly useful for automation, testing, and understanding the relationship between webapp and extension authentication flows.

## Background

Browser extensions and webapps often share authentication tokens and session data, but they use different request headers and client identifiers. By capturing webapp session data, we can extract the core authentication components needed to reconstruct extension requests.

## �️ Session Validation

**NEW**: The system now automatically validates sessions before processing to ensure only successful authentication flows are used for extraction.

### Validation Criteria
A session is considered **successful** if it meets these requirements:

1. **Successful Signup**: `/auth/signup` responds with status `200` (not `400`)
2. **Successful Login**: `/auth/login` responds with status `200` (not `400`)
3. **Valid Authentication**: Presence of valid `Bearer UKP!` authorization tokens
4. **Active API Access**: Successful `/subscriptions/active` requests with status `200`

### Validation Process
```javascript
// Example validation result for successful session
{
  success: true,
  reason: 'Complete successful authentication flow detected',
  details: {
    hasSignup: true,
    signupSuccess: true,
    hasLogin: true,
    loginSuccess: true,
    hasAuthenticatedRequests: true,
    authTokenFound: true
  }
}

// Example validation result for failed session
{
  success: false,
  reason: 'Signup failed with 400 error',
  details: {
    hasSignup: true,
    signupSuccess: false,  // ❌ This causes rejection
    hasLogin: false,
    loginSuccess: false,
    hasAuthenticatedRequests: false,
    authTokenFound: false
  }
}
```

### Automatic Rejection
Sessions with these issues are **automatically rejected**:
- ❌ Signup returns `400` status (invalid input, CAPTCHA failure, etc.)
- ❌ Login returns `400` status (authentication failure)
- ❌ No valid authorization tokens found
- ❌ No successful authenticated API requests

This prevents attempting to extract data from broken or incomplete sessions.

### Benefits of Session Validation
- **\u2705 Quality Assurance**: Only processes sessions with confirmed successful authentication
- **\u274c Error Prevention**: Avoids extracting invalid or incomplete auth tokens  
- **\ud83d\udd52 Time Saving**: Immediate feedback instead of discovering auth failures later
- **\ud83d\udccb Clear Diagnostics**: Specific error messages explain why a session was rejected
- **\ud83d\udd04 Batch Processing**: Safely process multiple profiles without manual verification

## �🔍 Data Sources

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

## � CLI Usage

### Basic Commands

```bash
# Extract minimal headers from a session (validates session first)
node request-extractor-cli.js headers <profile-name-or-session-id>

# Extract headers for multiple profiles
node request-extractor-cli.js bulk-headers <prefix>

# Full reconstruction with analysis
node request-extractor-cli.js reconstruct <profile-name-or-session-id>

# List available sessions
node request-extractor-cli.js list-sessions

# Analyze extraction capabilities
node request-extractor-cli.js analyze
```

### Examples

```bash
# Extract headers from successful session
$ node request-extractor-cli.js headers auto-headless-1
{
  "extensionHeaders": {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "authorization": "Bearer UKP!ea10d364-c6c3-48eb-b8ec-54a0d7c31028!170ad0ef-7a02-4ac3-abf1-881c22609e81",
    "x-vidiq-client": "ext vch/3.151.0",
    "x-amplitude-device-id": "65100539-1247-47a9-abf3-65548917cb74",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
    "content-type": "application/json"
  }
}

# Attempt to extract from failed session (automatic rejection)
$ node request-extractor-cli.js headers auto-run3
❌ Error: Failed to load session data: Session validation failed: Signup failed with 400 error. This appears to be a failed session that should not be processed.

# Extract headers for all profiles with prefix "viq"
$ node request-extractor-cli.js bulk-headers viq
[
  {
    "name": "viq1",
    "extension": {
      "headers": {
        "accept-language": "en-US,en;q=0.9",
        "authorization": "Bearer UKP!...",
        "accept": "*/*",
        "x-vidiq-client": "ext vch/3.151.0",
        "x-amplitude-device-id": "..."
      }
    }
  }
]
```

### Session Validation in Action

The extractor automatically validates sessions and provides clear feedback:

```bash
# Successful session processing
$ node request-extractor-cli.js reconstruct auto-headless-1
🔍 Starting reconstruction for: auto-headless-1
📋 Found latest session: b1343f08-4a16-48c9-886c-92a54d393cc0
📊 Loading session data for: b1343f08-4a16-48c9-886c-92a54d393cc0
✅ Session validation passed: Complete successful authentication flow detected
📊 Loaded 12 requests from validated successful session
...

# Failed session rejection
$ node request-extractor-cli.js reconstruct auto-run3
❌ Error: Session validation failed: Signup failed with 400 error. This appears to be a failed session that should not be processed.
```

## �🛠️ Reconstruction Process

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
const { RequestExtractor } = require('./src/RequestExtractor.js');

// Using the CLI (recommended)
const { spawn } = require('child_process');

function extractHeaders(profileOrSessionId) {
  return new Promise((resolve, reject) => {
    const process = spawn('node', ['request-extractor-cli.js', 'headers', profileOrSessionId]);
    let output = '';
    let error = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          resolve(result.extensionHeaders);
        } catch (e) {
          reject(new Error(`Failed to parse output: ${e.message}`));
        }
      } else {
        reject(new Error(`Extraction failed: ${error}`));
      }
    });
  });
}

// Direct API usage (advanced)
class RequestExtractor {
  constructor(options = {}) {
    this.capturedRequestsDir = options.capturedRequestsDir || './captured-requests';
    this.quiet = !!options.quiet;
  }

  // Session validation with comprehensive checks
  validateSessionSuccess(allRequests) {
    const validation = {
      success: false,
      reason: 'Unknown',
      details: {
        hasSignup: false,
        signupSuccess: false,
        hasLogin: false, 
        loginSuccess: false,
        hasAuthenticatedRequests: false,
        authTokenFound: false
      }
    };

    const responses = allRequests.filter(req => req.type === 'response');
    const requests = allRequests.filter(req => req.type === 'request');

    // Check signup flow
    const signupResponse = responses.find(resp => 
        resp.url && resp.url.includes('/auth/signup')
    );
    if (signupResponse) {
        validation.details.hasSignup = true;
        validation.details.signupSuccess = signupResponse.status === 200;
    }

    // Check login flow  
    const loginResponse = responses.find(resp => 
        resp.url && resp.url.includes('/auth/login')
    );
    if (loginResponse) {
        validation.details.hasLogin = true;
        validation.details.loginSuccess = loginResponse.status === 200;
    }

    // Check for successful subscription check (key success indicator)
    const subscriptionResponse = responses.find(resp => 
        resp.url && resp.url.includes('/subscriptions/active') && resp.status === 200
    );
    if (subscriptionResponse) {
        validation.details.hasAuthenticatedRequests = true;
    }

    // Check for valid authorization tokens in requests
    const authRequest = requests.find(req => 
        req.headers && req.headers.authorization && 
        req.headers.authorization.startsWith('Bearer UKP!')
    );
    if (authRequest) {
        validation.details.authTokenFound = true;
    }

    // Determine overall success
    if (validation.details.signupSuccess && validation.details.loginSuccess && 
        validation.details.hasAuthenticatedRequests && validation.details.authTokenFound) {
        validation.success = true;
        validation.reason = 'Complete successful authentication flow detected';
    } else if (validation.details.authTokenFound && validation.details.hasAuthenticatedRequests) {
        validation.success = true;
        validation.reason = 'Valid authentication and API access detected';
    } else if (signupResponse && signupResponse.status === 400) {
        validation.success = false;
        validation.reason = 'Signup failed with 400 error';
    } else if (loginResponse && loginResponse.status === 400) {
        validation.success = false;
        validation.reason = 'Login failed with 400 error';
    } else {
        validation.success = false;
        validation.reason = 'No valid authentication flow detected';
    }

    return validation;
  }

  async loadSessionData(sessionId) {
    // Implementation includes session validation before processing
    const allRequests = await this.loadRawSessionData(sessionId);
    
    // Validate session success before proceeding
    const validation = this.validateSessionSuccess(allRequests);
    if (!validation.success) {
        throw new Error(`Session validation failed: ${validation.reason}. This appears to be a failed session that should not be processed.`);
    }

    if (!this.quiet) {
        console.log(`✅ Session validation passed: ${validation.reason}`);
    }

    return allRequests.filter(req => req.type === 'request');
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

// Usage Examples

// Method 1: CLI (Recommended - includes validation)
async function example1() {
  try {
    const headers = await extractHeaders('viq2');
    console.log('Extension Headers:', headers);
  } catch (error) {
    console.error('Extraction failed:', error.message);
    // Example error: "Session validation failed: Signup failed with 400 error"
  }
}

// Method 2: Direct API (Advanced)
async function example2() {
  const extractor = new RequestExtractor();
  
  try {
    const result = await extractor.generateHeadersObject('viq2');
    console.log('Extension Headers:', result.extensionHeaders);
  } catch (error) {
    if (error.message.includes('Session validation failed')) {
      console.log('❌ This session had authentication failures and cannot be used');
    } else {
      console.error('Other error:', error.message);
    }
  }
}

// Method 3: Bulk extraction for multiple profiles
async function example3() {
  const extractor = new RequestExtractor({ quiet: true });
  const results = await extractor.generateHeadersForProfiles('viq');
  
  console.log(`✅ Successfully extracted headers from ${results.length} profiles`);
  results.forEach(profile => {
    console.log(`${profile.name}: ${Object.keys(profile.extension.headers).length} headers`);
  });
}
```

## ✅ Validation Checklist

The system now automatically validates most of these, but for manual verification:

### Session Validation (Automatic)
- [x] **Session success** - Signup/login returned 200 status ✅ *Automatic*
- [x] **Authentication tokens** - Valid Bearer tokens present ✅ *Automatic*
- [x] **API access** - Successful authenticated requests ✅ *Automatic*

### Header Validation (Manual)
- [ ] **Bearer token format** matches `UKP!{account_id}!{session_id}`
- [ ] **Device ID** is valid UUID v4 format
- [ ] **User Agent** matches the captured browser session
- [ ] **Extension client** uses `ext vch/{version}` format
- [ ] **Security headers** (`sec-fetch-*`) are set correctly
- [ ] **Accept header** uses simplified `*/*` format
- [ ] **Client location** is set to `scorecard` for extension context

## 🔧 Troubleshooting

### Common Issues

#### "Session validation failed: Signup failed with 400 error"
**Cause**: The session had authentication failures during signup.
**Solution**: Use a different session with successful authentication.
**Example**: Switch from `auto-run3` to `auto-headless-1`

#### "Session validation failed: Login failed with 400 error" 
**Cause**: The session had authentication failures during login.
**Solution**: Ensure the profile has valid credentials and completed signup successfully.

#### "Session validation failed: No valid authentication flow detected"
**Cause**: The session data is incomplete or doesn't contain proper auth flow.
**Solution**: Capture a complete session from signup through to authenticated API calls.

#### "No sessions found for profile: xyz"
**Cause**: No captured request files exist for that profile.
**Solution**: Run the profile with request capture enabled first.

### Debugging Steps

1. **List available sessions**:
   ```bash
   node request-extractor-cli.js list-sessions
   ```

2. **Check session details**:
   ```bash
   # Look for status codes in the captured file
   grep '"status":' captured-requests/profile-name-*.jsonl
   ```

3. **Verify authentication flow**:
   ```bash
   # Check for successful signup/login
   grep -A 1 -B 1 'auth/signup\|auth/login' captured-requests/profile-name-*.jsonl
   ```

4. **Test with known good session**:
   ```bash
   # Use a session that worked before
   node request-extractor-cli.js headers auto-headless-1
   ```

## 🚨 Important Notes

### Session Validity
- Bearer tokens have expiration times (typically 1 hour)
- Device IDs persist across sessions but are profile-specific
- Always use fresh tokens for active sessions

### Security Considerations
- Never commit actual bearer tokens to version control
- Device IDs should be treated as sensitive fingerprinting data
- Use this method only for legitimate automation and testing
- **Session validation helps prevent using compromised/invalid tokens**

### Rate Limiting
- Extension requests may have different rate limits than webapp
- Some endpoints may require specific client contexts
- Always respect API terms of service
- **Use validated sessions to avoid unnecessary failed requests**

### Best Practices
- **Always use CLI tool for extraction** - includes built-in validation and error handling
- **Verify session success before bulk operations** - saves time and resources
- **Monitor request logs** - look for patterns that indicate detection
- **Rotate device IDs periodically** - use `--randomize` option for new device IDs
- **Keep extension version updated** - match current VidIQ extension version

## 📚 Related Documentation

- [REQUEST_CAPTURE_SYSTEM.md](./REQUEST_CAPTURE_SYSTEM.md) - How to capture session data
- [VIDIQ_DEVICE_ID_SOLUTION.md](./VIDIQ_DEVICE_ID_SOLUTION.md) - Device ID management
- [DevLog.md](./DevLog.md) - Development history and implementation notes
- [README.md](./README.md) - Profile Manager setup and usage

## 📁 Tool Files

- **CLI Tool**: `request-extractor-cli.js` (formerly `extension-reconstructor.js`)
- **Core Library**: `src/RequestExtractor.js` (formerly `src/ExtensionRequestReconstructor.js`)
- **Output Directory**: `./reconstructed-requests/`
- **Captured Data**: `./captured-requests/`

---

**Last Updated**: September 11, 2025  
**New Features**: Session validation, automatic failure detection, renamed tools for clarity  
**Tested With**: VidIQ Extension v3.151.0, Chrome 140.0.0.0