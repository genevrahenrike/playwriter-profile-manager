# Smart Autofill Extension

An intelligent browser extension that automatically fills form fields with realistic random data using advanced pattern matching and data generation.

## Features

- 🤖 **Intelligent Field Detection**: Uses wildcard pattern matching to detect email and password fields
- 🎲 **Realistic Data Generation**: Generates authentic-looking names, emails, and passwords
- 🌍 **International Names**: Supports names from multiple cultures and languages
- 🔒 **Secure Passwords**: Generates strong passwords with customizable complexity
- ⚡ **Multiple Activation Methods**: Keyboard shortcuts, context menu, popup, and visual indicator
- 🎨 **Visual Feedback**: Shows when fields are filled with smooth animations
- ⚙️ **Configurable Settings**: Customize behavior through the popup interface

## Installation

### Chrome/Chromium-based Browsers

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `extensions/autofill-extension` folder
4. The extension icon should appear in your browser toolbar

### Firefox (Manifest V2 compatible)

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the extension folder

## Usage

### Activation Methods

1. **Visual Indicator**: Click the 🤖 icon that appears on pages with forms
2. **Keyboard Shortcut**: Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac)
3. **Context Menu**: Right-click on any page and select "Fill form with random data"
4. **Extension Popup**: Click the extension icon and use "Fill Current Form"

### Supported Field Types

The extension automatically detects and fills:

- **Email Fields**: 
  - `type="email"`
  - Fields with names/IDs containing: email, e-mail, mail, username, user, login, account
  - Placeholder text containing email-related terms

- **Password Fields**:
  - `type="password"`
  - Fields with names/IDs containing: password, pass, pwd, passwd
  - Password confirmation fields (confirm, repeat, verify, retype)

### Generated Data Examples

- **Emails**: `erik.mueller47@gmail.com`, `maria.santos@protonmail.com`
- **Passwords**: Strong passwords with uppercase, lowercase, numbers, and symbols
- **Username Styles**: 
  - Concatenated: `erikmueller2847`
  - Separated: `erik.mueller.47`
  - Business: `e.mueller`, `erik.m`
  - Handle: `larimo`, `venaro`

## Configuration

Access settings through the extension popup:

- **Show Notifications**: Enable/disable fill notifications
- **Keyboard Shortcut**: Enable/disable `Ctrl+Shift+F` shortcut
- **Auto-fill on Load**: Automatically fill forms when pages load (optional)

## Technical Details

### Architecture

- **Content Script** (`content.js`): Handles form detection and field filling
- **Background Script** (`background.js`): Manages extension lifecycle and settings
- **Data Generator** (`data-generator.js`): Generates realistic random data
- **Popup Interface** (`popup.html/css/js`): User interface for controls and settings

### Field Detection Algorithm

The extension uses sophisticated pattern matching:

1. **Type-based Detection**: Checks `input[type="email"]` and `input[type="password"]`
2. **Attribute Matching**: Analyzes `name`, `id`, `placeholder`, and `class` attributes
3. **Wildcard Patterns**: Uses regex patterns for flexible matching
4. **Context Analysis**: Distinguishes between password and confirmation fields

### Data Generation

Based on the `RandomDataGenerator.js` from the main project:

- **International Names**: Nordic, Germanic, Romance, Slavic, Celtic names
- **Realistic Email Providers**: Weighted distribution of popular email services
- **Secure Passwords**: Configurable length and complexity requirements
- **Multiple Username Styles**: Business, concatenated, separated, and handle formats

## Testing

Use the included `test-form.html` file to test the extension:

1. Open `test-form.html` in your browser
2. Try different activation methods on various form types
3. Verify that fields are detected and filled correctly
4. Check that password confirmation fields use the same password

### Test Cases Included

- Original form structure (CSS classes: `css-16eyn40`, `css-q9o9ex`)
- Various field naming patterns
- ID-based detection
- Class-based detection
- Login forms
- Minimal field names
- Edge cases and complex forms

## Development

### File Structure

```
extensions/autofill-extension/
├── manifest.json          # Extension manifest
├── background.js          # Background script
├── content.js            # Content script
├── data-generator.js     # Data generation logic
├── popup.html           # Popup interface
├── popup.css            # Popup styles
├── popup.js             # Popup functionality
├── test-form.html       # Test page
├── icons/               # Extension icons
└── README.md           # This file
```

### Key Components

1. **Field Detection**: Wildcard pattern matching for maximum compatibility
2. **Data Generation**: Realistic data using international name databases
3. **Visual Feedback**: Smooth animations and notifications
4. **Settings Management**: Persistent configuration storage
5. **Multiple Interfaces**: Popup, context menu, keyboard shortcuts

### Extending the Extension

To add new field types or patterns:

1. Update the pattern arrays in `content.js`
2. Add new detection methods in the field matching functions
3. Extend the data generator for new data types
4. Update the popup interface for new settings

## Privacy & Security

- **No Data Collection**: All data generation happens locally
- **No Network Requests**: Extension works completely offline
- **Temporary Data**: Generated data is not stored permanently
- **Secure Generation**: Uses cryptographically secure random number generation

## Browser Compatibility

- ✅ Chrome 88+
- ✅ Edge 88+
- ✅ Opera 74+
- ✅ Brave
- ⚠️ Firefox (requires Manifest V2 compatibility)

## Troubleshooting

### Extension Not Working

1. Check that Developer Mode is enabled
2. Reload the extension after making changes
3. Check browser console for error messages
4. Verify the extension has necessary permissions

### Fields Not Being Detected

1. Check if fields match the detection patterns
2. Use browser DevTools to inspect field attributes
3. Add custom patterns to the detection arrays
4. Test with the included `test-form.html`

### Generated Data Issues

1. Verify the data generator is loading correctly
2. Check console for JavaScript errors
3. Test data generation in isolation
4. Ensure all required files are present

## Contributing

To contribute to this extension:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with `test-form.html`
5. Submit a pull request

## License

This extension is part of the Playwriter Profile Manager project and follows the same licensing terms.

## Changelog

### Version 1.0.0
- Initial release
- Intelligent field detection with wildcard patterns
- Realistic data generation using international names
- Multiple activation methods
- Visual feedback and animations
- Configurable settings
- Comprehensive test suite