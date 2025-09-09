# Request Capture System

The Request Capture System is a powerful extension to the Playwright Profile Manager that enables automated sniffing and capturing of network requests, responses, and browser interactions. It's designed with a hook-based architecture similar to the autofill system, allowing for flexible, site-specific capture configurations.

## Features

- **Hook-based Architecture**: Similar to autofill hooks, capture hooks can be configured per site/domain/URL pattern
- **Comprehensive Request Capture**: Captures HTTP requests, responses, and page-level interactions
- **Token & Authentication Extraction**: Automatically extracts JWT tokens, API keys, and authentication headers
- **Multiple Output Formats**: Supports JSONL, JSON, and CSV export formats
- **Real-time Monitoring**: Captures requests as they happen during browser sessions
- **VidIQ Integration**: Pre-configured hooks for capturing VidIQ API calls and extension interactions
- **Browser Storage Access**: Extracts tokens from localStorage, sessionStorage, and cookies
- **CLI Integration**: Full command-line interface for managing captures

## Architecture

### Core Components

1. **RequestCaptureSystem** (`src/RequestCaptureSystem.js`)
   - Main capture engine
   - Hook loading and management
   - Request/response interception
   - Data storage and export

2. **Capture Hooks** (`capture-hooks/`)
   - Site-specific capture configurations
   - Custom capture logic
   - URL pattern matching
   - Token extraction rules

3. **ProfileLauncher Integration**
   - Automatic capture system initialization
   - Session-based request tracking
   - Cleanup and export on session end

## Quick Start

### 1. Launch a Profile with Request Capture

```bash
# Launch with request capture enabled (default)
npx ppm launch my-profile

# Launch with specific capture settings
npx ppm launch my-profile --capture-format jsonl --capture-dir ./my-captures

# Launch without request capture
npx ppm launch my-profile --no-capture
```

### 2. Check Capture Status

```bash
# View system status and loaded hooks
npx ppm capture --status
```

### 3. Monitor Captured Requests

```bash
# List captured requests for a session
npx ppm capture --list <session-id>

# Export captured requests
npx ppm capture --export <session-id> --format jsonl
```

### 4. Run the Demo

```bash
# Run the comprehensive demo
node examples/request-capture-example.js
```

## Capture Hooks Configuration

Capture hooks are JavaScript files in the `capture-hooks/` directory that define what requests to capture and how to process them.

### Basic Hook Structure

```javascript
export default {
    name: 'my-site-capture',
    description: 'Capture requests for my site',
    enabled: true,
    
    // URL patterns to monitor
    urlPatterns: [
        'https://mysite.com/*',
        'https://api.mysite.com/*',
        /.*mysite.*/i
    ],
    
    // Capture rules
    captureRules: {
        methods: ['GET', 'POST', 'PUT'],
        requestUrlPatterns: ['https://api.mysite.com/*'],
        responseUrlPatterns: ['https://api.mysite.com/*'],
        statusCodes: [200, 201, 401, 403],
        captureResponseBody: true,
        
        // Headers to capture
        requestHeaders: {
            'authorization': null,
            'x-api-key': null
        },
        responseHeaders: {
            'set-cookie': null,
            'x-auth-token': null
        }
    },
    
    // Custom capture logic
    async customRequestCapture(request, sessionId) {
        // Extract custom data from requests
        return {
            extractedData: {},
            tokens: {},
            isAuthenticated: false
        };
    },
    
    async customResponseCapture(response, sessionId) {
        // Extract custom data from responses
        return {
            extractedData: {},
            tokens: {},
            userInfo: {}
        };
    },
    
    async customPageCapture(page, sessionId, captureSystem) {
        // Extract data from page context (localStorage, etc.)
        return {
            localStorage: {},
            sessionStorage: {},
            extractedTokens: {}
        };
    }
};
```

### VidIQ Hook Example

The included VidIQ hook (`capture-hooks/vidiq.js`) demonstrates advanced capture capabilities:

- Captures all VidIQ API requests and responses
- Extracts JWT tokens from headers, cookies, and response bodies
- Monitors localStorage and sessionStorage for authentication data
- Detects VidIQ extension presence and interactions
- Captures YouTube page interactions that trigger VidIQ API calls

## Output Formats

### JSONL (JSON Lines) - Default

Each line is a separate JSON object representing a captured request/response:

```jsonl
{"timestamp":"2024-01-01T12:00:00.000Z","type":"request","hookName":"vidiq-capture","sessionId":"abc123","url":"https://api.vidiq.com/users/me","method":"GET","headers":{"authorization":"Bearer eyJ..."},"custom":{"tokens":{"authorization":"Bearer eyJ..."},"isAuthenticated":true}}
{"timestamp":"2024-01-01T12:00:01.000Z","type":"response","hookName":"vidiq-capture","sessionId":"abc123","url":"https://api.vidiq.com/users/me","status":200,"body":"{\"user\":{\"email\":\"user@example.com\"}}","custom":{"userInfo":{"email":"user@example.com"}}}
```

### JSON

Complete array of all captured requests:

```json
[
  {
    "timestamp": "2024-01-01T12:00:00.000Z",
    "type": "request",
    "hookName": "vidiq-capture",
    "sessionId": "abc123",
    "url": "https://api.vidiq.com/users/me",
    "method": "GET",
    "headers": {
      "authorization": "Bearer eyJ..."
    },
    "custom": {
      "tokens": {
        "authorization": "Bearer eyJ..."
      },
      "isAuthenticated": true
    }
  }
]
```

### CSV

Flattened representation suitable for spreadsheet analysis:

