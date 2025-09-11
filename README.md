# Pl## Features

- 🚀 **Launch on fresh profiles** - Create temporary profiles for testing
- 📥 **Import from existing Chromium profiles** - Import cookies, extensions, bookmarks, and more
- 💾 **Save and track sessions** - Maintain profiles like regular browsers
- 🔄 **Clone, rename, and delete profiles** - Full profile management
- 🧹 **Cache clearing** - Reduce disk usage by clearing browser cache files
- 📦 **Profile compression** - Profiles auto-compress on close to save disk space (enabled by default)
- 🖥️ **CLI interface** - Easy command-line usage
- 🔧 **Programmatic API** - Use in your automation scriptsrofile Manager

A comprehensive browser profile manager for Playwright automation, similar to built-in Chrome/Firefox/Safari profile managers.

## Features

- 🚀 **Launch on fresh profiles** - Create temporary profiles for testing
- 📥 **Import from existing Chromium profiles** - Import cookies, extensions, bookmarks, and more
- 💾 **Save and track sessions** - Maintain profiles like regular browsers
- 🔄 **Clone, rename, and delete profiles** - Full profile management
- 🧹 **Cache clearing** - Reduce disk usage by clearing browser cache files
- � **Profile compression** - Profiles auto-compress on close to save disk
- �🖥️ **CLI interface** - Easy command-line usage
- 🔧 **Programmatic API** - Use in your automation scripts

## Installation

```bash
npm install
```

## CLI Usage

### Create a new profile
```bash
# Interactive creation
npx ppm create

# With options
npx ppm create -n "my-profile" -d "Development profile" -b chromium
```

### List all profiles
```bash
npx ppm list
npx ppm ls -v  # verbose output
```

### Import from existing Chromium browser
```bash
# Interactive browser and profile selection
npx ppm import

# Import with custom name
npx ppm import -n "imported-chrome-profile"

# Import from custom path
npx ppm import --path "/path/to/chrome/profile" -n "custom-import"

# Selective import - choose what data to import
npx ppm import --selective -n "selective-import"

# Import only Playwright-supported data
npx ppm import --playwright-only -n "playwright-import"
```

### Launch a profile
```bash
# Launch existing profile (auto-injects extensions from ./extensions folder)
npx ppm launch my-profile

# Launch with fresh temporary profile
npx ppm launch temp-profile --fresh

# Launch with options
npx ppm launch my-profile --browser chromium --devtools

# Disable compression for this session (will keep unpacked on close)
npx ppm launch my-profile --no-compress

# Inject specific extensions from paths
npx ppm launch my-profile --load-extensions /path/to/ext1 /path/to/ext2

# Disable automatic extension injection
npx ppm launch my-profile --no-auto-extensions

# Combine options
npx ppm launch my-profile --load-extensions /path/to/ext1 --devtools

# Autofill control options
npx ppm launch my-profile --no-autofill-stop-on-success  # Disable default stop-on-success behavior
npx ppm launch my-profile --autofill-enforce-mode       # Continue monitoring for race conditions
npx ppm launch my-profile --autofill-min-fields 3 --autofill-cooldown 60000  # Custom thresholds

# Headless automation mode - Complete automated workflow
npx ppm launch my-profile --headless-automation --auto-close-on-success
npx ppm launch my-profile --headless --headless-automation --auto-close-on-success
```

### Headless Automation Mode

The system supports complete headless automation workflows that can:
1. **Autofill forms** using the autofill hook system
2. **Perform human-like interactions** (scrolling, mouse movement, delays)
3. **Click submit buttons** automatically
4. **Monitor for success responses** using request capture
5. **Auto-close browser** when success is detected

```bash
# Basic headless automation
npx ppm launch my-profile --headless-automation

# Headless automation with auto-close
npx ppm launch my-profile --headless-automation --auto-close-on-success

# Headless automation with template (perfect for multi-account workflows)
npx ppm launch-template vpn-fresh user1 --headless-automation --auto-close-on-success

# Run multiple automated instances
npx ppm launch-template vpn-fresh user1 --headless-automation --auto-close-on-success --temp
npx ppm launch-template vpn-fresh user2 --headless-automation --auto-close-on-success --temp
npx ppm launch-template vpn-fresh user3 --headless-automation --auto-close-on-success --temp
```

