# Enhanced Username Generation Patterns

This document describes the improved random username generation system that provides two distinct patterns to reduce identifiability while maintaining high uniqueness and collision avoidance.

## Overview

The enhanced `RandomDataGenerator` now supports multiple username generation patterns with optimized weighting for natural-looking output. The system uses business domain integration and decoupled number flavors to create diverse, less identifiable usernames while maintaining high authenticity.

**Key Features:**
- **Four distinct patterns**: Concatenated, separated, short handles, and business styles
- **Decoupled number flavors**: Independent digit strategy (none/2-digit/4-digit)
- **Context-aware generation**: Business emails use professional styles, personal emails include handles
- **Quality optimization**: 82% quality score with natural-looking usernames dominating
- **Pattern breaking**: Weighted randomization prevents detection signatures

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
- **Format**: pronounceable random handle from phonetic components (onsets, nuclei, codas)
- **Examples**:
  - `brondar`
  - `slenai`
  - `glorft`
  - `tristua`
  - `chompo`
- **Characteristics**:
  - Short, no digits or separators
  - High uniqueness via random phonetic assembly (V, CV, VC, CVC structures)
  - Latin-like phonetics for a Western handle feel
  - Configurable syllable count (2-4) and internal blocklist
  - **Very common in personal emails** (28% with optimized weights)

## Pattern Distribution (Optimized Weights)

With the optimized configuration, the system produces:

| Pattern Type | Weight | Distribution | Examples |
|--------------|--------|--------------|----------|
| **Concatenated** | 4.0 | ~39% | `johnsmith`, `mariaperez84` |
| **Separated** | 2.5 | ~24% | `john.smith`, `maria-perez.23` |
| **Handle** | 3.0 | ~28% | `larimo`, `venaro`, `tusoduli` |
| **Business** | 0.8 | ~9% | `j.smith`, `mperez`, `john.doe` |

**Number Flavor Distribution:**
- Clean (no digits): ~77%
- 2-digit postfix: ~23% 
- 4-digit postfix: ~0.1% (extremely rare)

## Number Flavor (Decoupled)

- Digits are no longer hardcoded into patterns; they are a separate "number flavor" with its own weighted probability.
- **Flavors**: `none` (no digits), `d2` (2-digit postfix), `d4` (4-digit postfix).
- **Optimized weighting**: `none: 10, d2: 3, d4: 0.01` ensures natural-looking output
- Applied consistently across first/last-name patterns:
  - **Concatenated**: `firstname+lastname(+digits)`
  - **Separated**: `firstname + sep + lastname (+ sep + digits)`
- **Smart constraints**: Business mode forces `none` and never adds digits. Handle pattern never adds digits.
- **Quality impact**: Reduces strange combinations like "firstname.lastname.8413" to <5%

**Distribution with optimized weights:**
- ~77% clean usernames (no digits)
- ~23% with 2-digit postfix (decent looking)
- ~0.1% with 4-digit postfix (rare, for variety)

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
  - No digits appended (forced `numberFlavor: none`)
  - Short syllabic handle excluded in business contexts

## Configuration Options

### Basic Configuration
```javascript
const generator = new RandomDataGenerator({
    usernameStyle: 'auto',        // 'auto', 'concatenated', 'separated', 'business'
    usernamePattern: 'random',    // 'random', 'pattern_a', 'pattern_b', 'pattern_c'
    separatorChars: ['.', '_', '-'],
    businessMode: false,
    usePrefix: false,
    usePostfix: true,             // legacy; kept for backward compatibility
  postfixDigits: 4,               // legacy; prefer numberFlavorWeights below
  // Optimized pattern weights for natural-looking usernames
  patternWeights: { concatenated: 4, separated: 2.5, business: 0.8, handle: 3 },
  // Optimized number flavor weights to minimize odd combinations
  numberFlavorWeights: { none: 10, d2: 3, d4: 0.01 },
  // Business user portion formatting
  businessUserFormat: 'auto', // 'auto' | 'full' | 'alias'
  businessFormatWeights: { full: 1, alias: 1 },
  // Optional: restrict alias patterns
  // businessAliasPatterns: ['flast','f.last','first.l']
  // Handle options for Pattern C
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
  // Propagates to RandomDataGenerator - optimized weights
  patternWeights: { concatenated: 4, separated: 2.5, business: 0.8, handle: 3 },
  numberFlavorWeights: { none: 10, d2: 3, d4: 0.01 },
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
    usernamePattern: 'pattern_a',
  numberFlavorWeights: { none: 0, d2: 0, d4: 1 } // always 4 digits
});

const userData = generator.generateUserData();
// Result: erikmueller2847@gmail.com
```

