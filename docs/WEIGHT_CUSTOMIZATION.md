# Per-Site Weight Customization for Name Generation

## Overview

The random name generation system now supports per-site weight customization through autofill hook configurations. This allows fine-tuning of username patterns, number flavors, and email provider preferences for different sites.

## Weight Types

### 1. Pattern Weights (`patternWeights`)

Controls the distribution of username generation patterns:

- **`concatenated`**: Clean firstname+lastname style (e.g., `erikmueller2847`)
- **`separated`**: Modern separated style (e.g., `erik.mueller.47`)
- **`business`**: Professional abbreviations (e.g., `j.doe`, `erik.s`)
- **`handle`**: Short pronounceable handles (e.g., `larimo`, `venaro`)

**Default weights:**
```javascript
patternWeights: {
    concatenated: 4,    // Most common
    separated: 2.5,     // Modern professional
    business: 1.5,      // Professional contexts (increased from 0.8)
    handle: 3           // Distinctive personal style
}
```

### 2. Number Flavor Weights (`numberFlavorWeights`)

Controls the digit postfix distribution:

- **`none`**: No numbers (clean professional look)
- **`d2`**: Two-digit postfix (10-99)
- **`d4`**: Four-digit postfix (1000-9999)

**Default weights:**
```javascript
numberFlavorWeights: {
    none: 4,    // Professional clean look
    d2: 1.5,    // Common postfix
    d4: 0.2     // Rare for most use cases
}
```

### 3. Email Provider Weights (`emailProviders`)

Controls email domain distribution with custom provider lists:

**Updated default weights:**
- `proton.me`: Reduced from 5 to 2 (less common)
- `mailbox.org`: Reduced from 1 to 0.5 (less common)
- Business domain weight increased from 0.8 to 1.5

## Hook Configuration

### Basic Example

```javascript
export default {
    name: 'my-site-autofill',
    useDynamicGeneration: true,
    
    generationOptions: {
        // Custom pattern weights for this site
        patternWeights: {
            concatenated: 3,
            separated: 4,    // Favor separated style
            business: 2,
            handle: 1
        },
        
        // Custom number preferences
        numberFlavorWeights: {
            none: 5,         // Favor clean look
            d2: 2,
            d4: 0.1
        },
        
        // Custom email providers
        emailProviders: [
            { domain: 'gmail.com', weight: 35 },
            { domain: 'outlook.com', weight: 15 },
            { domain: 'proton.me', weight: 1 }  // Minimal
        ]
    }
    // ... rest of hook config
};
```

### VidIQ Example

The VidIQ hook demonstrates professional video platform preferences:

```javascript
generationOptions: {
    patternWeights: {
        concatenated: 3,    // Creative platform friendly
        separated: 4,       // Professional look (increased)
        business: 2,        // Clean professional
        handle: 1           // Reduced for platform
    },
    
    numberFlavorWeights: {
        none: 2,            // Clean professional
        d2: 3,              // Common for video platforms
        d4: 0.1             // Rare
    },
    
    emailProviders: [
        { domain: 'gmail.com', weight: 35 },  // Increased for video
        { domain: 'outlook.com', weight: 15 },
        { domain: 'proton.me', weight: 1 }    // Minimal for professional
    ]
}
```

## Implementation Details

### Weight Override Flow

1. **Hook Configuration**: Weights defined in autofill hook `generationOptions`
2. **AutofillHookSystem**: Passes hook weights to RandomDataGenerator
3. **RandomDataGenerator**: Uses provided weights or falls back to defaults
4. **Generation**: Applies weighted random selection using custom weights

### Backwards Compatibility

- All weight configurations are optional
- Missing weights fall back to system defaults
- Existing hooks continue to work without modification
- Generic hooks can include commented examples

### Testing

```bash
# Test custom weights
node -e "
import('./src/RandomDataGenerator.js').then(({ RandomDataGenerator }) => {
  const gen = new RandomDataGenerator();
  const data = gen.generateUserData({
    patternWeights: { business: 10, concatenated: 1 },
    numberFlavorWeights: { none: 10, d2: 1 }
  });
  console.log(data.fullName, data.email, data.usernameStyle);
});
"

# Test autofill hook
npx ppm launch my-profile --automation  # Uses hook-specific weights
```

## Benefits

1. **Site-Specific Optimization**: Tailor username styles to platform culture
2. **Professional vs Personal**: Adjust formality for different contexts  
3. **Email Provider Control**: Optimize for platform compatibility
4. **A/B Testing**: Compare different weight distributions
5. **Brand Consistency**: Maintain consistent naming across campaigns

## Migration Guide

To migrate existing hooks to use custom weights:

1. Add `generationOptions` object to hook config
2. Define custom `patternWeights`, `numberFlavorWeights`, or `emailProviders`
3. Test with small weight adjustments first
4. Monitor generation results and adjust as needed

The system maintains full backwards compatibility, so migration is optional and can be done incrementally.