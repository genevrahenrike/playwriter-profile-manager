import fs from 'fs-extra';
import path from 'path';
import Database from 'better-sqlite3';

/**
 * RandomDataGenerator - Generates realistic random names, emails, and passwords
 * with extensive international name lists and configurable options
 */
export class RandomDataGenerator {
    constructor(options = {}) {
        this.config = {
            // Name generation options
            usePrefix: options.usePrefix || false,
            usePostfix: options.usePostfix !== false, // default true
            postfixDigits: options.postfixDigits || 4,
            
            // Email options
            emailProviders: options.emailProviders || this.getDefaultEmailProviders(),
            customEmailProviders: options.customEmailProviders || [],
            
            // Password options
            passwordLength: { min: 12, max: 20, ...options.passwordLength },
            passwordComplexity: {
                requireUppercase: true,
                requireLowercase: true,
                requireDigits: true,
                requireSymbols: true,
                ...options.passwordComplexity
            },
            
            // Tracking options
            enableTracking: options.enableTracking || false,
            trackingDbPath: options.trackingDbPath || './profiles/data/generated_names.db',
            
            // Uniqueness options
            maxAttempts: options.maxAttempts || 50
        };
        
        this.usedNames = new Set();
        this.db = null;
        
        if (this.config.enableTracking) {
            this.initializeDatabase();
        }
    }
    
    /**
     * Get default email providers with realistic distribution
     */
    getDefaultEmailProviders() {
        return [
            // Major providers (higher weight)
            { domain: 'gmail.com', weight: 30 },
            { domain: 'yahoo.com', weight: 15 },
            { domain: 'outlook.com', weight: 12 },
            { domain: 'hotmail.com', weight: 10 },
            
            // Privacy-focused providers
            { domain: 'protonmail.com', weight: 8 },
            { domain: 'tutanota.com', weight: 3 },
            { domain: 'proton.me', weight: 5 },
            
            // Alternative providers
            { domain: 'icloud.com', weight: 6 },
            { domain: 'aol.com', weight: 2 },
            { domain: 'yandex.com', weight: 3 },
            { domain: 'mail.com', weight: 2 },
            { domain: 'zoho.com', weight: 1 },
            { domain: 'fastmail.com', weight: 1 },
            { domain: 'gmx.com', weight: 1 },
            { domain: 'mailbox.org', weight: 1 }
        ];
    }
    
