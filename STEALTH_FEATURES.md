# Stealth Features Documentation 🛡️

## Overview

The Playwright Profile Manager now includes comprehensive anti-bot and fingerprinting protection features. These enhancements leverage both the `playwright-extra` stealth plugin and custom implementations to provide robust protection against browser fingerprinting and automated detection.

## Key Features Added

### 1. StealthManager (`src/StealthManager.js`)

A comprehensive stealth management system that provides:

- **WebGL Fingerprinting Protection**: Spoofs WebGL vendor, renderer, and extension information
- **Audio Fingerprinting Protection**: Adds configurable noise to audio analysis or disables AudioContext
- **Canvas Fingerprinting Protection**: Adds subtle noise to canvas rendering to prevent fingerprinting
- **Screen Spoofing**: Masks real screen resolution, color depth, and other display properties
- **Hardware Spoofing**: Spoofs CPU cores, memory information, and device capabilities
- **Battery API Spoofing**: Provides fake battery status to prevent battery-based fingerprinting
- **Language/Timezone Spoofing**: Masks real language preferences and timezone settings
- **User Agent Randomization**: Generates realistic user agent strings

### 2. FingerprintTester (`src/FingerprintTester.js`)

Advanced fingerprinting analysis and testing:

- **MixVisit Integration**: Uses the MixVisit library for comprehensive fingerprint analysis
- **Multi-Site Testing**: Tests fingerprints across multiple fingerprinting sites
- **Custom Analysis**: Runs detailed custom fingerprint tests
- **Comparison Tools**: Compares fingerprints between different configurations
- **Result Persistence**: Saves and loads test results for analysis

### 3. Enhanced ProfileLauncher

Updated with stealth capabilities:

- **Stealth Integration**: Seamlessly integrates stealth features into profile launching
- **Configuration Management**: Save/load stealth configurations per profile
- **Real-time Testing**: Test fingerprints of active browser sessions
- **Preset Support**: Easy-to-use presets for different protection levels

### 4. Stealth CLI (`src/StealthCLI.js`)

Dedicated command-line interface for stealth features:

- **stealth-launch**: Launch profiles with stealth protection
- **test-fingerprint**: Test and analyze browser fingerprints
- **compare-fingerprints**: Compare fingerprints between sessions
- **stealth-config**: Manage stealth configurations
- **sessions**: View active sessions with stealth information

## Installation & Setup

The stealth features are automatically included when you install the project dependencies:

```bash
npm install
```

Key dependencies added:
- `playwright-extra`: Enhanced Playwright with plugin support
- `puppeteer-extra-plugin-stealth`: Comprehensive stealth plugin
- `@mix-visit/lite`: Fingerprinting analysis library

## Usage Examples

### Basic Stealth Launch

```bash
# Launch with balanced stealth preset
ppm-stealth stealth-launch my-profile --preset balanced

# Launch with maximum protection and fingerprint testing
ppm-stealth stealth-launch my-profile --preset maximum --test-fingerprint
```

### Programmatic Usage

```javascript
import { createProfileSystem } from './src/index.js';

const system = createProfileSystem('./profiles');

// Launch with stealth features
const result = await system.launchProfile('my-profile', {
    stealth: true,
    stealthPreset: 'balanced',
    testFingerprint: true
});

// Custom stealth configuration
const customConfig = {
    webgl: { 
        enabled: true, 
        vendor: 'Intel Inc.', 
        renderer: 'Intel Iris Pro OpenGL Engine' 
    },
    audio: { 
        enabled: true, 
        noiseAmount: 0.001 
    },
    canvas: { 
        enabled: true, 
        noiseAmount: 0.01 
    }
};

const customResult = await system.launchProfile('my-profile', {
    stealth: true,
    stealthConfig: customConfig
});
```

### Fingerprint Testing

```bash
# Test fingerprint of active session
ppm-stealth test-fingerprint

# Comprehensive test with multiple sites
ppm-stealth test-fingerprint --comprehensive --save

# Compare two sessions
ppm-stealth compare-fingerprints --session1 abc123 --session2 def456
```

### Configuration Management

```bash
# Save a preset to profile
ppm-stealth stealth-config --profile my-profile --save balanced

# Show current configuration
ppm-stealth stealth-config --profile my-profile --show

# Create custom configuration interactively
ppm-stealth stealth-config --profile my-profile --custom
```

## Stealth Presets

### Minimal
- **Protection**: Essential anti-bot protection only (WebGL spoofing)
- **Authenticity**: Keeps everything else authentic (real user agent, timezone, screen, etc.)
- **Compatibility**: Excellent - works with all sites
- **Use Case**: Basic bot detection evasion while maintaining authenticity

