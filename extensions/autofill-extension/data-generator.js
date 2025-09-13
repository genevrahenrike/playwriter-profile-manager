/**
 * Simplified RandomDataGenerator for browser extension use
 * Based on the main RandomDataGenerator.js but optimized for browser environment
 */
class ExtensionDataGenerator {
    constructor(options = {}) {
        this.config = {
            // Email options
            emailProviders: options.emailProviders || this.getDefaultEmailProviders(),
            
            // Password options
            passwordLength: { min: 12, max: 20, ...options.passwordLength },
            passwordComplexity: {
                requireUppercase: true,
                requireLowercase: true,
                requireDigits: true,
                requireSymbols: true,
                ...options.passwordComplexity
            },
            
            // Username style options
            usernameStyle: options.usernameStyle || 'auto',
            separatorChars: options.separatorChars || ['.', '_', '-'],
            
            // Pattern weights
            patternWeights: {
                concatenated: 4,
                separated: 2.5,
                business: 2.5,
                handle: 3,
                ...(options.patternWeights || {})
            },
            
            // Number flavor weights
            numberFlavorWeights: options.numberFlavorWeights || { 
                none: 10,
                d2: 3,
                d4: 0.01
            }
        };
    }
    
    /**
     * Get default email providers with realistic distribution
     */
    getDefaultEmailProviders() {
        return [
            { domain: 'gmail.com', weight: 30 },
            { domain: 'yahoo.com', weight: 8 },
            { domain: 'outlook.com', weight: 12 },
            { domain: 'hotmail.com', weight: 10 },
            { domain: 'protonmail.com', weight: 8 },
            { domain: 'icloud.com', weight: 6 },
            { domain: 'aol.com', weight: 2 },
            { domain: 'yandex.com', weight: 3 },
            { domain: 'mail.com', weight: 2 }
        ];
    }
    
    /**
     * International first names
     */
    getFirstNames() {
        return [
            // Nordic/Scandinavian names
            'erik', 'lars', 'nils', 'bjorn', 'sven', 'magnus', 'henrik', 'anders', 'gustav', 'olaf',
            'astrid', 'ingrid', 'freya', 'saga', 'linnea', 'elsa', 'anna', 'maja', 'elin', 'ida',
            
            // Germanic names
            'franz', 'hans', 'klaus', 'werner', 'wolfgang', 'greta', 'helga', 'petra', 'sabine',
            'maximilian', 'sebastian', 'alexander', 'konstantin', 'leopold',
            
            // Romance language names
            'alessandro', 'giovanni', 'francesco', 'antonio', 'mario', 'giuseppe', 'luigi', 'carlo',
            'giulia', 'francesca', 'chiara', 'valentina', 'alessandra', 'elena', 'sara', 'martina',
            'alejandro', 'carlos', 'miguel', 'jose', 'manuel', 'francisco', 'rafael',
            'maria', 'carmen', 'josefa', 'isabel', 'dolores', 'pilar', 'teresa', 'ana',
            
            // Slavic names
            'vladimir', 'dmitri', 'sergei', 'alexei', 'nikolai', 'pavel', 'andrei', 'mikhail',
            'natasha', 'olga', 'irina', 'svetlana', 'elena', 'marina', 'tatiana', 'galina',
            
            // Celtic names
            'aiden', 'brendan', 'cian', 'declan', 'finn', 'kieran', 'liam', 'niall',
            'aoife', 'ciara', 'emer', 'fiona', 'maeve', 'niamh', 'orla', 'siobhan',
            
            // Modern international variants
            'adrian', 'andre', 'bruno', 'cesar', 'diego', 'eduardo', 'fernando', 'gabriel',
            'adriana', 'beatriz', 'camila', 'diana', 'elena', 'fabiola', 'gabriela', 'helena',
            'luca', 'marco', 'matteo', 'nicola', 'paolo', 'riccardo', 'stefano', 'tommaso',
            'alice', 'bianca', 'caterina', 'diana', 'eleonora', 'federica', 'giada', 'ilaria'
        ];
    }
    