**Headless Automation Features:**
- **🤖 Complete Automation**: No manual intervention required
- **🕐 Smart Timing**: Human-like delays and interactions
- **🎯 Success Detection**: Monitors specific API responses for completion
- **🚪 Auto-Close**: Automatically closes browser when workflow completes
- **🔄 Retry Logic**: Built-in retry mechanisms for failed workflows
- **📊 Progress Monitoring**: Real-time status updates and logging
- **🛡️ Stealth Integration**: Works with all stealth and fingerprinting features

**Automation Workflow:**
1. **Launch** browser with profile/template
2. **Navigate** to target signup page
3. **Wait** for autofill system to complete form filling
4. **Perform** human-like interactions (scrolling, mouse movement)
5. **Click** submit button with realistic delays
6. **Monitor** network requests for success indicators
7. **Close** browser automatically when success is detected

**Perfect for:**
- Multi-account creation workflows
- Automated signup processes
- Batch profile generation
- Unattended automation tasks
```

### Batch Automation (headed by default)

Run repeated automated signups with a single attempt per profile. Defaults to headed mode (recommended for higher success rates). Success is detected via automation completion and request capture; results are logged as JSONL for easy parsing.

```bash
# Headed (default), delete failed profiles automatically
npx ppm batch --template vidiq-clean \
    --count 5 \
    --prefix auto \
    --delete-on-failure

# Long run with extended delays for better spacing
npx ppm batch --template vidiq-clean \
    --count 20 \
    --prefix auto \
    --delete-on-failure \
    --delay 120 \
    --failure-delay 600

# Keep full cache for analysis (only for short runs)
npx ppm batch --template vidiq-clean \
    --count 3 \
    --prefix auto \
    --no-clear-cache

# Headless variant (optional), keep failed profiles
npx ppm batch --template vidiq-clean \
    --count 3 \
    --prefix auto \
    --headless

# Resume from existing prefix lineage (skip used indices)
npx ppm batch --template vidiq-clean \
    --count 3 \
    --prefix auto \
    --resume

# Quick run with minimal delays
npx ppm batch --template vidiq-clean \
    --count 5 \
    --prefix auto \
    --delete-on-failure \
    --delay 30 \
    --failure-delay 120
```

**Profile Naming**: Uses simple autoincremental numbering (e.g., `auto1`, `auto2`, `auto3`, etc.) for easy identification and management.

Batch options:
- `--template <name>`: Template profile to clone from (e.g., `vidiq-clean`).
- `--count <n>`: Number of profiles to create (default: 1).
- `--prefix <prefix>`: Profile name prefix (default: `auto`). Creates profiles like `{prefix}1`, `{prefix}2`, etc.
- `--resume`: Continue numbering by skipping indices already used by profiles with the same prefix. Useful to re-run batches later without name conflicts while keeping the same prefix lineage.
- `--timeout <ms>`: Per-run success timeout (default: 120000).
- `--captcha-grace <ms>`: Extra grace time if CAPTCHA detected (default: 45000).
- `--headless`: Run in headless mode (default: headed).
- `--delete-on-failure`: Delete the profile if the run fails.
- `--no-clear-cache`: Disable cache clearing for successful profiles (cache cleanup enabled by default).
- `--delay <seconds>`: Delay between successful runs in seconds (default: 60). Allows VPN and browser fingerprint cooldown.
- `--failure-delay <seconds>`: Delay after failed runs in seconds (default: 300). Extended cooldown for failure recovery.

Behavior:
- Single attempt per profile (no headed retry cycle).
- Profiles are permanent by default; successful profiles are preserved.
- **Cache cleanup enabled by default** for successful profiles to prevent disk space issues during long runs (disable with `--no-clear-cache`).
- **Intelligent delays**: 60s cooldown between successful runs, 5m cooldown after failures (customizable with `--delay` and `--failure-delay`).
- On failure with `--delete-on-failure`, the profile is removed.
- Writes a results file at `automation-results/batch-<prefix>-<timestamp>.jsonl` with per-attempt entries:
    - `timestamp, batchId, run, runId, profileId, profileName, attempt, headless, success, reason`
- Saves a best-effort screenshot on timeout to `automation-results/`.

Success detection:
- Automation completion events (from the automation hook system).
- 200/201 responses for `api.vidiq.com/subscriptions/active` or `/subscriptions/stripe/next-subscription`.

### Profile Name Migration

If you have existing timestamp-based profiles from older versions, you can migrate them to the new autoincremental naming:

```bash
# Migrate timestamp-based profile names to autoincremental (auto-2025-...01 -> auto1)
npx ppm migrate-names