### Pattern B (Separated)
```javascript
const generator = new RandomDataGenerator({
    usernameStyle: 'separated',
    usernamePattern: 'pattern_b',
  numberFlavorWeights: { none: 0.5, d2: 0.5, d4: 0 } // prefer none or 2 digits
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
  // Optimized weights for natural-looking output
  patternWeights: { concatenated: 4, separated: 2.5, business: 0.8, handle: 3 },
  numberFlavorWeights: { none: 10, d2: 3, d4: 0.01 }
});

// Randomly selects patterns with optimized distribution:
// ~39% Clean concatenated (e.g., johnsmith, mariaperez)
// ~24% Clean separated (e.g., john.smith, maria-perez) 
// ~28% Clean handles (e.g., larimo, venaro)
// ~9% Business styles (e.g., j.smith, mperez)
// Plus occasional 2-digit variants for variety
```

## Database Schema Updates

The tracking database now includes additional fields:

```sql
CREATE TABLE user_data_exports (
    -- ... existing fields ...
    username_style TEXT,        -- 'concatenated', 'separated', 'business'
    username_pattern TEXT,      -- 'pattern_a', 'pattern_b', 'business'
  -- NEW: decoupled number flavor
  number_flavor TEXT,         -- 'none', 'd2', 'd4'
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
- Four distinct visual patterns make detection harder
- Business mode provides professional appearance
- Random pattern selection prevents consistent signatures
- Decoupled number flavor adds another axis of variety
- Optimized weights ensure natural-looking output

### High Uniqueness
- Large name pools from international sources (500+ first, 400+ last names)
- Multiple digit postfix strategies with smart weighting
- Collision detection and retry logic
- Short syllabic handles provide additional uniqueness

### Quality & Authenticity
- 82% quality score with optimized weights
- Natural-looking usernames dominate output (59%)
- Handles appropriately common for personal emails (28%)
- Strange combinations minimized to <5%
- Context-aware: business emails exclude handles and digits

### Flexibility
- Configurable patterns and separators
- Business vs. personal email contexts with appropriate styling
- Integration with existing autofill systems
- Runtime weight adjustments for different use cases
- Comprehensive tracking and export capabilities

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

### Quality Testing

Run the quality assessment tool:

```bash
node examples/quality-test.js
```

This evaluates username quality with metrics:
- **Natural usernames**: Clean names without digits (target: >50%)
- **Decent usernames**: 2-digit combinations (acceptable)
- **Odd usernames**: 4-digit combinations (minimized to <5%)
- **Overall quality score**: Weighted composite score

**Current Performance (with optimized weights):**
- Quality Score: ~82/100
- Natural: 59% (concatenated 12%, separated 10%, handles 28%, business 9%)
- Decent: 37% (2-digit combinations)
- Odd: 4% (rare 4-digit combinations)

The optimized weights ensure handles are common for personal emails while minimizing strange-looking combinations like "firstname.lastname.8413".

## Migration

Existing configurations will continue to work with default settings. To enable new features:

1. Update configuration to specify `usernameStyle` and `usernamePattern`
2. Add `businessEmailProviders` if using business mode
3. Configure `separatorChars` for Pattern B customization
4. Optionally enable Pattern C in auto mode via `patternWeights.handle` or use `usernameStyle: 'handle'`

The system is backward compatible and will default to automatic pattern selection if no specific configuration is provided.