    /**
     * International last names
     */
    getLastNames() {
        return [
            // Nordic/Scandinavian surnames
            'andersson', 'johansson', 'karlsson', 'nilsson', 'eriksson', 'larsson', 'olsson',
            'petersen', 'hansen', 'nielsen', 'jensen', 'christensen', 'andersen',
            
            // Germanic surnames
            'mueller', 'schmidt', 'schneider', 'fischer', 'weber', 'meyer', 'wagner', 'becker',
            'koch', 'richter', 'klein', 'wolf', 'neumann', 'schwarz', 'zimmermann',
            
            // Italian surnames
            'rossi', 'russo', 'ferrari', 'esposito', 'bianchi', 'romano', 'colombo', 'ricci',
            'bruno', 'gallo', 'conti', 'deluca', 'mancini', 'costa', 'giordano', 'rizzo',
            
            // Spanish surnames
            'garcia', 'rodriguez', 'gonzalez', 'fernandez', 'lopez', 'martinez', 'sanchez', 'perez',
            'jimenez', 'ruiz', 'hernandez', 'diaz', 'moreno', 'alvarez', 'munoz', 'romero',
            
            // Portuguese surnames
            'silva', 'santos', 'ferreira', 'pereira', 'oliveira', 'costa', 'rodrigues', 'martins',
            'fernandes', 'goncalves', 'gomes', 'lopes', 'marques', 'alves', 'almeida',
            
            // Slavic surnames
            'novak', 'svoboda', 'novotny', 'dvorak', 'cerny', 'prochazka', 'krejci', 'hajek',
            'petrov', 'ivanov', 'smirnov', 'kuznetsov', 'popov', 'volkov', 'sokolov',
            
            // Polish surnames
            'nowak', 'kowalski', 'wisniewski', 'wojcik', 'kowalczyk', 'kaminski', 'lewandowski',
            'dabrowski', 'kozlowski', 'jankowski', 'mazur', 'kwiatkowski', 'krawczyk',
            
            // Dutch surnames
            'dejong', 'jansen', 'devries', 'vandenberg', 'vandijk', 'bakker', 'janssen', 'visser',
            'deboer', 'mulder', 'degroot', 'bos', 'vos', 'peters', 'hendriks',
            
            // French surnames
            'martin', 'bernard', 'thomas', 'petit', 'robert', 'richard', 'durand', 'dubois',
            'simon', 'michel', 'lefebvre', 'leroy', 'roux', 'david', 'bertrand', 'morel'
        ];
    }
    
    /**
     * Generate a random integer within range
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    /**
     * Select random item from array
     */
    randomChoice(array) {
        return array[this.randomInt(0, array.length - 1)];
    }
    
    /**
     * Weighted choice selection
     */
    weightedChoice(weightsObj) {
        const entries = Object.entries(weightsObj).filter(([, w]) => typeof w === 'number' && w > 0);
        if (entries.length === 0) return null;
        const total = entries.reduce((s, [, w]) => s + w, 0);
        let r = Math.random() * total;
        for (const [key, w] of entries) {
            r -= w;
            if (r <= 0) return key;
        }
        return entries[0][0];
    }
    
    /**
     * Select weighted random email provider
     */
    getRandomEmailProvider() {
        const providers = this.config.emailProviders;
        const totalWeight = providers.reduce((sum, p) => sum + (p.weight || 1), 0);
        let random = Math.random() * totalWeight;
        
        for (const provider of providers) {
            random -= (provider.weight || 1);
            if (random <= 0) {
                return provider;
            }
        }
        
        return providers[0]; // fallback
    }
    
    /**
     * Generate username using Pattern A (Concatenated Style)
     */
    generatePatternA(firstName, lastName, numberFlavor) {
        let base = `${firstName}${lastName}`.toLowerCase();
        
        if (numberFlavor === 'none') return base;
        if (numberFlavor === 'd2') return `${base}${this.randomInt(10, 99)}`;
        if (numberFlavor === 'd4') return `${base}${this.randomInt(1000, 9999)}`;
        
        return base;
    }
    
    /**
     * Generate username using Pattern B (Separator-based Style)
     */
    generatePatternB(firstName, lastName, numberFlavor) {
        const separator = this.randomChoice(this.config.separatorChars);
        let base = `${firstName}${separator}${lastName}`.toLowerCase();
        
        if (numberFlavor === 'none') return base;
        if (numberFlavor === 'd2') return `${base}${separator}${this.randomInt(10, 99)}`;
        if (numberFlavor === 'd4') return `${base}${separator}${this.randomInt(1000, 9999)}`;
        
        return base;
    }
    