# Skip confirmation prompt
npx ppm migrate-names -y
```

This will:
- Convert `auto-2025-09-11T02-37-46-464Z-01` → `auto1`
- Convert `auto-2025-09-11T02-38-18-236Z-02` → `auto2`
- etc.
- Also rename corresponding request capture files
- Preserve chronological order (oldest profiles get lowest numbers)

Batch options:
- `--template <name>`: Template profile to clone from (e.g., `vidiq-clean`).
- `--count <n>`: Number of profiles to create (default: 1).
- `--prefix <prefix>`: Profile name prefix (timestamp + index appended).
- `--resume`: Continue numbering by skipping indices already used by profiles with the same prefix. Useful to re-run batches later without name conflicts while keeping the same prefix lineage.
- `--timeout <ms>`: Per-run success timeout (default: 120000).
- `--captcha-grace <ms>`: Extra grace time if CAPTCHA detected (default: 45000).
- `--headless`: Run in headless mode (default: headed).
- `--delete-on-failure`: Delete the profile if the run fails.
- `--no-clear-cache`: Disable cache clearing for successful profiles (cache cleanup enabled by default).

Behavior:
- Single attempt per profile (no headed retry cycle).
- Profiles are permanent by default; successful profiles are preserved.
- **Cache cleanup enabled by default** for successful profiles to prevent disk space issues during long runs (disable with `--no-clear-cache`).
- On failure with `--delete-on-failure`, the profile is removed.
- Writes a results file at `automation-results/batch-<prefix>-<timestamp>.jsonl` with per-attempt entries:
    - `timestamp, batchId, run, runId, profileId, profileName, attempt, headless, success, reason`
- Saves a best-effort screenshot on timeout to `automation-results/`.

Success detection:
- Automation completion events (from the automation hook system).
- 200/201 responses for `api.vidiq.com/subscriptions/active` or `/subscriptions/stripe/next-subscription`.

### Launch from template with fingerprint randomization
```bash
# Launch from template with randomized fingerprint (perfect for multi-account automation)
npx ppm launch-template vpn-fresh user1

# Launch multiple instances from same template
npx ppm launch-template vpn-fresh user2
npx ppm launch-template vpn-fresh user3

# Launch with Mac-authentic screen resolution variation
npx ppm launch-template vpn-fresh user4 --vary-screen-resolution

# Launch with options
npx ppm launch-template my-template new-instance --devtools --stealth-preset maximum

# Disable fingerprint randomization (keep template fingerprint)
npx ppm launch-template my-template exact-copy --no-randomize-fingerprint

# Disable compression for this profile instance
npx ppm launch-template my-template new-instance --no-compress

# Temporary profile (auto-deleted when browser closes)
npx ppm launch-template my-template temp-session --temp

# Headless automation with template
npx ppm launch-template my-template auto-instance --headless-automation --auto-close-on-success
```

### Profile Compression

Profiles are automatically compressed when browsers close to save disk space. Compression is **enabled by default** but can be controlled at creation time and managed afterwards.

```bash
# Check compression status for all profiles
npx ppm compress

# Create profiles with compression disabled
npx ppm create -n my-profile --no-compress
npx ppm clone source-profile new-profile --no-compress
npx ppm launch-template template instance --no-compress

# Launch profiles with compression disabled for the session
npx ppm launch my-profile --no-compress
npx ppm launch-template template instance --no-compress

# Manually compress/decompress profiles
npx ppm compress --run --profile my-profile       # Compress specific profile
npx ppm compress --decompress --profile my-profile # Decompress specific profile
npx ppm compress --run                             # Compress all uncompressed profiles
npx ppm compress --decompress                      # Decompress all compressed profiles
npx ppm compress --run -y                          # Skip confirmation prompts

