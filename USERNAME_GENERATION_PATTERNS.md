# Enhanced Username Generation Patterns

This document describes the improved random username generation system that provides two distinct patterns to reduce identifiability while maintaining high uniqueness and collision avoidance.

## Overview

The enhanced `RandomDataGenerator` now supports multiple username generation patterns and business domain integration to create more diverse and less identifiable usernames.

## Username Generation Patterns

### Pattern A: Concatenated Style
- **Format**: `firstname + lastname + optional_digits`
- **Examples**: 
  - `erikmueller2847`
  - `mariasantos1234`
  - `lucaferrari9876`
- **Characteristics**:
  - Clean, compact usernames
  - 4-digit postfix for uniqueness
  - No separators, all lowercase
  - Highly unique due to large name pool + random digits

### Pattern B: Separator-based Style
- **Format**: `firstname + separator + lastname + separator + short_digits`
- **Examples**:
  - `erik.mueller.47`
  - `maria_santos_12`
  - `luca-ferrari-98`
- **Characteristics**:
  - Uses separators: `.`, `_`, `-`
  - Shorter 2-digit postfix to avoid overly long usernames
  - More readable and modern appearance
  - Different visual pattern from Pattern A

### Pattern C: Short Syllabic Handle
- Format: pronounceable random handle from curated syllables
- Examples:
  - `larimo`
  - `venaro`
  - `melodu`
- Characteristics:
  - Short, no digits or separators
  - High uniqueness via random syllable sequences
  - Latin-like phonetics for a Western handle feel
  - Configurable syllable count and blocklist

### Business Mode
- **User Formats**: `full` or `alias` (no digits by default)
- **Format (full)**: `business_name + separator + first + separator + last`
- **Format (alias)**: common corporate aliases like `flast`, `lfirst`, `f.last`, `first.l`, `firstlast`, etc.
- **Examples**:
  - `globaltech.john.doe`
  - `innovativesolutions.jdoe`
  - `quantumdynamics.djohn`
- **Characteristics**:
  - More realistic corporate usernames (no numeric postfix)
  - Two sub-modes: full name or common alias
  - Uses business prefixes, suffixes, and domain terms
  - Suitable for corporate/professional contexts
  - Uses business email providers

## Configuration Options

### Basic Configuration
```javascript
const generator = new RandomDataGenerator({
    usernameStyle: 'auto',        // 'auto', 'concatenated', 'separated', 'business'
    usernamePattern: 'random',    // 'random', 'pattern_a', 'pattern_b', 'pattern_c'
    separatorChars: ['.', '_', '-'],
    businessMode: false,
    usePrefix: false,
    usePostfix: true,
  postfixDigits: 4,
  // NEW: weighted selection across all four patterns
  patternWeights: { concatenated: 1, separated: 1, business: 1, handle: 1 },
  // NEW: business user portion formatting
  businessUserFormat: 'auto', // 'auto' | 'full' | 'alias'
  businessFormatWeights: { full: 1, alias: 1 },
  // Optional: restrict alias patterns
  // businessAliasPatterns: ['flast','f.last','first.l']
  // NEW: handle options for Pattern C
  handleSyllables: 4, // 3-6 supported, 4 default
  handleBlocklist: ['admin','support','test','user','service','root','system']
});
```

### AutofillHookSystem Integration
```javascript
const autofillSystem = new AutofillHookSystem({
    usernameStyle: 'auto',
    usernamePattern: 'random',
    businessMode: false,
    separatorChars: ['.', '_', '-'],
  // Propagates to RandomDataGenerator
  patternWeights: { concatenated: 1, separated: 1, business: 1, handle: 1 },
  businessUserFormat: 'auto',
  businessFormatWeights: { full: 1, alias: 1 },
  // businessAliasPatterns: ['flast','f.last','first.l'],
  handleSyllables: 4,
  handleBlocklist: ['admin','support']
    businessEmailProviders: [
        { domain: 'company.com', weight: 20 },
        { domain: 'corp.com', weight: 15 }
    ]
});
```

## Email Provider Integration

### Standard Email Providers
- Gmail, Yahoo, Outlook, Hotmail
- Privacy-focused: ProtonMail, Tutanota
- Alternative: iCloud, AOL, Yandex, etc.

### Business Email Providers
- company.com, corp.com, business.com
- enterprise.com, solutions.com, services.com
- consulting.com, group.com, partners.com

## Business Name Components

### Prefixes
- **Tech**: global, innovative, advanced, digital, smart
- **Corporate**: premier, strategic, dynamic, progressive
- **Modern**: quantum, matrix, nexus, fusion, stellar

