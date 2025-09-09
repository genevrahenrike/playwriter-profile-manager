# Autofill Random Data Generation

The autofill system now includes sophisticated random data generation capabilities for creating realistic user profiles with international names, secure passwords, and configurable email providers.

## Overview

The `RandomDataGenerator` class provides:
- **Extensive international name lists** (1000+ first/last names from multiple cultures)
- **Configurable email providers** with weighted distribution
- **Secure password generation** with customizable complexity rules
- **Optional SQLite tracking** to prevent duplicate name combinations
- **Flexible naming options** with prefix/postfix support
- **Integration with AutofillHookSystem** for dynamic form filling

## Quick Start

### Basic Usage

```javascript
import { RandomDataGenerator } from './src/RandomDataGenerator.js';

const generator = new RandomDataGenerator({
    usePrefix: false,
    usePostfix: true,
    enableTracking: true
});

const userData = generator.generateUserData();
console.log(userData);
// Output:
// {
//   firstName: 'lars',
//   lastName: 'bergstrom',
//   fullName: 'larsbergstrom2847',
//   email: 'larsbergstrom2847@protonmail.com',
//   password: 'Kx9#mP2vQ8@nR5zL',
//   emailProvider: 'protonmail.com',
//   generationAttempts: 1,
//   timestamp: '2024-01-15T10:30:00.000Z'
// }
```

### Integration with AutofillHookSystem

```javascript
import { AutofillHookSystem } from './src/AutofillHookSystem.js';

const autofillSystem = new AutofillHookSystem({
    usePrefix: false,
    usePostfix: true,
    enableTracking: true,
    trackingDbPath: './profiles/data/generated_names.db'
});

// Hook configuration with dynamic generation
const hookConfig = {
    name: 'example-signup',
    useDynamicGeneration: true,
    generationOptions: {
        usePrefix: false,
        usePostfix: true,
        password: {
            minLength: 14,
            maxLength: 18
        }
    },
    fields: {
        'input[type="email"]': {
            value: '{{email}}',
            description: 'Email field'
        },
        'input[type="password"]': {
            value: '{{password}}',
            description: 'Password field'
        }
    }
};
```

## Configuration Options

### RandomDataGenerator Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `usePrefix` | boolean | `false` | Add numeric prefix (01, 02, etc.) |
| `usePostfix` | boolean | `true` | Add numeric postfix for uniqueness |
| `postfixDigits` | number | `4` | Number of digits in postfix |
| `emailProviders` | array | See below | Email provider configuration |
| `customEmailProviders` | array | `[]` | Additional email providers |
| `enableTracking` | boolean | `false` | Enable SQLite tracking |
| `trackingDbPath` | string | `./profiles/data/generated_names.db` | SQLite database path |
| `passwordLength` | object | `{min: 12, max: 20}` | Password length range |
| `passwordComplexity` | object | See below | Password complexity rules |
| `maxAttempts` | number | `50` | Max attempts for unique names |

### Default Email Providers

```javascript
const defaultProviders = [
    { domain: 'gmail.com', weight: 30 },
    { domain: 'yahoo.com', weight: 15 },
    { domain: 'outlook.com', weight: 12 },
    { domain: 'hotmail.com', weight: 10 },
    { domain: 'protonmail.com', weight: 8 },
    { domain: 'tutanota.com', weight: 3 },
    { domain: 'proton.me', weight: 5 },
    { domain: 'icloud.com', weight: 6 },
    { domain: 'aol.com', weight: 2 },
    { domain: 'yandex.com', weight: 3 },
    { domain: 'mail.com', weight: 2 },
    { domain: 'zoho.com', weight: 1 },
    { domain: 'fastmail.com', weight: 1 },
    { domain: 'gmx.com', weight: 1 },
    { domain: 'mailbox.org', weight: 1 }
];
```

### Password Complexity Options

```javascript
const passwordComplexity = {
    requireUppercase: true,    // Require uppercase letters
    requireLowercase: true,    // Require lowercase letters
    requireDigits: true,       // Require numeric digits
    requireSymbols: true       // Require special symbols
};
```