# Enable/disable compression preference for profiles
npx ppm compress --enable --profile my-profile     # Enable auto-compression
npx ppm compress --disable --profile my-profile    # Disable auto-compression
```

**Compression Benefits:**
- **Space Savings**: Compressed profiles typically use 90%+ less disk space
- **Automatic**: Works seamlessly without user intervention
- **Fast**: Compression/decompression happens in seconds
- **Selective**: Control which profiles get compressed
- **Transparent**: Launch automatically decompresses when needed

**How it works:**
1. **On launch**: Compressed profiles are automatically decompressed
2. **On close**: Profiles compress based on their preference setting (default: enabled)
3. **Manual control**: Use `compress` command for immediate compression operations
4. **Status tracking**: View compression status and disk usage with `npx ppm compress`
npx ppm launch-template vpn-template user1  # Default: stops on success
npx ppm launch-template vpn-template user2 --autofill-enforce-mode
npx ppm launch-template vpn-template user3 --no-autofill-stop-on-success  # Old behavior
```

**Template Launch Features:**
- **🎭 Fingerprint Randomization**: Each instance gets unique but authentic fingerprints
- **🔑 Extension Key Variation**: Unique VidIQ extension keys per instance
- **📱 Device ID Isolation**: Different device IDs for complete isolation
- **🛡️ Authentic Spoofing**: Only varies safe fingerprinting vectors (audio/canvas noise)
- **💾 Template Preservation**: Original template profile remains unchanged
- **🧹 Auto-cleanup**: Temporary profiles are cleaned up after session ends

**What gets randomized per instance:**
- ✅ **Audio fingerprinting noise** (0.0001-0.001 variation)
- ✅ **Canvas fingerprinting noise** (0.001-0.005 variation)  
- ✅ **VidIQ device ID** (unique per instance)
- ✅ **Extension installation key** (unique per instance)
- 🎛️ **Screen resolution** (optional Mac-authentic variation with `--vary-screen-resolution`)
- ❌ **WebGL vendor/renderer** (kept authentic for Mac)
- ❌ **User agent** (kept authentic)
- ❌ **Timezone/language** (kept authentic)

**Mac-authentic screen resolutions available:**
- MacBook Air 13": 1440x900
- MacBook Pro 13": 1680x1050  
- MacBook Pro 14": 1728x1117
- MacBook Pro 16": 1792x1120
- iMac 21.5": 1920x1080
- iMac 24": 2240x1260
- iMac 27"/Studio Display: 2560x1440
- iMac Pro/Pro Display XDR: 2880x1800

### Clone a profile
```bash
npx ppm clone source-profile new-profile-name
```

### Rename a profile
```bash
npx ppm rename old-name new-name
```

### Delete a profile
```bash
npx ppm delete profile-name
npx ppm rm profile-name --force  # skip confirmation
```

### View active sessions
```bash
npx ppm sessions
```

### Clear cache to reduce disk usage
```bash
# Clear cache for all profiles
npx ppm clear-cache --all

# Clear cache for specific profile  
npx ppm clear-cache --profile "my-profile"

# Skip confirmation prompt
npx ppm clear-cache --all --yes

# Launch with automatic cache clearing on exit
npx ppm launch my-profile --clear-cache-on-exit
```

**Cache clearing features:**
- **Safe operation**: Only removes cache files, preserves cookies, bookmarks, preferences, and extensions
- **Space reporting**: Shows exactly how much disk space was freed
- **Selective clearing**: Clear cache for all profiles or specific ones
- **Auto-clear on exit**: Optionally clear cache when browser sessions end
- **Detailed feedback**: Reports which directories and files were cleared

## Profile Compression

- Default behavior: profiles compress to a `.tgz` archive on close to save space.
- Launching automatically decompresses when needed.
- Disable per-profile at creation with `--no-compress`, or per-launch with `--no-compress`.

CLI:
```bash
# Show compression summary
npx ppm compress

# Compress all profiles now
npx ppm compress --run

# Decompress all profiles now
npx ppm compress --decompress

# Toggle preference for one profile
npx ppm compress --profile my-profile --disable
npx ppm compress --profile my-profile --enable
```
**Cache directories cleared:**
- Browser caches (Cache, Code Cache, GPU Cache)
- Graphics caches (GraphiteDawnCache, ShaderCache, GrShaderCache)  
- Extension caches (component_crx_cache, extensions_crx_cache)
- Temporary data (blob_storage, Shared Dictionary)
- Temporary files (SingletonCookie, BrowserMetrics, etc.)