### Suffixes
- **Services**: solutions, systems, technologies, consulting
- **Corporate**: enterprises, ventures, partners, group
- **Creative**: studios, works, forge, design, agency

### Domains
- **Technology**: tech, ai, ml, blockchain, fintech
- **Business**: marketing, finance, operations, strategy
- **Innovation**: bio, nano, cyber, data, cloud

## Uniqueness and Collision Avoidance

### Collision Prevention
- Large pool of international names (500+ first names, 400+ last names)
- Random digit postfixes (1000-9999 for Pattern A, 10-99 for Pattern B)
- Database tracking of used combinations
- Configurable retry attempts (default: 50)

### Uniqueness Statistics
- **Name Pool Size**: ~200,000 base combinations
- **With 4-digit postfix**: ~1.8 billion possible usernames
- **With 2-digit postfix**: ~18 million possible usernames
- **Collision Rate**: <0.01% in typical usage

## Usage Examples

### Pattern A (Concatenated)
```javascript
const generator = new RandomDataGenerator({
    usernameStyle: 'concatenated',
    usernamePattern: 'pattern_a'
});

const userData = generator.generateUserData();
// Result: erikmueller2847@gmail.com
```

### Pattern B (Separated)
```javascript
const generator = new RandomDataGenerator({
    usernameStyle: 'separated',
    usernamePattern: 'pattern_b'
});

const userData = generator.generateUserData();
// Result: erik.mueller.47@yahoo.com
```

### Pattern C (Short Handle)
```javascript
const generator = new RandomDataGenerator({
  usernameStyle: 'handle',
  usernamePattern: 'pattern_c',
  handleSyllables: 4 // optional, default 4
});

const userData = generator.generateUserData();
// Result: larimo@gmail.com (no digits, short and unique)
```

### Business Mode (Full and Alias)
```javascript
// Full name style (no digits)
const generatorFull = new RandomDataGenerator({
  businessMode: true,
  businessUserFormat: 'full'
});
const userFull = generatorFull.generateUserData();
// Example: globaltech.john.doe@corp.com

// Alias style (no digits) with weighted alias choice
const generatorAlias = new RandomDataGenerator({
  businessMode: true,
  businessUserFormat: 'alias',
  businessAliasPatterns: ['flast','f.last','first.l']
});
const userAlias = generatorAlias.generateUserData();
// Example: innovativesolutions.jdoe@company.com
```

### Auto Mode (Weighted Random Selection)
```javascript
const generator = new RandomDataGenerator({
    usernameStyle: 'auto',
  usernamePattern: 'random',
  patternWeights: { concatenated: 1, separated: 1, business: 1, handle: 1 }
});

// Randomly selects between the three patterns by weight
const userData1 = generator.generateUserData(); // Could be Pattern A
const userData2 = generator.generateUserData(); // Could be Pattern B
const userData3 = generator.generateUserData(); // Could be Business
const userData4 = generator.generateUserData(); // Could be Short Handle (C)
```

## Database Schema Updates

The tracking database now includes additional fields:

```sql
CREATE TABLE user_data_exports (
    -- ... existing fields ...
    username_style TEXT,        -- 'concatenated', 'separated', 'business'
    username_pattern TEXT,      -- 'pattern_a', 'pattern_b', 'business'
    business_mode INTEGER DEFAULT 0,
    -- ... existing fields ...
);
```

New table for short handles (Pattern C):

```sql
CREATE TABLE generated_handles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_count INTEGER DEFAULT 1
);
```

## Benefits

### Reduced Identifiability
- Two distinct visual patterns make detection harder
- Business mode provides professional appearance
- Random pattern selection prevents consistent signatures

### High Uniqueness
- Large name pools from international sources
- Multiple digit postfix strategies
- Collision detection and retry logic

### Flexibility
- Configurable patterns and separators
- Business vs. personal email contexts
- Integration with existing autofill systems

## Testing

Run the test suite to validate functionality:

```bash
node examples/username-patterns-test.js
```

This will demonstrate:
- Pattern A and B generation
- Business mode functionality
- Auto mode random selection
- Pattern C short-handle generation
- Uniqueness validation (100% unique in typical usage)

## Migration

Existing configurations will continue to work with default settings. To enable new features:

1. Update configuration to specify `usernameStyle` and `usernamePattern`
2. Add `businessEmailProviders` if using business mode
3. Configure `separatorChars` for Pattern B customization
4. Optionally enable Pattern C in auto mode via `patternWeights.handle` or use `usernameStyle: 'handle'`

The system is backward compatible and will default to automatic pattern selection if no specific configuration is provided.