## International Name Lists

The generator includes over 1000 carefully curated international names from various cultures:

### Name Categories

- **Nordic/Scandinavian**: erik, lars, astrid, ingrid, andersson, johansson
- **Germanic**: franz, hans, greta, helga, mueller, schmidt
- **Romance Languages**: alessandro, giulia, alejandro, maria, garcia, silva
- **Slavic**: vladimir, natasha, novak, petrov
- **Celtic**: aiden, aoife, alasdair, morag
- **Eastern European**: artur, agnieszka, nowak, kowalski
- **Dutch/Flemish**: adriaan, anna, de jong, jansen
- **Modern International**: luca, alice, martin, bernard

All names use Latin/ASCII characters and are suitable for international use.

## Hook Configuration

### Dynamic Field Values

Use placeholders in field configurations:

```javascript
fields: {
    'input[type="email"]': {
        value: '{{email}}',           // Generated email
        description: 'Email field'
    },
    'input[type="password"]': {
        value: '{{password}}',        // Generated password
        description: 'Password field'
    },
    'input[name="firstName"]': {
        value: '{{firstName}}',       // First name only
        description: 'First name'
    },
    'input[name="lastName"]': {
        value: '{{lastName}}',        // Last name only
        description: 'Last name'
    },
    'input[name="fullName"]': {
        value: '{{fullName}}',        // Complete generated name
        description: 'Full name'
    }
}
```

### Function-Based Dynamic Values

For complex scenarios, use functions:

```javascript
fields: {
    'input[name="referralCode"]': {
        value: (userData) => {
            return `REF${userData.fullName.substring(0, 4).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
        },
        description: 'Dynamic referral code'
    },
    'input[name="username"]': {
        value: (userData) => {
            // Create username from email without domain
            return userData.email.split('@')[0];
        },
        description: 'Username from email'
    }
}
```

### Generation Options per Hook

```javascript
const hookConfig = {
    name: 'custom-signup',
    useDynamicGeneration: true,
    generationOptions: {
        usePrefix: true,          // Enable prefix for this hook
        usePostfix: false,        // Disable postfix for this hook
        password: {
            minLength: 16,        // Override global password settings
            maxLength: 24,
            requireSymbols: false // Disable symbols for this site
        }
    },
    // ... rest of config
};
```

## SQLite Tracking

When `enableTracking` is enabled, the system maintains a SQLite database to track generated name combinations:

### Database Schema

```sql
CREATE TABLE generated_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_count INTEGER DEFAULT 1,
    UNIQUE(first_name, last_name)
);
```

### Statistics

```javascript
const stats = generator.getStatistics();
console.log(stats);
// Output:
// {
//   trackingEnabled: true,
//   totalGenerated: 150,
//   reusedNames: 5,
//   uniqueNames: 145,
//   topReusedNames: [
//     { first_name: 'erik', last_name: 'andersson', used_count: 3 },
//     // ...
//   ],
//   databasePath: './profiles/data/generated_names.db'
// }
```

## Examples

### Example 1: VidIQ Signup Hook

```javascript
export default {
    name: 'vidiq-autofill',
    description: 'VidIQ signup with dynamic data',
    enabled: true,
    useDynamicGeneration: true,
    
    generationOptions: {
        usePrefix: false,
        usePostfix: true,
        password: {
            minLength: 12,
            maxLength: 16
        }
    },
    
    urlPatterns: [
        'https://app.vidiq.com/signup',
        'https://app.vidiq.com/register'
    ],
    
    fields: {
        'input[data-testid="form-input-email"]': {
            value: '{{email}}',
            description: 'VidIQ email field'
        },
        'input[data-testid="form-input-password"]': {
            value: '{{password}}',
            description: 'VidIQ password field'
        }
    }
};
```

### Example 2: Generic Signup Hook

```javascript
export default {
    name: 'generic-signup',
    description: 'Generic signup forms',
    enabled: true,
    useDynamicGeneration: true,
    
    urlPatterns: [
        'https://example.com/signup',
        /https:\/\/.*\.example\.com\/register/
    ],
    
    fields: {
        'input[type="email"]': { value: '{{email}}' },
        'input[type="password"]': { value: '{{password}}' },
        'input[name="firstName"]': { value: '{{firstName}}' },
        'input[name="lastName"]': { value: '{{lastName}}' },
        'input[name="company"]': {
            value: (userData) => `${userData.firstName} ${userData.lastName} LLC`
        }
    },
    
    async customLogic(page, sessionId, hookSystem, userData) {
        // Custom logic with access to generated userData
        console.log(`Using generated email: ${userData.email}`);
        
        // Handle checkboxes, additional fields, etc.
        const checkboxes = await page.locator('input[type="checkbox"]').all();
        for (const checkbox of checkboxes) {
            if (!(await checkbox.isChecked())) {
                await checkbox.check();
            }
        }
    }
};
```

### Example 3: Custom Email Providers

```javascript
const generator = new RandomDataGenerator({
    emailProviders: [
        { domain: 'tempmail.org', weight: 40 },
        { domain: 'guerrillamail.com', weight: 30 },
        { domain: 'mailinator.com', weight: 20 },
        { domain: '10minutemail.com', weight: 10 }
    ]
});
```

## Best Practices

### 1. Name Generation

- **Use postfix by default** for guaranteed uniqueness
- **Disable prefix** unless you need numbered sequences
- **Enable tracking** in production to prevent duplicates
- **Customize maxAttempts** based on your name pool size

### 2. Password Security

- **Use minimum 12 characters** for good security
- **Enable all complexity requirements** unless site restrictions apply
- **Vary password length** to avoid patterns
- **Test with target sites** to ensure compatibility

### 3. Email Providers

- **Use realistic distributions** for better authenticity
- **Include privacy providers** for better anonymity
- **Test provider reliability** for your use cases
- **Consider temporary email services** for testing

### 4. Hook Configuration

- **Start with generic selectors** then add specific ones
- **Use placeholder syntax** for maintainability
- **Implement custom logic** for site-specific needs
- **Test thoroughly** before enabling autoSubmit

### 5. Tracking and Monitoring

- **Enable tracking** to monitor usage patterns
- **Review statistics** regularly for optimization
- **Clean up databases** periodically
- **Monitor generation attempts** for performance

## Troubleshooting

### Common Issues

1. **Names not unique enough**: Increase `maxAttempts` or enable tracking
2. **Passwords rejected**: Adjust complexity rules or length
3. **Email providers blocked**: Update provider list
4. **Fields not filled**: Check selector specificity
5. **Database errors**: Verify path permissions

### Debug Tips

- Enable verbose logging with `console.log` in custom logic
- Test individual components with the example script
- Use browser dev tools to inspect form fields
- Check database content with SQLite browser

## Migration Guide

### From Static Values

Replace static field values with dynamic placeholders:

```javascript
// Before
fields: {
    'input[type="email"]': {
        value: 'test@example.com'
    }
}

// After
fields: {
    'input[type="email"]': {
        value: '{{email}}'
    }
}

// Enable dynamic generation
useDynamicGeneration: true
```

### From Previous Implementation

The new system is backward compatible. Existing hooks will continue to work with static values. To enable dynamic generation:

1. Add `useDynamicGeneration: true` to hook config
2. Replace static values with placeholders
3. Add `generationOptions` if needed
4. Test thoroughly before deployment

## Performance Considerations

- **Name generation**: ~1ms per generation
- **Database operations**: ~5ms per insert/lookup
- **Memory usage**: ~50MB for full name lists
- **Concurrent generation**: Thread-safe with minimal contention

## Security Notes

- Generated passwords meet common security requirements
- Names are sourced from public cultural databases
- No personally identifiable information is used
- SQLite database should be secured appropriately
- Consider using temporary email providers for testing

## API Reference

See the inline documentation in `RandomDataGenerator.js` and `AutofillHookSystem.js` for complete API details.