## Programmatic Usage

```javascript
import { createProfileSystem } from './src/index.js';

// Create profile system
const system = createProfileSystem('./my-profiles');

// Create a new profile
const profile = await system.createProfile('test-profile', {
    description: 'Testing profile',
    browserType: 'chromium'
});

// Launch the profile (extension installation enabled by default)
const { browser, page, sessionId } = await system.launchProfile('test-profile');

// Use the browser
await page.goto('https://example.com');

// Close when done (optionally clear cache)
await system.profileLauncher.closeBrowser(sessionId, { clearCache: true });

// Or clear cache for all profiles
const results = await system.profileManager.clearAllProfilesCache();
console.log(`Cleared cache for ${results.length} profiles`);

// Clear cache for specific profile
const profile = await system.profileManager.clearProfileCache('test-profile');
console.log(`Cache cleared for: ${profile.name}`);

await system.cleanup();
```

## Profile Import

The system can import from these Chromium-based browsers (all release channels):
- **Google Chrome** - Stable, Beta, Dev, Canary
- **Microsoft Edge** - Stable, Beta, Dev, Canary  
- **Brave Browser** - Stable, Beta, Dev, Nightly
- **Opera** - Stable, Beta, Developer, GX
- **Chromium** - Open Source builds
- **Arc Browser** - Stable
- **Vivaldi** - Stable

### Import Features:
- **Browser-first selection** - Choose browser, then profile
- **Selective import** - Choose exactly what data to import
- **Playwright-optimized** - Import only data that Playwright can use
- **Custom path support** - Import from any Chromium profile directory
- **Smart naming** - Auto-suggests profile names with browser info

### What gets imported:
- ✅ **Cookies** (Playwright supported) - Login sessions, website preferences
- ✅ **Extensions** (Playwright supported) - Installed browser extensions
- ✅ **Bookmarks** - Saved bookmarks and bookmark bar
- ✅ **History** - Browsing history and visited links
- ✅ **Preferences** (Playwright supported) - Browser settings and configurations
- ✅ **Login Data** (Playwright supported) - Saved passwords and autofill data
- ✅ **Web Data** (Playwright supported) - Form autofill and web app data
- ✅ **Favicons** - Website icons and favicons
- ✅ **Shortcuts** - Website shortcuts and app shortcuts

*Items marked "Playwright supported" are essential for browser automation and are included in `--playwright-only` imports.*

## Directory Structure

```
profiles/
├── profiles.db          # SQLite database
└── data/
    ├── profile-id-1/     # Profile user data
    ├── profile-id-2/
    └── ...
```

## Automation Hooks System 🤖

The automation system uses configurable JavaScript hooks to define complete automation workflows for different websites and forms.

### How Automation Hooks Work

Automation hooks are JavaScript configuration files that define step-by-step workflows for automated form filling, submission, and success monitoring.

### Hook Structure

```javascript
export default {
    name: 'site-automation',
    description: 'Complete automation workflow for a site',
    
    // URL patterns to match
    urlPatterns: [
        'https://example.com/signup*',
        '*example.com*signup*'
    ],
    
    // Step-by-step workflow
    workflow: {
        // Step 1: Wait for autofill
        wait_for_autofill: {
            type: 'wait_for_autofill',
            timeout: 15000,
            minFilledFields: 2,
            expectedFields: ['input[name="email"]', 'input[name="password"]'],
            required: true
        },
        
        // Step 2: Human-like interactions
        human_interactions: {
            type: 'human_interactions',
            interactions: ['scroll', 'move_mouse', 'random_delay'],
            delay: { min: 500, max: 2000 },
            required: false
        },
        
        // Step 3: Click submit
        click_submit: {
            type: 'click_submit',
            selectors: ['button[type="submit"]', '.submit-btn'],
            required: true
        },
        
        // Step 4: Monitor success
        monitor_success: {
            type: 'monitor_success',
            timeout: 30000,
            successUrls: ['api.example.com/user/profile'],
            successStatuses: [200, 201],
            required: true
        }
    }
};
```

### Available Step Types

