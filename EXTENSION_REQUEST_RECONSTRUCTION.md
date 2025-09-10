# Extension Request Reconstruction Guide

## Overview

Generate authentic browser extension API requests from captured webapp sessions. The tool reconstructs extension-compatible headers with proper authentication tokens and device fingerprinting.

## Quick Start

```bash
# Generate headers for all profiles with "viq" prefix
node extension-reconstructor.js bulk-headers viq

# Use captured device IDs instead of randomizing
node extension-reconstructor.js bulk-headers viq --no-randomize

# Generate headers for a single profile
node extension-reconstructor.js headers viq1
```

## Commands

### `bulk-headers <prefix>`
Generate extension headers for all profiles matching a prefix:

```bash
node extension-reconstructor.js bulk-headers viq
```

**Output format:**
```json
[
  {
    "name": "viq1",
    "extension": {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "authorization": "Bearer UKP!...",
        "priority": "u=1, i",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "none",
        "x-amplitude-device-id": "...",
        "x-vidiq-client": "ext vch/3.151.0"
      }
    }
  }
]
```

**Options:**
- `--no-randomize`: Use captured device IDs instead of generating new ones

### `headers <profile>`
Generate headers for a single profile:

```bash
node extension-reconstructor.js headers viq1
```

### `list-sessions`
View available sessions:

```bash
node extension-reconstructor.js list-sessions
```

## Key Features

- **Automatic Profile Discovery**: Scans for all profiles matching a prefix
- **Latest Session Selection**: Uses the most recent session for each profile
- **Extension Header Mapping**: Converts webapp headers to extension format
- **Device ID Management**: Option to randomize or use captured device IDs
- **Bearer Token Extraction**: Automatically extracts authentication tokens

## Data Sources

The tool uses captured session data from:
- **Location**: `./captured-requests/`
- **Format**: JSONL files with request/response pairs
- **Source**: Playwright Profile Manager capture system

## Authentication Components

| Component | Format | Purpose |
|-----------|--------|---------|
| Bearer Token | `Bearer UKP!{account_id}!{session_id}` | API authentication |
| Device ID | UUID v4 | Browser fingerprinting |
| Client ID | `ext vch/3.151.0` | Extension identification |

## Usage Examples

### Save to File
```bash
node extension-reconstructor.js bulk-headers viq > headers.json
```

### Use in Scripts
```javascript
const { exec } = require('child_process');
exec('node extension-reconstructor.js bulk-headers viq', (error, stdout) => {
  const headers = JSON.parse(stdout);
  // Use headers for API requests
});
```

## Important Notes

- **Session Validity**: Bearer tokens typically expire after 1 hour
- **Device IDs**: Persistent across sessions but profile-specific
- **Rate Limiting**: Extension requests may have different limits than webapp
- **Security**: Never commit actual tokens to version control

## Related Documentation

- [REQUEST_CAPTURE_SYSTEM.md](./REQUEST_CAPTURE_SYSTEM.md) - Session capture setup
- [VIDIQ_DEVICE_ID_SOLUTION.md](./VIDIQ_DEVICE_ID_SOLUTION.md) - Device ID management
- [DevLog.md](./DevLog.md) - Development history

---
**Last Updated**: September 10, 2025