    /**
     * Generate business-style username
     */
    generateBusinessUsername(firstName, lastName) {
        const separator = this.randomChoice(this.config.separatorChars);
        const first = firstName.toLowerCase();
        const last = lastName.toLowerCase();
        const f = first.charAt(0);
        
        const patterns = [
            `${f}${last}`,           // jdoe
            `${f}${separator}${last}`, // j.doe
            `${first}${separator}${last.charAt(0)}`, // john.d
            `${first}${separator}${last}` // john.doe
        ];
        
        return this.randomChoice(patterns);
    }
    
    /**
     * Generate a unique name combination
     */
    generateUniqueName() {
        const firstNames = this.getFirstNames();
        const lastNames = this.getLastNames();
        
        const firstName = this.randomChoice(firstNames);
        const lastName = this.randomChoice(lastNames);
        
        // Determine username style and pattern
        const chosen = this.weightedChoice(this.config.patternWeights) || 'concatenated';
        let usernameStyle, usernamePattern, numberFlavor;
        
        if (chosen === 'business') {
            usernameStyle = 'business';
            usernamePattern = 'business';
            numberFlavor = 'none';
        } else if (chosen === 'concatenated') {
            usernameStyle = 'concatenated';
            usernamePattern = 'pattern_a';
            numberFlavor = this.weightedChoice(this.config.numberFlavorWeights) || 'd2';
        } else {
            usernameStyle = 'separated';
            usernamePattern = 'pattern_b';
            numberFlavor = this.weightedChoice(this.config.numberFlavorWeights) || 'd2';
        }
        
        // Generate username based on selected pattern
        let fullName;
        if (usernameStyle === 'business') {
            fullName = this.generateBusinessUsername(firstName, lastName);
        } else if (usernamePattern === 'pattern_a') {
            fullName = this.generatePatternA(firstName, lastName, numberFlavor);
        } else {
            fullName = this.generatePatternB(firstName, lastName, numberFlavor);
        }
        
        return {
            firstName,
            lastName,
            fullName,
            usernameStyle,
            usernamePattern,
            numberFlavor
        };
    }
    
    /**
     * Generate a secure random password
     */
    generatePassword() {
        const config = this.config.passwordComplexity;
        const minLen = this.config.passwordLength.min;
        const maxLen = this.config.passwordLength.max;
        
        const length = this.randomInt(minLen, maxLen);
        
        // Character sets
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const digits = '0123456789';
        const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        
        let password = '';
        let availableChars = '';
        
        // Ensure required character types
        if (config.requireUppercase) {
            password += this.randomChoice(uppercase);
            availableChars += uppercase;
        }
        
        if (config.requireLowercase) {
            password += this.randomChoice(lowercase);
            availableChars += lowercase;
        }
        
        if (config.requireDigits) {
            password += this.randomChoice(digits);
            availableChars += digits;
        }
        
        if (config.requireSymbols) {
            password += this.randomChoice(symbols);
            availableChars += symbols;
        }
        
        // Fill remaining length
        while (password.length < length) {
            password += this.randomChoice(availableChars);
        }
        
        // Shuffle password
        return password.split('').sort(() => 0.5 - Math.random()).join('');
    }
    
    /**
     * Generate complete random user data
     */
    generateUserData() {
        const nameData = this.generateUniqueName();
        const emailProvider = this.getRandomEmailProvider();
        const email = `${nameData.fullName}@${emailProvider.domain}`;
        const password = this.generatePassword();
        
        return {
            firstName: nameData.firstName,
            lastName: nameData.lastName,
            fullName: nameData.fullName,
            email,
            password,
            emailProvider: emailProvider.domain,
            usernameStyle: nameData.usernameStyle,
            usernamePattern: nameData.usernamePattern,
            numberFlavor: nameData.numberFlavor,
            timestamp: new Date().toISOString()
        };
    }
}

// Make available globally for extension use
if (typeof window !== 'undefined') {
    window.ExtensionDataGenerator = ExtensionDataGenerator;
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExtensionDataGenerator;
}