1. **`wait_for_autofill`** - Wait for form fields to be automatically filled
2. **`human_interactions`** - Perform human-like scrolling, mouse movement, delays
3. **`click_submit`** - Find and click submit button with human-like timing
4. **`monitor_success`** - Monitor network requests for success indicators
5. **`custom_script`** - Execute custom JavaScript functions

### Built-in Automation Hooks

- **`vidiq.js`** - Complete VidIQ signup automation workflow
- **`generic-signup.js`** - Template for general signup form automation

### Creating Custom Automation Hooks

1. Create a JavaScript file in `./automation-hooks/`
2. Export default object with hook configuration
3. Define URL patterns and workflow steps
4. Test with `--headless-automation` flag

### Example: Custom Site Hook

```javascript
// ./automation-hooks/my-site.js
export default {
    name: 'my-site-automation',
    urlPatterns: ['https://mysite.com/register*'],
    workflow: {
        wait_for_autofill: {
            type: 'wait_for_autofill',
            timeout: 10000,
            minFilledFields: 3,
            expectedFields: [
                'input[name="username"]',
                'input[name="email"]', 
                'input[name="password"]'
            ]
        },
        human_interactions: {
            type: 'human_interactions',
            interactions: ['random_delay', 'scroll'],
            delay: { min: 1000, max: 3000 }
        },
        click_submit: {
            type: 'click_submit',
            selectors: ['#register-btn', '.signup-button']
        },
        monitor_success: {
            type: 'monitor_success',
            successUrls: ['mysite.com/dashboard'],
            timeout: 20000
        }
    }
};
```

## API Reference

### ProfileManager

- `createProfile(name, options)` - Create a new profile
- `listProfiles()` - Get all profiles
- `getProfile(nameOrId)` - Get specific profile
- `deleteProfile(nameOrId)` - Delete a profile
- `cloneProfile(source, newName)` - Clone a profile
- `renameProfile(nameOrId, newName)` - Rename a profile
- `clearProfileCache(nameOrId)` - Clear cache for specific profile
- `clearAllProfilesCache()` - Clear cache for all profiles
- `formatBytes(bytes)` - Convert bytes to human-readable format

### ChromiumImporter

- `findChromiumProfiles()` - Find available Chromium profiles
- `importProfile(sourcePath, destPath)` - Import profile data

### ProfileLauncher

- `launchProfile(nameOrId, options)` - Launch a profile
- `launchFreshProfile(name, options)` - Launch temporary profile
- `closeBrowser(sessionId, options)` - Close browser session (supports `clearCache` option)
- `closeAllBrowsers(options)` - Close all browser sessions (supports `clearCache` option)
- `getActiveSessions()` - Get active sessions

## Extension Support

### How Extensions Work
Extensions are **injected at browser launch** - they cannot be installed manually during runtime. The system uses Playwright's extension injection method.

### Automatic Extension Injection
**Extensions from `./extensions` folder are automatically injected:**
```bash
# Auto-injects all extensions from ./extensions folder
npx ppm launch my-profile

# Disable automatic injection
npx ppm launch my-profile --no-auto-extensions
```

### Manual Extension Injection
Inject specific extensions from custom paths:
```bash
# Inject specific extensions
npx ppm launch my-profile --load-extensions /path/to/extension1 /path/to/extension2

# Combine with auto-injection disabled
npx ppm launch my-profile --no-auto-extensions --load-extensions /path/to/specific-ext
```

### VidIQ Extension Device ID Isolation 🎭

**Critical Feature**: The system provides complete isolation between profiles for VidIQ extension usage by creating profile-specific extension copies with unique device IDs and extension keys.

#### **How VidIQ Device ID Isolation Works:**

1. **Profile-Specific Device IDs**: Each profile gets a **deterministic but unique** VidIQ device ID
   - Generated using SHA256 hash of `profileName + '-vidiq-device-v1'`
   - Same profile = same device ID every time (consistent across launches)
   - Different profiles = completely different device IDs

2. **Profile-Specific Extension Keys**: Each profile gets a **unique extension installation key**
   - Generated using SHA256 hash of `profileName + '-vidiq-extension-key-v1'`
   - Prevents cross-profile tracking via extension fingerprinting