### Balanced (Default)
- **Protection**: Conservative protection (WebGL + minimal audio/canvas noise)
- **Authenticity**: Keeps user agent, timezone, screen, hardware info authentic
- **Compatibility**: Excellent - very unlikely to break sites
- **Use Case**: General automation with good protection and authenticity balance

### Maximum
- **Protection**: All features enabled with aggressive settings
- **Authenticity**: Fakes many browser properties (may look suspicious)
- **Compatibility**: May break some sites or trigger additional scrutiny
- **Use Case**: High-security scenarios where maximum protection is needed despite authenticity concerns

## Fingerprint Analysis

The system provides comprehensive fingerprint analysis through multiple methods:

### MixVisit Integration
- Generates unique fingerprint hashes
- Measures load time and performance
- Provides detailed fingerprint breakdown

### Custom Analysis
- Navigator properties analysis
- WebGL capabilities detection
- Canvas rendering analysis
- Audio context capabilities
- Screen and hardware information
- Performance and memory metrics

### Multi-Site Testing
- Tests against multiple fingerprinting sites
- Compares results across different services
- Identifies potential detection vectors

## Advanced Configuration

### Custom WebGL Spoofing

```javascript
const config = {
    webgl: {
        enabled: true,
        vendor: 'NVIDIA Corporation',
        renderer: 'GeForce GTX 1080/PCIe/SSE2',
        unmaskedVendor: 'NVIDIA Corporation',
        unmaskedRenderer: 'GeForce GTX 1080'
    }
};
```

### Audio Protection Options

```javascript
const config = {
    audio: {
        enabled: true,
        noiseAmount: 0.001, // Small noise amount
        enableAudioContext: false // Completely disable AudioContext
    }
};
```

### Screen Spoofing

```javascript
const config = {
    screen: {
        enabled: true,
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24
    }
};
```

## File Structure

```
src/
├── StealthManager.js      # Core stealth functionality
├── FingerprintTester.js   # Fingerprint testing and analysis
├── StealthCLI.js         # Stealth-specific CLI commands
└── ProfileLauncher.js    # Enhanced with stealth integration

examples/
└── stealth-example.js    # Comprehensive usage examples
```

## Integration with Existing Features

The stealth features seamlessly integrate with existing functionality:

- **Profile Management**: Stealth configs are saved per profile
- **Extension Support**: Works with imported and injected extensions
- **Browser Support**: Primarily Chromium, with basic support for Firefox/WebKit
- **Session Management**: Stealth status is tracked per session

## Testing and Validation

### Automated Testing
Run the example script to test all features:

```bash
node examples/stealth-example.js
```

### Manual Validation
1. Launch a profile with stealth features
2. Visit fingerprinting sites like:
   - https://mixvisit.com
   - https://iphey.com
   - https://amiunique.org/fp
   - https://coveryourtracks.eff.org/
3. Compare results with and without stealth features

### Fingerprint Comparison
Use the comparison tools to validate effectiveness:

```bash
# Compare normal vs stealth fingerprints
ppm-stealth compare-fingerprints --session1 normal --session2 stealth
```

## Performance Considerations

- **Minimal Impact**: Stealth features add minimal overhead
- **Selective Application**: Can be disabled for performance-critical scenarios
- **Preset Optimization**: Different presets balance protection vs performance

## Troubleshooting

### Common Issues

1. **Sites Breaking**: Try using 'minimal' or 'balanced' presets
2. **Extension Conflicts**: Some extensions may conflict with stealth features
3. **Performance Issues**: Disable unnecessary protection features

### Debug Mode
Enable verbose logging to troubleshoot issues:

```javascript
const result = await system.launchProfile('profile', {
    stealth: true,
    stealthPreset: 'balanced',
    args: ['--enable-logging', '--v=1']
});
```

## Future Enhancements

- **ML-Based Evasion**: Machine learning for dynamic fingerprint evasion
- **Behavioral Mimicking**: Human-like interaction patterns
- **Advanced Canvas Protection**: More sophisticated canvas noise algorithms
- **Real-time Adaptation**: Dynamic adjustment based on detection attempts
- **Firefox/WebKit Support**: Enhanced stealth for non-Chromium browsers

## Contributing

To contribute to the stealth features:

1. Test new protection methods in `StealthManager.js`
2. Add fingerprinting tests in `FingerprintTester.js`
3. Update CLI commands in `StealthCLI.js`
4. Add comprehensive examples
5. Update documentation

## Security Notice

These stealth features are designed for legitimate automation and privacy protection. Always comply with website terms of service and applicable laws when using these tools.