    /**
     * Initialize SQLite database for tracking generated names
     */
    initializeDatabase() {
        try {
            const dbDir = path.dirname(this.config.trackingDbPath);
            fs.ensureDirSync(dbDir);
            
            this.db = new Database(this.config.trackingDbPath);
            
            // Create table for tracking generated names
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS generated_names (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    email TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    used_count INTEGER DEFAULT 1,
                    UNIQUE(first_name, last_name)
                )
            `);
            
            console.log(`📊 Name tracking database initialized: ${this.config.trackingDbPath}`);
        } catch (error) {
            console.error('❌ Failed to initialize tracking database:', error.message);
            this.config.enableTracking = false;
        }
    }
    
    /**
     * Extensive list of international first names (non-English but Latin/ASCII)
     */
    getFirstNames() {
        return [
            // Nordic/Scandinavian names
            'erik', 'lars', 'nils', 'bjorn', 'sven', 'magnus', 'henrik', 'anders', 'gustav', 'olaf',
            'astrid', 'ingrid', 'freya', 'saga', 'linnea', 'elsa', 'anna', 'maja', 'elin', 'ida',
            'axel', 'felix', 'oscar', 'emil', 'anton', 'isak', 'noah', 'liam', 'theo', 'hugo',
            'saga', 'alva', 'vera', 'nova', 'cleo', 'iris', 'luna', 'mira', 'nora', 'lea',
            
            // Germanic names
            'franz', 'hans', 'klaus', 'werner', 'wolfgang', 'helmut', 'gunther', 'dieter', 'jurgen', 'rolf',
            'greta', 'helga', 'brunhilde', 'liesel', 'ursula', 'ingeborg', 'margarete', 'christa', 'petra', 'sabine',
            'maximilian', 'sebastian', 'alexander', 'konstantin', 'leopold', 'friedrich', 'wilhelm', 'gottfried', 'siegfried', 'adalbert',
            
            // Romance language names (Italian/Spanish/Portuguese)
            'alessandro', 'giovanni', 'francesco', 'antonio', 'mario', 'giuseppe', 'luigi', 'carlo', 'paolo', 'marco',
            'giulia', 'francesca', 'chiara', 'valentina', 'alessandra', 'elena', 'sara', 'martina', 'giorgia', 'silvia',
            'alejandro', 'carlos', 'miguel', 'jose', 'antonio', 'manuel', 'francisco', 'rafael', 'angel', 'david',
            'maria', 'carmen', 'josefa', 'isabel', 'dolores', 'pilar', 'teresa', 'ana', 'francisca', 'antonia',
            'pedro', 'joao', 'antonio', 'jose', 'manuel', 'francisco', 'carlos', 'paulo', 'luis', 'miguel',
            'ana', 'maria', 'manuela', 'isabel', 'patricia', 'carla', 'sofia', 'beatriz', 'rita', 'sandra',
            
            // Slavic names
            'vladimir', 'dmitri', 'sergei', 'alexei', 'nikolai', 'pavel', 'andrei', 'mikhail', 'ivan', 'boris',
            'natasha', 'olga', 'irina', 'svetlana', 'elena', 'marina', 'tatiana', 'anna', 'galina', 'vera',
            'aleksandar', 'stefan', 'milan', 'marko', 'petar', 'nikola', 'jovana', 'milica', 'ana', 'marija',
            'karel', 'jan', 'petr', 'josef', 'pavel', 'tomas', 'martin', 'jana', 'eva', 'marie',
            
            // Celtic names
            'aiden', 'brendan', 'cian', 'declan', 'eoin', 'finn', 'kieran', 'liam', 'niall', 'oisin',
            'aoife', 'ciara', 'emer', 'fiona', 'grainne', 'maeve', 'niamh', 'orla', 'roisin', 'siobhan',
            'alasdair', 'angus', 'callum', 'duncan', 'hamish', 'iain', 'morag', 'aileas', 'caoimhe', 'isla',
            
            // Eastern European
            'artur', 'bartosz', 'damian', 'grzegorz', 'jakub', 'kamil', 'lukasz', 'marcin', 'pawel', 'piotr',
            'agnieszka', 'anna', 'beata', 'ewa', 'joanna', 'katarzyna', 'magdalena', 'malgorzata', 'monika', 'teresa',
            'adam', 'daniel', 'david', 'jakub', 'jan', 'josef', 'lukas', 'martin', 'michal', 'tomas',
            
            // Dutch/Flemish
            'adriaan', 'anton', 'bas', 'daan', 'erik', 'floris', 'jan', 'kees', 'lars', 'maarten',
            'anna', 'daan', 'emma', 'eva', 'isa', 'julia', 'lotte', 'marie', 'noa', 'sophie',
            
            // Modern international variants
            'adrian', 'andre', 'bruno', 'cesar', 'diego', 'eduardo', 'fernando', 'gabriel', 'hugo', 'ignacio',
            'adriana', 'beatriz', 'camila', 'diana', 'elena', 'fabiola', 'gabriela', 'helena', 'irene', 'julia',
            'luca', 'marco', 'matteo', 'nicola', 'paolo', 'riccardo', 'stefano', 'tommaso', 'valerio', 'vincenzo',
            'alice', 'bianca', 'caterina', 'diana', 'eleonora', 'federica', 'giada', 'ilaria', 'laura', 'michela'
        ];
    }
    
    /**
     * Extensive list of international last names (non-English but Latin/ASCII)
     */
    getLastNames() {
        return [
            // Nordic/Scandinavian surnames
            'andersson', 'johansson', 'karlsson', 'nilsson', 'eriksson', 'larsson', 'olsson', 'persson', 'svensson', 'gustafsson',
            'petersen', 'hansen', 'nielsen', 'jensen', 'christensen', 'andersen', 'sorensen', 'rasmussen', 'jorgensen', 'madsen',
            'lindqvist', 'bergstrom', 'lundgren', 'hedberg', 'forsberg', 'sandberg', 'henriksson', 'danielsson', 'petersson', 'abrahamsson',
            
            // Germanic surnames
            'mueller', 'schmidt', 'schneider', 'fischer', 'weber', 'meyer', 'wagner', 'becker', 'schulz', 'hoffmann',
            'koch', 'richter', 'klein', 'wolf', 'schroeder', 'neumann', 'schwarz', 'zimmermann', 'braun', 'krueger',
            'hartmann', 'lange', 'schmitt', 'werner', 'krause', 'meier', 'lehmann', 'schmid', 'schulze', 'maier',
            'koehler', 'herrmann', 'walter', 'koenig', 'otto', 'gross', 'haas', 'berger', 'fuchs', 'schuster',
            
            // Italian surnames
            'rossi', 'russo', 'ferrari', 'esposito', 'bianchi', 'romano', 'colombo', 'ricci', 'marino', 'greco',
            'bruno', 'gallo', 'conti', 'de luca', 'mancini', 'costa', 'giordano', 'rizzo', 'lombardi', 'moretti',
            'barbieri', 'fontana', 'santoro', 'mariani', 'rinaldi', 'caruso', 'ferrari', 'galli', 'martini', 'leone',
            'longo', 'gentile', 'martinelli', 'vitale', 'lombardo', 'serra', 'coppola', 'de santis', 'damico', 'palumbo',
            
            // Spanish surnames
            'garcia', 'rodriguez', 'gonzalez', 'fernandez', 'lopez', 'martinez', 'sanchez', 'perez', 'gomez', 'martin',
            'jimenez', 'ruiz', 'hernandez', 'diaz', 'moreno', 'alvarez', 'muñoz', 'romero', 'alonso', 'gutierrez',
            'navarro', 'torres', 'dominguez', 'vazquez', 'ramos', 'gil', 'ramirez', 'serrano', 'blanco', 'suarez',
            'molina', 'morales', 'ortega', 'delgado', 'castro', 'ortiz', 'rubio', 'marin', 'sanz', 'iglesias',
            
            // Portuguese surnames
            'silva', 'santos', 'ferreira', 'pereira', 'oliveira', 'costa', 'rodrigues', 'martins', 'jesus', 'sousa',
            'fernandes', 'goncalves', 'gomes', 'lopes', 'marques', 'alves', 'almeida', 'ribeiro', 'pinto', 'carvalho',
            'teixeira', 'moreira', 'correia', 'mendes', 'nunes', 'soares', 'vieira', 'monteiro', 'cardoso', 'rocha',
            
            // Slavic surnames
            'novak', 'svoboda', 'novotny', 'dvorak', 'cerny', 'prochazka', 'krejci', 'hajek', 'kralova', 'nemec',
            'pokorny', 'pospisil', 'hruska', 'jelinek', 'kratky', 'fiala', 'urban', 'horak', 'benes', 'kolar',
            'petrov', 'ivanov', 'smirnov', 'kuznetsov', 'popov', 'volkov', 'sokolov', 'lebedev', 'kozlov', 'novikov',
            'morozov', 'petrov', 'volkov', 'solovyov', 'vasiliev', 'zaytsev', 'pavlov', 'semenov', 'golubev', 'vinogradov',
            
            // Polish surnames
            'nowak', 'kowalski', 'wisniewski', 'wojcik', 'kowalczyk', 'kaminski', 'lewandowski', 'zielinski', 'szymanski', 'wozniak',
            'dabrowski', 'kozlowski', 'jankowski', 'mazur', 'kwiatkowski', 'krawczyk', 'piotrowski', 'grabowski', 'nowakowski', 'pawlowski',
            'michalski', 'nowicki', 'adamczyk', 'dudek', 'zajac', 'wieczorek', 'jablonski', 'krol', 'majewski', 'olszewski',
            
            // Dutch surnames
            'de jong', 'jansen', 'de vries', 'van den berg', 'van dijk', 'bakker', 'janssen', 'visser', 'smit', 'meijer',
            'de boer', 'mulder', 'de groot', 'bos', 'vos', 'peters', 'hendriks', 'van leeuwen', 'dekker', 'brouwer',
            'de wit', 'dijkstra', 'smits', 'de graaf', 'van der meer', 'van der laan', 'adriaanse', 'vermeulen', 'van den brink', 'de haan',
            
            // French surnames
            'martin', 'bernard', 'thomas', 'petit', 'robert', 'richard', 'durand', 'dubois', 'moreau', 'laurent',
            'simon', 'michel', 'lefebvre', 'leroy', 'roux', 'david', 'bertrand', 'morel', 'fournier', 'girard',
            'bonnet', 'dupont', 'lambert', 'fontaine', 'rousseau', 'vincent', 'muller', 'lefevre', 'faure', 'andre',
            
            // Modern compound surnames
            'bergmann', 'hoffmeister', 'steinberg', 'rosenberg', 'goldstein', 'silverstein', 'rothschild', 'einstein', 'weinstein', 'bernstein',
            'anderberg', 'lindberg', 'blomberg', 'stromberg', 'hedstrom', 'backstrom', 'engstrom', 'holmberg', 'carlberg', 'palmberg',
            'blackwood', 'whitewood', 'redwood', 'greenwood', 'ironwood', 'thornwood', 'wildwood', 'brightwood', 'darkwood', 'silverwood'
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
     * Select weighted random email provider
     */
    getRandomEmailProvider() {
        const providers = [...this.config.emailProviders, ...this.config.customEmailProviders];
        const totalWeight = providers.reduce((sum, p) => sum + (p.weight || 1), 0);
        let random = Math.random() * totalWeight;
        
        for (const provider of providers) {
            random -= (provider.weight || 1);
            if (random <= 0) {
                return provider.domain;
            }
        }
        
        return providers[0].domain; // fallback
    }
    
    /**
     * Check if name combination has been used (if tracking enabled)
     */
    isNameUsed(firstName, lastName) {
        if (!this.config.enableTracking || !this.db) {
            return this.usedNames.has(`${firstName}_${lastName}`);
        }
        
        try {
            const stmt = this.db.prepare('SELECT id FROM generated_names WHERE first_name = ? AND last_name = ?');
            const result = stmt.get(firstName, lastName);
            return !!result;
        } catch (error) {
            console.error('❌ Error checking name usage:', error.message);
            return false;
        }
    }
    
    /**
     * Record name usage (if tracking enabled)
     */
    recordNameUsage(firstName, lastName, fullName, email) {
        if (!this.config.enableTracking || !this.db) {
            this.usedNames.add(`${firstName}_${lastName}`);
            return;
        }
        
        try {
            const stmt = this.db.prepare(`
                INSERT INTO generated_names (first_name, last_name, full_name, email)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(first_name, last_name) DO UPDATE SET
                    used_count = used_count + 1,
                    email = COALESCE(excluded.email, email)
            `);
            stmt.run(firstName, lastName, fullName, email);
        } catch (error) {
            console.error('❌ Error recording name usage:', error.message);
        }
    }
    
    /**
     * Generate a unique name combination
     */
    generateUniqueName(options = {}) {
        const firstNames = this.getFirstNames();
        const lastNames = this.getLastNames();
        
        const usePrefix = options.usePrefix !== undefined ? options.usePrefix : this.config.usePrefix;
        const usePostfix = options.usePostfix !== undefined ? options.usePostfix : this.config.usePostfix;
        const currentIndex = options.currentIndex || 1;
        
        let attempts = 0;
        let firstName, lastName, fullName;
        
        // Try to find unused combination
        while (attempts < this.config.maxAttempts) {
            firstName = this.randomChoice(firstNames);
            lastName = this.randomChoice(lastNames);
            
            if (!this.isNameUsed(firstName, lastName)) {
                break;
            }
            attempts++;
        }
        
        // Build full name with prefix/postfix
        let nameParts = [firstName, lastName];
        
        if (usePrefix) {
            const prefix = String(currentIndex).padStart(2, '0');
            nameParts.unshift(prefix);
        }
        
        if (usePostfix) {
            const postfix = this.randomInt(1000, 9999).toString();
            nameParts.push(postfix);
        }
        
        fullName = nameParts.join('');
        
        return {
            firstName,
            lastName,
            fullName: fullName.toLowerCase(),
            attempts
        };
    }
    
    /**
     * Generate a secure random password
     */
    generatePassword(options = {}) {
        const config = { ...this.config.passwordComplexity, ...options };
        const minLen = options.minLength || this.config.passwordLength.min;
        const maxLen = options.maxLength || this.config.passwordLength.max;
        
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
    generateUserData(options = {}) {
        const nameData = this.generateUniqueName(options);
        const emailProvider = this.getRandomEmailProvider();
        const email = `${nameData.fullName}@${emailProvider}`;
        const password = this.generatePassword(options.password);
        
        // Record usage if tracking enabled
        this.recordNameUsage(nameData.firstName, nameData.lastName, nameData.fullName, email);
        
        const userData = {
            firstName: nameData.firstName,
            lastName: nameData.lastName,
            fullName: nameData.fullName,
            email,
            password,
            emailProvider,
            generationAttempts: nameData.attempts,
            timestamp: new Date().toISOString()
        };
        
        console.log(`🎲 Generated user data: ${userData.fullName} (${userData.email})`);
        
        return userData;
    }
    
    /**
     * Get statistics about generated names (if tracking enabled)
     */
    getStatistics() {
        if (!this.config.enableTracking || !this.db) {
            return {
                trackingEnabled: false,
                sessionGenerated: this.usedNames.size
            };
        }
        
        try {
            const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM generated_names');
            const totalResult = totalStmt.get();
            
            const reusedStmt = this.db.prepare('SELECT COUNT(*) as count FROM generated_names WHERE used_count > 1');
            const reusedResult = reusedStmt.get();
            
            const topNamesStmt = this.db.prepare(`
                SELECT first_name, last_name, used_count 
                FROM generated_names 
                ORDER BY used_count DESC 
                LIMIT 10
            `);
            const topNames = topNamesStmt.all();
            
            return {
                trackingEnabled: true,
                totalGenerated: totalResult.count,
                reusedNames: reusedResult.count,
                uniqueNames: totalResult.count - reusedResult.count,
                topReusedNames: topNames,
                databasePath: this.config.trackingDbPath
            };
        } catch (error) {
            console.error('❌ Error getting statistics:', error.message);
            return { trackingEnabled: true, error: error.message };
        }
    }
    
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