3. **Fresh Extension Copies**: On every launch, a fresh copy of the VidIQ extension is created
   - Original extension: `./extensions/pachckjkecffpdphbpmfolblodfkgbhl/3.151.0_0`
   - Profile copy: `./profiles/data/vidiq-extensions/{profileName}-vidiq-extension`
   - Extension manifest is modified with profile-specific key

4. **Automatic Cleanup**: Extension copies are cleaned up when browsers close
   - Prevents disk space accumulation (each extension ~15MB)
   - No orphaned extensions left behind

#### **Why This Design:**

✅ **Complete Isolation**: Each profile appears as a completely different VidIQ installation
✅ **Consistent Identity**: Same profile always gets the same device ID (not random)
✅ **Anti-Tracking**: Different extension keys prevent fingerprinting correlation
✅ **Space Efficient**: Extensions are cleaned up after each session
✅ **Transparent**: Works automatically without user intervention

#### **Extension Lifecycle:**

```bash
# Launch profile
npx ppm launch my-profile
# → Creates fresh VidIQ extension copy with unique device ID
# → Browser launches with profile-specific extension

# Use browser with VidIQ
# → Extension uses deterministic device ID for this profile
# → API requests include profile-specific device ID

# Close browser
# → Extension copy is automatically cleaned up
# → No disk space accumulation

# Next launch of same profile  
npx ppm launch my-profile
# → Creates fresh extension copy again
# → Uses SAME device ID as before (deterministic)
```

#### **Device ID Examples:**

```javascript
// Profile: "vidiq-clean" always gets device ID:
// 327948f8-59b6-44f5-9356-0f6a9a8804d8

// Profile: "user-batch-001" always gets device ID:  
// 8fa2c15e-7b91-4c2a-a123-9dfe84c7b629

// Each profile gets its own unique but consistent ID
```

#### **Benefits for Multi-Account Workflows:**

- **Batch Operations**: Each batch profile gets isolated device ID
- **Template Launches**: Each instance from template gets unique device ID
- **Account Separation**: Complete isolation prevents account correlation
- **Automation Safe**: Perfect for headless automation workflows

### Extension Management Workflow
1. **Add extensions** to `./extensions/extension-id/version/` folder
2. **Launch profile** - extensions are automatically injected
3. **VidIQ special handling** - gets profile-specific copy with unique device ID
4. **Extensions persist** for that browser session only
5. **Auto-cleanup** - VidIQ extension copies are removed on close
6. **Next launch** - fresh extensions injected again (required every time)

### Important Notes
- ❌ **No manual installation**: Cannot install extensions via Chrome Web Store or chrome://extensions/
- ✅ **Injection only**: Extensions must be pre-downloaded and placed in folders
- ✅ **Session-based**: Extensions are injected per browser session
- ✅ **VidIQ isolation**: Automatic device ID isolation for VidIQ extension
- ✅ **Auto-cleanup**: Extension copies cleaned up automatically
- ✅ **Works with Chromium**: Uses Playwright's `channel: 'chromium'` requirement

### Imported Extensions
Extensions imported from existing Chrome profiles are automatically injected when the profile is launched.

## Browser Support

- **Chromium**: Full support with persistent user data directory and extension loading
- **Firefox**: Basic support with storage state persistence
- **WebKit**: Basic support with storage state persistence

## Stealth Features 🛡️

Advanced anti-bot and fingerprinting protection powered by playwright-extra stealth plugin and custom implementations:

### Available Protection Methods

- **WebGL Fingerprinting Protection** - Spoofs WebGL vendor, renderer, and extension information
- **Audio Fingerprinting Protection** - Adds noise to audio analysis or disables AudioContext entirely
- **Canvas Fingerprinting Protection** - Adds subtle noise to canvas rendering
- **Screen Spoofing** - Masks real screen resolution and color depth
- **Hardware Spoofing** - Spoofs CPU cores and memory information
- **Battery API Spoofing** - Provides fake battery status information
- **Language/Timezone Spoofing** - Masks real language and timezone settings
- **User Agent Randomization** - Generates realistic user agent strings

### Stealth CLI Commands

```bash
# Launch with stealth features
ppm-stealth stealth-launch my-profile --preset balanced --test-fingerprint

# Test fingerprint of active sessions
ppm-stealth test-fingerprint --comprehensive --save

# Manage stealth configurations
ppm-stealth stealth-config --profile my-profile --save maximum
ppm-stealth stealth-config --profile my-profile --show

# Compare fingerprints
ppm-stealth compare-fingerprints --session1 abc123 --session2 def456

# View sessions with stealth info
ppm-stealth sessions
```