```csv
timestamp,type,hookName,url,method,status,headers
2024-01-01T12:00:00.000Z,request,vidiq-capture,https://api.vidiq.com/users/me,GET,"{""authorization"":""Bearer eyJ...""}"
```

## CLI Commands

### Launch Commands

```bash
# Basic launch with capture
npx ppm launch my-profile

# Custom capture settings
npx ppm launch my-profile --capture-format json --capture-dir ./exports

# Disable capture
npx ppm launch my-profile --no-capture
```

### Capture Management

```bash
# Show system status
npx ppm capture --status

# List captured requests
npx ppm capture --list <session-id>

# Export requests
npx ppm capture --export <session-id> --format jsonl --output ./my-export.jsonl

# Reload hooks
npx ppm capture --reload

# Cleanup data
npx ppm capture --cleanup          # All sessions
npx ppm capture --cleanup <session-id>  # Specific session
```

## Integration with Existing Workflow

The request capture system integrates seamlessly with the existing profile management workflow:

### With VPN Profiles

```bash
# Launch VPN profile with request capture
npx ppm launch vpn-fresh --capture-format jsonl
```

The system will:
1. Load the VPN-enabled profile
2. Start request capture monitoring
3. Capture all VidIQ API calls as you navigate
4. Export captured data when the session ends

### With Autofill System

Both systems work together:
- Autofill handles form filling
- Request capture monitors the resulting API calls
- Perfect for signup flows where you want to capture both the form submission and the authentication response

## Use Cases

### 1. API Token Extraction

Capture authentication tokens from web applications:

```javascript
// In your capture hook
async customResponseCapture(response, sessionId) {
    const body = await response.text();
    const tokenMatch = body.match(/access_token":"([^"]+)"/);
    
    if (tokenMatch) {
        return {
            tokens: {
                access_token: tokenMatch[1]
            }
        };
    }
}
```

### 2. Extension Monitoring

Monitor browser extension API calls:

```javascript
urlPatterns: [
    'https://api.extension.com/*',
    'chrome-extension://*'
],

captureRules: {
    requestHeaders: {
        'x-extension-id': null,
        'x-extension-version': null
    }
}
```

### 3. Session Analysis

Analyze user sessions and interactions:

```javascript
async customPageCapture(page, sessionId, captureSystem) {
    return {
        pageInfo: {
            url: page.url(),
            title: await page.title(),
            timestamp: new Date().toISOString()
        },
        localStorage: await page.evaluate(() => ({ ...localStorage })),
        sessionStorage: await page.evaluate(() => ({ ...sessionStorage }))
    };
}
```

## Advanced Configuration

### Custom Hook Development

1. Create a new file in `capture-hooks/`
2. Follow the hook structure pattern
3. Implement custom capture logic
4. Test with `npx ppm capture --reload`

### Output Directory Structure

The system now uses **per-hook file naming** for better organization:

```
captured-requests/
├── vpn-fresh-vidiq-capture-abc123.jsonl      # VidIQ requests for vpn-fresh profile
├── vpn-fresh-generic-capture-abc123.jsonl    # Other requests for vpn-fresh profile  
├── test-profile-vidiq-capture-def456.jsonl   # VidIQ requests for test-profile
├── vpn-fresh-export-abc123-2024-01-01.json   # Manual export files
└── test-profile-export-def456-2024-01-01.csv # Different format exports
```

**File naming convention**: `{profile-name}-{hook-name}-{session-id}.jsonl`

- `profile-name`: Cleaned profile name (special characters replaced with `-`)
- `hook-name`: The capture hook that captured the request (e.g., `vidiq-capture`)
- `session-id`: Unique session identifier

This allows you to easily:
- **Filter by site/service**: All VidIQ requests across sessions
- **Filter by profile**: All requests from a specific profile
- **Filter by session**: All requests from a specific browser session

### Performance Considerations

- **Request Filtering**: Use specific URL patterns to avoid capturing unnecessary requests
- **Response Body Size**: Large responses are automatically truncated (configurable)
- **Memory Management**: Sessions are cleaned up automatically with configurable limits
- **Storage**: JSONL files are appended in real-time to minimize memory usage

## Troubleshooting

### No Requests Captured

1. Check if hooks are loaded: `npx ppm capture --status`
2. Verify URL patterns match the target site
3. Ensure capture is enabled in launch options
4. Check the browser console for errors

### Missing Tokens

1. Verify the token extraction logic in custom capture functions
2. Check if tokens are in different headers/locations than expected
3. Enable response body capture for tokens in response content
4. Monitor browser storage (localStorage/sessionStorage) capture

### Export Issues

1. Check output directory permissions
2. Verify session ID is correct
3. Ensure requests were actually captured for that session
4. Try different export formats

## Security Considerations

- **Sensitive Data**: Captured data may contain authentication tokens and personal information
- **Storage**: Secure the output directory appropriately
- **Cleanup**: Regularly clean up captured data
- **Access Control**: Limit access to capture files

## Future Enhancements

- **Real-time Dashboard**: Web interface for monitoring captures
- **Advanced Filtering**: More sophisticated request filtering options
- **Encryption**: Encrypt sensitive captured data
- **Cloud Export**: Direct export to cloud storage services
- **Webhook Integration**: Real-time notifications of captured tokens

## Contributing

To add new capture hooks or enhance the system:

1. Create hooks in `capture-hooks/`
2. Test with the example script
3. Update documentation
4. Submit pull requests

The request capture system is designed to be extensible and can be adapted for any web application or API that needs monitoring and token extraction.