### Stealth Presets

- **minimal**: Essential anti-bot protection only (WebGL spoofing, keeps everything else authentic)
- **balanced**: Conservative protection (WebGL + minimal audio/canvas noise, keeps user agent and other info authentic) - **DEFAULT**
- **maximum**: Aggressive protection (all features enabled, may break some sites or look suspicious)

### Fingerprint Testing

Integrated fingerprinting analysis using [MixVisit](https://github.com/mixvisit-service/mixvisit):

```bash
# Test fingerprint with comprehensive analysis
ppm-stealth test-fingerprint --comprehensive --save

# Compare before/after stealth configurations
ppm-stealth compare-fingerprints --session1 normal --session2 stealth
```

### Authenticity Analysis & Bot Detection Risk Assessment

Advanced authenticity testing with comprehensive bot detection analysis:

```bash
# Run preflight authenticity check before launching
ppm-stealth preflight-check my-profile --preset balanced

# Compare authenticity across different stealth presets
ppm-stealth compare-authenticity my-profile

# Test authenticity of active sessions
ppm-stealth test-authenticity --comprehensive --save
```

**Authenticity Scoring System:**
- **🟢 80-100%**: LOW RISK - Excellent authenticity, low bot detection probability
- **🟡 60-79%**: MEDIUM RISK - Good authenticity, acceptable for most use cases
- **🟠 40-59%**: HIGH RISK - Suspicious patterns detected, review configuration
- **🔴 0-39%**: CRITICAL RISK - High bot detection probability, requires immediate attention

**Analysis Features:**
- **Professional Bot Detection**: Primary scoring via iphey.com (40% weight) and Pixelscan (30% weight)
- **Multi-site Validation**: Tests consistency across specialized detection frameworks
- **Behavioral Analysis**: Analyzes automation indicators and performance patterns (15% weight)
- **Preflight Validation**: Test configurations before launching production sessions
- **Risk Assessment**: Comprehensive scoring with actionable recommendations
- **Data Validation**: AmIUnique provides additional uniqueness data for context

### Programmatic Usage with Stealth

```javascript
import { createProfileSystem } from './src/index.js';

const system = createProfileSystem('./profiles');

// Launch with stealth features
const { browser, page } = await system.launchProfile('my-profile', {
    stealth: true,
    stealthPreset: 'balanced',
    testFingerprint: true
});

// Custom stealth configuration
const customConfig = {
    webgl: { enabled: true, vendor: 'Custom Vendor' },
    audio: { enabled: true, noiseAmount: 0.001 },
    canvas: { enabled: true, noiseAmount: 0.01 }
};

const result = await system.launchProfile('my-profile', {
    stealth: true,
    stealthConfig: customConfig
});

// Test fingerprint
const fingerprint = await system.profileLauncher.testFingerprint(result.sessionId);
console.log(fingerprint.tests.mixvisit.fingerprintHash);

// NEW: Authenticity testing and validation
// Run preflight authenticity check
const preflightResults = await system.profileLauncher.runPreflightAuthenticityCheck('my-profile');
console.log(`Authenticity Score: ${(preflightResults.authenticityAnalysis.scores.overall * 100).toFixed(1)}%`);
console.log(`Risk Level: ${preflightResults.riskLevel}`);
console.log(`Passed: ${preflightResults.passed}`);

// Compare authenticity across presets
const comparison = await system.profileLauncher.compareStealthAuthenticity('my-profile');
console.log(`Best Preset: ${comparison.recommendations.best_preset}`);

// Test authenticity of active session
const authenticityResults = await system.profileLauncher.testAuthenticity(result.sessionId);
console.log(`Authenticity Score: ${(authenticityResults.scores.overall * 100).toFixed(1)}%`);
console.log(`Suspicion Flags: ${authenticityResults.scores.suspicion_flags.length}`);
```

## Future Features

- Web frontend interface (localhost)
- Firefox profile import
- Safari profile import
- Profile synchronization
- Extension management UI
- Session recording/replay
- Advanced ML-based fingerprint evasion

## Requirements

- Node.js 16+
- Playwright
