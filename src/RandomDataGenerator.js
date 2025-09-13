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
            usePostfix: options.usePostfix !== false, // default true (deprecated by numberFlavorWeights)
            postfixDigits: options.postfixDigits || 4, // deprecated by numberFlavorWeights
            
            // Username style options - NEW
            usernameStyle: options.usernameStyle || 'auto', // 'auto', 'concatenated', 'separated', 'business', 'handle'
            usernamePattern: options.usernamePattern || 'random', // 'random', 'pattern_a', 'pattern_b', 'pattern_c'
            separatorChars: options.separatorChars || ['.', '_', '-'],
            businessMode: options.businessMode || false, // Generate business-style usernames

            // Weighted selection across patterns (concatenated/pattern_a, separated/pattern_b, business, handle/pattern_c)
            patternWeights: {
                concatenated: 4,    // Most common, clean firstname+lastname
                separated: 2.5,     // Common, modern look
                business: 2.5,      // Increased for more professional contexts (~10% more business emails)
                handle: 3,          // Very common in personal emails, distinctive
                ...(options.patternWeights || {})
            },

            // Business username formatting (no digits by default)
            // 'auto' chooses between 'full' and 'alias' using businessFormatWeights
            businessUserFormat: options.businessUserFormat || 'auto', // 'auto' | 'full' | 'alias'
            businessFormatWeights: {
                full: 1,
                alias: 1,
                ...(options.businessFormatWeights || {})
            },
            // Optional override of alias patterns array (strings from supported set)
            businessAliasPatterns: options.businessAliasPatterns || null, // e.g., ['flast','f.last','first.l','fl','lf']
            
            // Email options
            emailProviders: options.emailProviders || this.getDefaultEmailProviders(),
            customEmailProviders: options.customEmailProviders || [],
            businessEmailProviders: options.businessEmailProviders || this.getDefaultBusinessEmailProviders(),
            
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
            maxAttempts: options.maxAttempts || 50,

            // Handle (Pattern C) options
            handleSyllables: options.handleSyllables || 4, // number of syllables (3-4 recommended)
            handleBlocklist: options.handleBlocklist || ['admin','support','test','user','service','root','system'],

            // Numbering flavor weights (decoupled digits strategy)
            numberFlavorWeights: options.numberFlavorWeights || { 
                none: 10,     // Very strong preference for clean names
                d2: 3,        // Common, decent looking
                d4: 0.01      // Extremely rare (1%), only occasionally for variety
            },
            // Optional per-style overrides
            numberFlavorWeightsByStyle: {
                concatenated: { none: 1, d2: 2, d4: 0.25 },
                separated:    { none: 2, d2: 2, d4: 0.25 },
                ...(options.numberFlavorWeightsByStyle || {})
            }
        };
        
        this.usedNames = new Set();
    this.usedHandles = new Set();
        this.db = null;
        
        if (this.config.enableTracking) {
            this.initializeDatabase();
        }
    }

    /**
     * Numbering flavor weights for username postfix digits
     * - none: no digits added
     * - d2: two-digit postfix (10-99)
     * - d4: four-digit postfix (1000-9999)
     */
    get numberFlavorWeights() {
        // Allow runtime override via options, fallback to natural-looking defaults
        const defaults = { none: 4, d2: 1.5, d4: 0.2 };
        const provided = (this.config.numberFlavorWeights || {});
        // Normalize invalid values out
        const normalized = {};
        for (const k of ['none', 'd2', 'd4']) {
            const v = Number(provided[k]);
            if (!Number.isFinite(v) || v <= 0) continue;
            normalized[k] = v;
        }
        return Object.keys(normalized).length ? normalized : defaults;
    }

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
     * Get default email providers with realistic distribution
     */
    getDefaultEmailProviders() {
        return [
            // Major providers (higher weight)
            { domain: 'gmail.com', weight: 30 },
            { domain: 'yahoo.com', weight: 8 },
            { domain: 'outlook.com', weight: 12 },
            { domain: 'hotmail.com', weight: 10 },
            
            // Privacy-focused providers
            { domain: 'protonmail.com', weight: 8 },
            { domain: 'tutanota.com', weight: 3 },
            { domain: 'proton.me', weight: 2 }, // Reduced from 5 to 2
            
            // Alternative providers
            { domain: 'icloud.com', weight: 6 },
            { domain: 'aol.com', weight: 2 },
            { domain: 'yandex.com', weight: 3 },
            { domain: 'mail.com', weight: 2 },
            { domain: 'zoho.com', weight: 1 },
            { domain: 'fastmail.com', weight: 1 },
            { domain: 'gmx.com', weight: 1 },
            { domain: 'mailbox.org', weight: 0.5 } // Reduced from 1 to 0.5
        ];
    }
    
    /**
     * Get default business email providers for professional domains
     */
    getDefaultBusinessEmailProviders() {
        return [
            // Major tech companies
            // { domain: 'google.com', weight: 10 }, NOTE: reCAPCHA actually check if emails are valid or not this one got killed the fastest
            { domain: 'microsoft.com', weight: 10 },
            { domain: 'apple.com', weight: 10 },
            { domain: 'amazon.com', weight: 10 },
            { domain: 'meta.com', weight: 8 },
            { domain: 'facebook.com', weight: 8 },
            { domain: 'tesla.com', weight: 8 },
            { domain: 'ibm.com', weight: 7 },
            { domain: 'oracle.com', weight: 7 },
            { domain: 'intel.com', weight: 7 },
            { domain: 'nvidia.com', weight: 7 },
            { domain: 'adobe.com', weight: 6 },
            { domain: 'salesforce.com', weight: 6 },
            { domain: 'cisco.com', weight: 6 },
            { domain: 'dell.com', weight: 6 },
            { domain: 'hp.com', weight: 6 },
            { domain: 'hpe.com', weight: 5 },
            { domain: 'sap.com', weight: 5 },
            { domain: 'qualcomm.com', weight: 5 },
            { domain: 'broadcom.com', weight: 5 },
            { domain: 'paypal.com', weight: 5 },
            { domain: 'uber.com', weight: 5 },
            { domain: 'lyft.com', weight: 4 },
            { domain: 'airbnb.com', weight: 4 },
            { domain: 'netflix.com', weight: 4 },
            { domain: 'spotify.com', weight: 4 },
            { domain: 'twitter.com', weight: 4 },
            { domain: 'snap.com', weight: 3 },
            { domain: 'dropbox.com', weight: 3 },
            { domain: 'slack.com', weight: 3 },
            { domain: 'atlassian.com', weight: 3 },
            { domain: 'zoom.us', weight: 3 },
            { domain: 'shopify.com', weight: 3 },
            { domain: 'squareup.com', weight: 3 },
            { domain: 'block.xyz', weight: 2 },
            { domain: 'stripe.com', weight: 3 },
            { domain: 'cloudflare.com', weight: 2 },
            { domain: 'okta.com', weight: 2 },
            { domain: 'zendesk.com', weight: 2 },
            { domain: 'workday.com', weight: 2 },
            { domain: 'palantir.com', weight: 2 },
            { domain: 'datadog.com', weight: 2 },
            { domain: 'snowflake.com', weight: 2 },
            { domain: 'servicenow.com', weight: 2 },
            { domain: 'splunk.com', weight: 2 },
            { domain: 'twilio.com', weight: 2 },
            { domain: 'mongodb.com', weight: 2 },
            { domain: 'redhat.com', weight: 2 },
            { domain: 'vmware.com', weight: 2 },
            { domain: 'bitdefender.com', weight: 1 },
            { domain: 'fortinet.com', weight: 1 },
            { domain: 'paloaltonetworks.com', weight: 1 },
            { domain: 'crowdstrike.com', weight: 1 },
            { domain: 'zscaler.com', weight: 1 },

            // Global tech & enterprise SaaS additions
            { domain: 'linkedin.com', weight: 3 },
            { domain: 'github.com', weight: 3 },
            { domain: 'gitlab.com', weight: 2 },
            { domain: 'bitbucket.org', weight: 1 },
            { domain: 'notion.so', weight: 2 },
            { domain: 'asana.com', weight: 2 },
            { domain: 'monday.com', weight: 2 },
            { domain: 'figma.com', weight: 2 },
            { domain: 'miro.com', weight: 2 },
            { domain: 'canva.com', weight: 2 },
            { domain: 'box.com', weight: 2 },
            { domain: 'docusign.com', weight: 2 },
            { domain: 'adp.com', weight: 3 },
            
            { domain: 'sage.com', weight: 2 },
            { domain: 'intuit.com', weight: 3 },
            { domain: 'xero.com', weight: 2 },
            { domain: 'blackbaud.com', weight: 1 },
            { domain: 'servicemax.com', weight: 1 },
            { domain: 'confluent.io', weight: 1 },
            { domain: 'elastic.co', weight: 2 },
            { domain: 'hashicorp.com', weight: 1 },
            
            { domain: 'newrelic.com', weight: 1 },
            { domain: 'snyk.io', weight: 1 },
            { domain: 'suse.com', weight: 1 },
            { domain: 'jetbrains.com', weight: 1 },

            // Global consulting & Big 4
            { domain: 'accenture.com', weight: 4 },
            { domain: 'deloitte.com', weight: 4 },
            { domain: 'kpmg.com', weight: 4 },
            { domain: 'ey.com', weight: 4 },
            { domain: 'pwc.com', weight: 4 },
            { domain: 'mckinsey.com', weight: 3 },
            { domain: 'bcg.com', weight: 3 },
            { domain: 'bain.com', weight: 3 },

            // Global banks & payments
            { domain: 'visa.com', weight: 4 },
            { domain: 'mastercard.com', weight: 4 },
            { domain: 'americanexpress.com', weight: 4 },
            { domain: 'chase.com', weight: 4 },
            { domain: 'citi.com', weight: 4 },
            { domain: 'usbank.com', weight: 3 },
            { domain: 'pncbank.com', weight: 3 },
            { domain: 'truist.com', weight: 3 },
            { domain: 'capitalone.com', weight: 4 },
            { domain: 'discover.com', weight: 3 },
            { domain: 'barclays.com', weight: 3 },
            { domain: 'hsbc.com', weight: 3 },
            { domain: 'santander.com', weight: 3 },
            { domain: 'bnpparibas.com', weight: 2 },
            { domain: 'credit-suisse.com', weight: 2 },
            { domain: 'ubs.com', weight: 3 },
            { domain: 'bbva.com', weight: 2 },
            { domain: 'ing.com', weight: 2 },
            { domain: 'societegenerale.com', weight: 2 },

            // Insurance
            { domain: 'progressive.com', weight: 3 },
            { domain: 'allstate.com', weight: 3 },
            { domain: 'geico.com', weight: 3 },
            { domain: 'aig.com', weight: 3 },
            { domain: 'chubb.com', weight: 3 },
            { domain: 'travelers.com', weight: 2 },
            { domain: 'prudential.com', weight: 3 },
            { domain: 'manulife.com', weight: 2 },
            { domain: 'sunlife.com', weight: 2 },
            { domain: 'axa.com', weight: 3 },
            { domain: 'zurich.com', weight: 2 },
            

            // Telecom
            { domain: 'att.com', weight: 4 },
            { domain: 't-mobile.com', weight: 4 },
            { domain: 'sprint.com', weight: 2 },
            { domain: 'bt.com', weight: 2 },
            { domain: 'vodafone.com', weight: 3 },
            { domain: 'orange.com', weight: 2 },
            { domain: 'telefonica.com', weight: 2 },
            { domain: 'comcast.com', weight: 3 },
            { domain: 'charter.com', weight: 2 },

            // Transportation & logistics
            { domain: 'fedex.com', weight: 4 },
            { domain: 'ups.com', weight: 4 },
            { domain: 'dhl.com', weight: 3 },
            { domain: 'maersk.com', weight: 3 },
            
            { domain: 'cnhindustrial.com', weight: 2 },
            { domain: 'man.com', weight: 1 },
            { domain: 'cummins.com', weight: 3 },
            { domain: 'volvo.com', weight: 3 },
            
            { domain: 'ryder.com', weight: 2 },
            { domain: 'xpo.com', weight: 2 },

            // Airlines & travel
            { domain: 'delta.com', weight: 3 },
            { domain: 'aa.com', weight: 3 },
            { domain: 'united.com', weight: 3 },
            { domain: 'southwest.com', weight: 3 },
            { domain: 'jetblue.com', weight: 2 },
            { domain: 'alaskaair.com', weight: 2 },
            { domain: 'ba.com', weight: 2 },
            { domain: 'airfrance.com', weight: 2 },
            { domain: 'lufthansa.com', weight: 2 },
            { domain: 'emirates.com', weight: 2 },
            { domain: 'qatarairways.com', weight: 2 },
            { domain: 'singaporeair.com', weight: 2 },

            // Retail & e-commerce
            { domain: 'target.com', weight: 4 },
            { domain: 'bestbuy.com', weight: 4 },
            { domain: 'homedepot.com', weight: 4 },
            { domain: 'lowes.com', weight: 4 },
            { domain: 'nordstrom.com', weight: 3 },
            { domain: 'macys.com', weight: 3 },
            { domain: 'kohls.com', weight: 3 },
            { domain: 'gap.com', weight: 2 },
            { domain: 'nike.com', weight: 3 },
            { domain: 'adidas.com', weight: 2 },
            { domain: 'lululemon.com', weight: 2 },
            { domain: 'zara.com', weight: 2 },
            { domain: 'hm.com', weight: 2 },
            { domain: 'shein.com', weight: 2 },
            { domain: 'temu.com', weight: 1 },
            { domain: 'alibaba.com', weight: 2 },
            { domain: 'aliexpress.com', weight: 1 },

            // Food & beverage
            { domain: 'starbucks.com', weight: 4 },
            { domain: 'mcdonalds.com', weight: 4 },
            { domain: 'chipotle.com', weight: 3 },
            { domain: 'dominos.com', weight: 3 },
            { domain: 'yum.com', weight: 2 },
            { domain: 'restaurantbrandsintl.com', weight: 1 },
            
            { domain: 'ab-inbev.com', weight: 2 },
            { domain: 'heineken.com', weight: 2 },
            { domain: 'diageo.com', weight: 2 },

            // Media & entertainment
            { domain: 'disney.com', weight: 4 },
            { domain: 'warnerbros.com', weight: 3 },
            { domain: 'paramount.com', weight: 3 },
            { domain: 'nbcuni.com', weight: 2 },
            { domain: 'fox.com', weight: 2 },
            { domain: 'sonypictures.com', weight: 2 },
            { domain: 'univision.com', weight: 1 },

            // Pharma & healthcare systems
            { domain: 'unitedhealthgroup.com', weight: 7 },
            { domain: 'cvshealth.com', weight: 7 },
            { domain: 'anthem.com', weight: 5 },
            { domain: 'hcahealthcare.com', weight: 3 },
            { domain: 'tenethealth.com', weight: 2 },
            
            { domain: 'cardinalhealth.com', weight: 6 },
            { domain: 'medtronic.com', weight: 3 },
            { domain: 'bostonscientific.com', weight: 2 },
            { domain: 'stryker.com', weight: 3 },
            { domain: 'bd.com', weight: 2 },
            { domain: 'edwards.com', weight: 1 },

            // Energy & utilities additions
            { domain: 'bp.com', weight: 3 },
            { domain: 'shell.com', weight: 3 },
            { domain: 'totalenergies.com', weight: 2 },
            { domain: 'eni.com', weight: 2 },
            { domain: 'aramco.com', weight: 2 },
            { domain: 'pge.com', weight: 2 },
            { domain: 'nationalgrid.com', weight: 2 },

            // Manufacturing & industrial
            { domain: '3m.com', weight: 4 },
            { domain: 'siemens.com', weight: 4 },
            { domain: 'schneider-electric.com', weight: 4 },
            { domain: 'bosch.com', weight: 3 },
            { domain: 'honeywell.com', weight: 4 },
            { domain: 'rockwellautomation.com', weight: 4 },
            { domain: 'emerson.com', weight: 4 },
            { domain: 'abb.com', weight: 4 },
            { domain: 'ge.com', weight: 4 },

            // Universities and research (common professional domains)
            { domain: 'harvard.edu', weight: 1 },
            { domain: 'stanford.edu', weight: 1 },
            { domain: 'mit.edu', weight: 1 },
            { domain: 'berkeley.edu', weight: 1 },
            { domain: 'ox.ac.uk', weight: 1 },
            { domain: 'cam.ac.uk', weight: 1 },
            { domain: 'ethz.ch', weight: 1 },
            { domain: 'tum.de', weight: 1 },
            { domain: 'nus.edu.sg', weight: 1 },

            // Government portals (lower weight, but seen)
            { domain: 'usa.gov', weight: 1 },
            { domain: 'europa.eu', weight: 1 },
            { domain: 'gov.uk', weight: 1 },

            // Fortune 500 companies (sample, add more as needed)
            { domain: 'walmart.com', weight: 8 },
            { domain: 'exxonmobil.com', weight: 7 },
            { domain: 'chevron.com', weight: 7 },
            { domain: 'mckesson.com', weight: 7 },
            { domain: 'cvshealth.com', weight: 7 },
            { domain: 'unitedhealthgroup.com', weight: 7 },
            { domain: 'berkshirehathaway.com', weight: 7 },
            { domain: 'amerisourcebergen.com', weight: 6 },
            { domain: 'alphabet.com', weight: 6 },
            { domain: 'ford.com', weight: 6 },
            { domain: 'generalmotors.com', weight: 6 },
            { domain: 'cardinalhealth.com', weight: 6 },
            { domain: 'costco.com', weight: 6 },
            { domain: 'cigna.com', weight: 6 },
            { domain: 'marathonpetroleum.com', weight: 5 },
            { domain: 'kroger.com', weight: 5 },
            { domain: 'walgreens.com', weight: 5 },
            { domain: 'verizon.com', weight: 5 },
            { domain: 'jpmorganchase.com', weight: 5 },
            { domain: 'bankofamerica.com', weight: 5 },
            { domain: 'wellsfargo.com', weight: 5 },
            { domain: 'citigroup.com', weight: 5 },
            { domain: 'anthem.com', weight: 5 },
            { domain: 'fannie.com', weight: 4 },
            { domain: 'phillips66.com', weight: 4 },
            { domain: 'valero.com', weight: 4 },
            { domain: 'statefarm.com', weight: 4 },
            { domain: 'freddiemac.com', weight: 4 },
            { domain: 'johnsonandjohnson.com', weight: 4 },
            { domain: 'procterandgamble.com', weight: 4 },
            { domain: 'humana.com', weight: 4 },
            { domain: 'metlife.com', weight: 4 },
            { domain: 'pepsico.com', weight: 4 },
            { domain: 'intel.com', weight: 4 },
            { domain: 'caterpillar.com', weight: 4 },
            { domain: 'lockheedmartin.com', weight: 4 },
            { domain: 'boeing.com', weight: 4 },
            { domain: 'raytheon.com', weight: 4 },
            { domain: 'morganstanley.com', weight: 4 },
            { domain: 'goldmansachs.com', weight: 4 },
            { domain: 'pfizer.com', weight: 4 },
            { domain: 'merck.com', weight: 4 },
            { domain: 'abbvie.com', weight: 4 },
            { domain: 'abbott.com', weight: 4 },
            { domain: 'bms.com', weight: 4 },
            { domain: 'amgen.com', weight: 4 },
            { domain: 'gilead.com', weight: 4 },
            { domain: 'regeneron.com', weight: 4 },
            { domain: 'biogen.com', weight: 4 },
            { domain: 'moderna.com', weight: 4 },
            { domain: 'novartis.com', weight: 4 },
            { domain: 'sanofi.com', weight: 4 },
            { domain: 'astrazeneca.com', weight: 4 },
            { domain: 'bayer.com', weight: 4 },
            { domain: 'roche.com', weight: 4 },
            { domain: 'glaxosmithkline.com', weight: 4 },
            { domain: 'unilever.com', weight: 4 },
            { domain: 'nestle.com', weight: 4 },
            { domain: 'cocacola.com', weight: 4 },
            { domain: 'pepsico.com', weight: 4 },
            { domain: 'kraftheinzcompany.com', weight: 4 },
            { domain: 'mondelezinternational.com', weight: 4 },
            { domain: 'generalmills.com', weight: 4 },
            { domain: 'kelloggcompany.com', weight: 4 },
            { domain: 'conagrabrands.com', weight: 4 },
            { domain: 'tyson.com', weight: 4 },
            { domain: 'whirlpoolcorp.com', weight: 4 },
            { domain: 'paccar.com', weight: 4 },
            { domain: 'johnsoncontrols.com', weight: 4 },
            { domain: '3m.com', weight: 4 },
            { domain: 'dupont.com', weight: 4 },
            { domain: 'dow.com', weight: 4 },
            { domain: 'exeloncorp.com', weight: 4 },
            { domain: 'dominionenergy.com', weight: 4 },
            { domain: 'pg.com', weight: 4 },
            { domain: 'ge.com', weight: 4 },
            { domain: 'honeywell.com', weight: 4 },
            { domain: 'halliburton.com', weight: 4 },
            { domain: 'schlumberger.com', weight: 4 },
            { domain: 'conocophillips.com', weight: 4 },
            { domain: 'bakerhughes.com', weight: 4 },
            { domain: 'marathon.com', weight: 4 },
            { domain: 'devonenergy.com', weight: 4 },
            { domain: 'pioneer.com', weight: 4 },
            { domain: 'chevron.com', weight: 4 },
            { domain: 'exxonmobil.com', weight: 4 },
            { domain: 'valero.com', weight: 4 },
            { domain: 'phillips66.com', weight: 4 },
            { domain: 'coned.com', weight: 4 },
            { domain: 'southerncompany.com', weight: 4 },
            { domain: 'duke-energy.com', weight: 4 },
            { domain: 'aep.com', weight: 4 },
            { domain: 'nexteraenergy.com', weight: 4 },
            { domain: 'pplweb.com', weight: 4 },
            { domain: 'xcelenergy.com', weight: 4 },
            { domain: 'firstenergycorp.com', weight: 4 },
            { domain: 'entergy.com', weight: 4 },
            { domain: 'centerpointenergy.com', weight: 4 },
            { domain: 'nisource.com', weight: 4 },
            { domain: 'duquesne.com', weight: 4 },
            { domain: 'alliantenergy.com', weight: 4 },
            { domain: 'blackhillsenergy.com', weight: 4 },
            { domain: 'clevelandcliffs.com', weight: 4 },
            { domain: 'alcoa.com', weight: 4 },
            { domain: 'newmont.com', weight: 4 },
            { domain: 'freeport-mcmoran.com', weight: 4 },
            { domain: 'nucor.com', weight: 4 },
            { domain: 'ussteel.com', weight: 4 },
            { domain: 'internationalpaper.com', weight: 4 },
            { domain: 'westrock.com', weight: 4 },
            { domain: 'domtar.com', weight: 4 },
            { domain: 'kimberly-clark.com', weight: 4 },
            { domain: 'georgia-pacific.com', weight: 4 },
            { domain: 'ball.com', weight: 4 },
            { domain: 'owenscorning.com', weight: 4 },
            { domain: 'masco.com', weight: 4 },
            { domain: 'stanleyblackanddecker.com', weight: 4 },
            { domain: 'sherwin-williams.com', weight: 4 },
            { domain: 'pulte.com', weight: 4 },
            { domain: 'lennar.com', weight: 4 },
            { domain: 'drhorton.com', weight: 4 },
            { domain: 'kbhome.com', weight: 4 },
            { domain: 'tollbrothers.com', weight: 4 },
            { domain: 'centurycommunities.com', weight: 4 },
            { domain: 'mohawkind.com', weight: 4 },
            { domain: 'armstrongflooring.com', weight: 4 },
            { domain: 'shawinc.com', weight: 4 },
            { domain: 'beazer.com', weight: 4 },
            { domain: 'masonite.com', weight: 4 },
            { domain: 'pgtinnovations.com', weight: 4 },
            { domain: 'jeld-wen.com', weight: 4 },
            { domain: 'andersenwindows.com', weight: 4 },
            { domain: 'pella.com', weight: 4 },
            { domain: 'simpsonmfg.com', weight: 4 },
            { domain: 'trex.com', weight: 4 },
            { domain: 'azekco.com', weight: 4 },
            { domain: 'bmc.com', weight: 4 },
            { domain: 'bluelinxco.com', weight: 4 },
            { domain: 'buildersfirstsource.com', weight: 4 },
            { domain: 'gms.com', weight: 4 },
            { domain: 'homedepot.com', weight: 4 },
            { domain: 'lowes.com', weight: 4 },
            { domain: 'menards.com', weight: 4 },
            { domain: 'acehardware.com', weight: 4 },
            { domain: 'truevalue.com', weight: 4 },
            { domain: 'grainger.com', weight: 4 },
            { domain: 'fastenal.com', weight: 4 },
            { domain: 'mcmaster.com', weight: 4 },
            { domain: 'ferguson.com', weight: 4 },
            { domain: 'watsco.com', weight: 4 },
            { domain: 'carrier.com', weight: 4 },
            { domain: 'trane.com', weight: 4 },
            { domain: 'lennox.com', weight: 4 },
            { domain: 'goodmanmfg.com', weight: 4 },
            { domain: 'daikin.com', weight: 4 },
            { domain: 'york.com', weight: 4 },
            { domain: 'rheem.com', weight: 4 },
            { domain: 'aosmith.com', weight: 4 },
            { domain: 'pentair.com', weight: 4 },
            { domain: 'watts.com', weight: 4 },
            { domain: 'zurn.com', weight: 4 },
            { domain: 'muellerindustries.com', weight: 4 },
            { domain: 'emerson.com', weight: 4 },
            { domain: 'rockwellautomation.com', weight: 4 },
            { domain: 'hubbell.com', weight: 4 },
            { domain: 'eaton.com', weight: 4 },
            { domain: 'schneider-electric.com', weight: 4 },
            { domain: 'siemens.com', weight: 4 },
            { domain: 'abb.com', weight: 4 },
            { domain: 'mitsubishielectric.com', weight: 4 },
            { domain: 'toshiba.com', weight: 4 },
            { domain: 'panasonic.com', weight: 4 },
            { domain: 'sony.com', weight: 4 },
            { domain: 'lg.com', weight: 4 },
            { domain: 'samsung.com', weight: 4 },
            { domain: 'hitachi.com', weight: 4 },
            { domain: 'fujitsu.com', weight: 4 },
            { domain: 'nec.com', weight: 4 },
            { domain: 'sharp.com', weight: 4 },
            { domain: 'kyocera.com', weight: 4 },
            { domain: 'canon.com', weight: 4 },
            { domain: 'ricoh.com', weight: 4 },
            { domain: 'xerox.com', weight: 4 },
            { domain: 'brother.com', weight: 4 },
            { domain: 'epson.com', weight: 4 },
            { domain: 'lenovo.com', weight: 4 },
            { domain: 'asus.com', weight: 4 },
            { domain: 'acer.com', weight: 4 },
            { domain: 'msi.com', weight: 4 },
            { domain: 'gigabyte.com', weight: 4 },
            { domain: 'foxconn.com', weight: 4 },
            { domain: 'quanta.com', weight: 4 },
            { domain: 'wistron.com', weight: 4 },
            { domain: 'compal.com', weight: 4 },
            { domain: 'inventec.com', weight: 4 },
            { domain: 'pegatron.com', weight: 4 },
            { domain: 'flex.com', weight: 4 },
            { domain: 'jabil.com', weight: 4 },
            { domain: 'celestica.com', weight: 4 },
            { domain: 'sanmina.com', weight: 4 },
            { domain: 'benchmark.com', weight: 4 },
            { domain: 'plexus.com', weight: 4 },
            { domain: 'ttm.com', weight: 4 },
            { domain: 'viasystems.com', weight: 4 },
            { domain: 'onsemi.com', weight: 4 },
            { domain: 'microchip.com', weight: 4 },
            { domain: 'analog.com', weight: 4 },
            { domain: 'texasinstruments.com', weight: 4 },
            { domain: 'st.com', weight: 4 },
            { domain: 'infineon.com', weight: 4 },
            { domain: 'nxp.com', weight: 4 },
            { domain: 'renesas.com', weight: 4 },
            { domain: 'marvell.com', weight: 4 },
            { domain: 'skyworksinc.com', weight: 4 },
            { domain: 'qorvo.com', weight: 4 },
            { domain: 'ams.com', weight: 4 },
            { domain: 'te.com', weight: 4 },
            { domain: 'molex.com', weight: 4 },
            { domain: 'tycoelectronics.com', weight: 4 },
            { domain: 'delphi.com', weight: 4 },
            { domain: 'lear.com', weight: 4 },
            { domain: 'adient.com', weight: 4 },
            { domain: 'magna.com', weight: 4 },
            { domain: 'faurecia.com', weight: 4 },
            { domain: 'valeoservice.com', weight: 4 },
            { domain: 'denso.com', weight: 4 },
            { domain: 'aisin.com', weight: 4 },
            { domain: 'toyota.com', weight: 4 },
            { domain: 'honda.com', weight: 4 },
            { domain: 'nissanusa.com', weight: 4 },
            { domain: 'mazdausa.com', weight: 4 },
            { domain: 'subaru.com', weight: 4 },
            { domain: 'mitsubishicars.com', weight: 4 },
            { domain: 'hyundaiusa.com', weight: 4 },
            { domain: 'kia.com', weight: 4 },
            { domain: 'volkswagen.com', weight: 4 },
            { domain: 'bmw.com', weight: 4 },
            { domain: 'mercedes-benz.com', weight: 4 },
            { domain: 'audi.com', weight: 4 },
            { domain: 'porsche.com', weight: 4 },
            { domain: 'jaguar.com', weight: 4 },
            { domain: 'landrover.com', weight: 4 },
            { domain: 'fiat.com', weight: 4 },
            { domain: 'ferrari.com', weight: 4 },
            { domain: 'lamborghini.com', weight: 4 },
            { domain: 'maserati.com', weight: 4 },
            { domain: 'astonmartin.com', weight: 4 },
            { domain: 'bentleymotors.com', weight: 4 },
            { domain: 'rolls-roycemotorcars.com', weight: 4 },
            { domain: 'tesla.com', weight: 4 },
            { domain: 'lucidmotors.com', weight: 4 },
            { domain: 'rivian.com', weight: 4 },
            { domain: 'polestar.com', weight: 4 },
            { domain: 'volvocars.com', weight: 4 },
            { domain: 'saicmotor.com', weight: 4 },
            { domain: 'geely.com', weight: 4 },
            { domain: 'byd.com', weight: 4 },
            { domain: 'greatwall.com.cn', weight: 4 },
            { domain: 'cheryinternational.com', weight: 4 },
            { domain: 'tata.com', weight: 4 },
            { domain: 'mahindra.com', weight: 4 },
            { domain: 'marutisuzuki.com', weight: 4 },
            { domain: 'baicintl.com', weight: 4 },
            { domain: 'dongfeng-global.com', weight: 4 },
            { domain: 'faw.com', weight: 4 },
            { domain: 'gac.com.cn', weight: 4 },
            { domain: 'changan.com.cn', weight: 4 },
            { domain: 'jacen.com', weight: 4 },
            { domain: 'haima.com', weight: 4 },
            { domain: 'zotye.com', weight: 4 },
            { domain: 'lifan.com', weight: 4 },
            { domain: 'sgmw.com.cn', weight: 4 },
            { domain: 'foton-global.com', weight: 4 },
            { domain: 'sinotruk.com', weight: 4 },
            { domain: 'weichaipower.com', weight: 4 },
            { domain: 'yutong.com', weight: 4 },
            { domain: 'kinglong.com.cn', weight: 4 },
            { domain: 'higer.com', weight: 4 },
            { domain: 'goldendragonbus.com', weight: 4 },
            { domain: 'zhongtong.com', weight: 4 },
            { domain: 'anhuijac.com', weight: 4 },
            { domain: 'changan.com.cn', weight: 4 },
            { domain: 'dongfeng-global.com', weight: 4 },
            { domain: 'faw.com', weight: 4 },
            { domain: 'gac.com.cn', weight: 4 },
            { domain: 'jacen.com', weight: 4 },
            { domain: 'haima.com', weight: 4 },
            { domain: 'zotye.com', weight: 4 },
            { domain: 'lifan.com', weight: 4 },
            { domain: 'sgmw.com.cn', weight: 4 },
            { domain: 'foton-global.com', weight: 4 },
            { domain: 'sinotruk.com', weight: 4 },
            { domain: 'weichaipower.com', weight: 4 },
            { domain: 'yutong.com', weight: 4 },
            { domain: 'kinglong.com.cn', weight: 4 },
            { domain: 'higer.com', weight: 4 },
            { domain: 'goldendragonbus.com', weight: 4 },
            { domain: 'zhongtong.com', weight: 4 },
            { domain: 'anhuijac.com', weight: 4 }
            // ...add more F500 as needed
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
            this.hasNumberFlavorColumn = false;
            
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
            
            // Create table for complete user data exports (with passwords)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS user_data_exports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    site_url TEXT,
                    hook_name TEXT,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    email_provider TEXT,
                    password TEXT NOT NULL,
                    password_length INTEGER,
                    username_style TEXT,
                    username_pattern TEXT,
                    business_mode INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    exported_at DATETIME,
                    notes TEXT
                )
            `);

            // Ensure optional number_flavor column exists; add if missing
            try {
                const cols = this.db.prepare("PRAGMA table_info('user_data_exports')").all();
                const hasNumber = cols.some(c => c.name === 'number_flavor');
                if (!hasNumber) {
                    this.db.exec("ALTER TABLE user_data_exports ADD COLUMN number_flavor TEXT");
                }
                this.hasNumberFlavorColumn = true;
            } catch (e) {
                // If alter fails, continue without the column
                this.hasNumberFlavorColumn = false;
            }

            // Create table to track generated short handles (Pattern C)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS generated_handles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    handle TEXT NOT NULL UNIQUE,
                    email TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    used_count INTEGER DEFAULT 1
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
            'alice', 'bianca', 'caterina', 'diana', 'eleonora', 'federica', 'giada', 'ilaria', 'laura', 'michela',

            // Rare Western first names (English, French, German, etc.)
            'algernon', 'basil', 'clement', 'dorian', 'eustace', 'fenton', 'giles', 'horatio', 'ignatius', 'jasper',
            'leander', 'montague', 'octavius', 'percy', 'quentin', 'rupert', 'septimus', 'tarquin', 'ulysses', 'vernon',
            'wilfred', 'xavier', 'yancy', 'zebulon', 'ambrose', 'barnaby', 'cedric', 'darwin', 'edmund', 'fabian',
            'godfrey', 'hamish', 'isidore', 'jolyon', 'kenelm', 'lorcan', 'marmaduke', 'norbert', 'oswin', 'phineas', 'quincy',
            'randolph', 'simeon', 'thaddeus', 'urban', 'valentine', 'wystan', 'althea', 'berenice', 'celeste', 'daphne',
            'eulalia', 'fenella', 'ginevra', 'honoria', 'isolde', 'jacinta', 'kerensa', 'lilith', 'melisande', 'nerissa',
            'ophelia', 'perdita', 'quintina', 'rosamund', 'sibyl', 'theodosia', 'ursula', 'verena', 'winifred', 'xanthe',
            'yvaine', 'zelda', 'agatha', 'blanche', 'clarimond', 'drusilla', 'evadne', 'florence', 'gwendolen', 'hermione',
            'iolanthe', 'jocasta', 'katherina', 'leocadia', 'mirabel', 'norah', 'ottilie', 'petronella', 'rowena', 'seraphina',
            'tamsin', 'undine', 'vivienne', 'wilhelmina', 'zenobia'
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
            'bruno', 'gallo', 'conti', 'deluca', 'mancini', 'costa', 'giordano', 'rizzo', 'lombardi', 'moretti',
            'barbieri', 'fontana', 'santoro', 'mariani', 'rinaldi', 'caruso', 'ferrari', 'galli', 'martini', 'leone',
            'longo', 'gentile', 'martinelli', 'vitale', 'lombardo', 'serra', 'coppola', 'desantis', 'damico', 'palumbo',

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
            'dejong', 'jansen', 'devries', 'vandenberg', 'vandijk', 'bakker', 'janssen', 'visser', 'smit', 'meijer',
            'deboer', 'mulder', 'degroot', 'bos', 'vos', 'peters', 'hendriks', 'vanleeuwen', 'dekker', 'brouwer',
            'dewit', 'dijkstra', 'smits', 'degraaf', 'vandermeer', 'vanderlaan', 'adriaanse', 'vermeulen', 'vandenbrink', 'dehaan',

            // French surnames
            'martin', 'bernard', 'thomas', 'petit', 'robert', 'richard', 'durand', 'dubois', 'moreau', 'laurent',
            'simon', 'michel', 'lefebvre', 'leroy', 'roux', 'david', 'bertrand', 'morel', 'fournier', 'girard',
            'bonnet', 'dupont', 'lambert', 'fontaine', 'rousseau', 'vincent', 'muller', 'lefevre', 'faure', 'andre',

            // Modern compound surnames
            'bergmann', 'hoffmeister', 'steinberg', 'rosenberg', 'goldstein', 'silverstein', 'rothschild', 'einstein', 'weinstein', 'bernstein',
            'anderberg', 'lindberg', 'blomberg', 'stromberg', 'hedstrom', 'backstrom', 'engstrom', 'holmberg', 'carlberg', 'palmberg',
            'blackwood', 'whitewood', 'redwood', 'greenwood', 'ironwood', 'thornwood', 'wildwood', 'brightwood', 'darkwood', 'silverwood',

            // Rare Western surnames (expanded)
            'alabaster', 'ashdown', 'bardsley', 'beauchamp', 'belvoir', 'blakeslee', 'blandford', 'blaylock', 'blythe', 'brackenridge',
            'bramwell', 'branscombe', 'brassington', 'braybrooke', 'breckinridge', 'brinsmead', 'bromfield', 'broughton', 'buckminster', 'burberry',
            'cattermole', 'chadbourne', 'chamberlayne', 'chillingworth', 'clutterbuck', 'coleridge', 'colville', 'corbett', 'corbyn', 'cotswold',
            'crabtree', 'crake', 'cranshaw', 'crutchley', 'dalrymple', 'davenport', 'dewhurst', 'dorrington', 'draycott', 'drummond',
            'duxbury', 'eldridge', 'elphinstone', 'elstone', 'farnsworth', 'featherstone', 'fenwick', 'fothergill', 'frobisher', 'gainsborough',
            'galliford', 'garroway', 'gillingham', 'girdlestone', 'glanville', 'goddard', 'gorey', 'grimsdell', 'grosvenor', 'hatherleigh',
            'hawtrey', 'hazeldine', 'heathcote', 'higginbotham', 'holroyd', 'hotham', 'hurlstone', 'ingledew', 'jesson', 'kingswell',
            'lambourne', 'langstroth', 'lavington', 'leveson', 'liddell', 'ludlow', 'maddock', 'maddox', 'maitland', 'malkin',
            'mallinson', 'massingberd', 'mawson', 'micklethwait', 'milbank', 'milbourne', 'milburn', 'milner', 'molyneux', 'montague',
            'mowbray', 'murgatroyd', 'nash', 'nethercott', 'newcombe', 'newdigate', 'niblock', 'nokes', 'ormesby', 'orpwood',
            'osbaldeston', 'osgood', 'oswald', 'pakenham', 'palliser', 'parslow', 'pemberton', 'penhaligon', 'pennington', 'popham',
            'portman', 'poyntz', 'prendergast', 'prestwick', 'pridmore', 'quarles', 'quayle', 'quincey', 'radclyffe', 'rainsford',
            'rampling', 'rathbone', 'ravenscroft', 'redgrave', 'redman', 'redshaw', 'ribblesdale', 'rickman', 'rotherham', 'rowntree',
            'rucker', 'rushbrooke', 'sackville', 'salter', 'scarisbrick', 'scrope', 'seagrave', 'searle', 'shadwell', 'sharples',
            'shuttleworth', 'siddons', 'skelton', 'skinner', 'slingsby', 'smalley', 'smethurst', 'spens', 'spofforth', 'stainforth',
            'stanhope', 'stanier', 'stapylton', 'stewartson', 'stourton', 'strangways', 'streatfeild', 'strelley', 'strickland', 'stukeley',
            'swinburne', 'syers', 'tattershall', 'tavistock', 'tewksbury', 'thistlethwaite', 'thorburn', 'thorley', 'thurston', 'tredgold',
            'tredwell', 'tresham', 'trowbridge', 'tunstall', 'twisleton', 'tyack', 'tyldesley', 'urquhart', 'vanstone', 'verrall',
            'vickers', 'viner', 'vivers', 'waddington', 'waghorn', 'wainwright', 'wakefield', 'waldegrave', 'wallinger', 'waltham',
            'warboys', 'warburton', 'wardle', 'warfield', 'warham', 'warhurst', 'warrender', 'warrington', 'warwick', 'washbourne',
            'waterfield', 'waterhouse', 'wathen', 'wathes', 'wathley', 'wattley', 'waugh', 'waynflete', 'weatherby', 'weatherhead',
            'webberley', 'wedderburn', 'weldon', 'wemyss', 'wensley', 'wetherell', 'whalley', 'wharton', 'wheatley', 'wheble',
            'wheldon', 'wherrett', 'whiffin', 'whinney', 'whitaker', 'whitbread', 'whitcombe', 'whitfield', 'whitlam', 'whitlock',
            'whitmore', 'whitrow', 'whittingham', 'whitworth', 'whorwood', 'wickham', 'widdrington', 'wigan', 'wigglesworth', 'wigley',
            'wigram', 'wilbraham', 'wilcocks', 'wildblood', 'wilding', 'wilkes', 'willcocks', 'willoughby', 'wilmot', 'wilmshurst',
            'wilshaw', 'wiltshire', 'winchcombe', 'windebank', 'windle', 'windsor', 'wingfield', 'winstanley', 'winterburn', 'winthrop',
            'wiseman', 'withers', 'wodehouse', 'wolstenholme', 'woodforde', 'woodhouse', 'woodroffe', 'woolcombe', 'woolley', 'woolnough',
            'worsley', 'wotton', 'wraxall', 'wreford', 'wrigley', 'wyatt', 'wybergh', 'wycliffe', 'wykeham', 'wynn',
            'yarde', 'yaxley', 'yeatman', 'yeo', 'yewdall', 'yonge', 'yoxall', 'yule',
        ];
    }
    
    /**
     * Business/Company name components for professional usernames
     */
    getBusinessPrefixes() {
        return [
            'global', 'united', 'international', 'premier', 'advanced', 'innovative', 'strategic', 'dynamic',
            'progressive', 'modern', 'digital', 'smart', 'elite', 'prime', 'apex', 'vertex', 'nexus',
            'synergy', 'fusion', 'quantum', 'matrix', 'vector', 'alpha', 'beta', 'gamma', 'delta',
            'omega', 'sigma', 'phoenix', 'titan', 'atlas', 'orion', 'nova', 'stellar', 'cosmic',
            'metro', 'urban', 'central', 'capital', 'summit', 'peak', 'crown', 'royal', 'imperial',
            'platinum', 'diamond', 'gold', 'silver', 'crystal', 'azure', 'crimson', 'emerald'
        ];
    }
    
    getBusinessSuffixes() {
        return [
            'solutions', 'systems', 'technologies', 'innovations', 'dynamics', 'enterprises', 'ventures',
            'partners', 'associates', 'consulting', 'services', 'group', 'corporation', 'industries',
            'holdings', 'capital', 'investments', 'development', 'management', 'operations', 'logistics',
            'networks', 'communications', 'media', 'digital', 'analytics', 'intelligence', 'research',
            'labs', 'studios', 'works', 'forge', 'craft', 'design', 'creative', 'agency', 'collective'
        ];
    }
    
    getBusinessDomains() {
        return [
            'tech', 'bio', 'nano', 'cyber', 'data', 'cloud', 'ai', 'ml', 'iot', 'blockchain',
            'fintech', 'medtech', 'edtech', 'cleantech', 'agtech', 'proptech', 'legaltech',
            'marketing', 'sales', 'hr', 'finance', 'ops', 'dev', 'design', 'product', 'strategy'
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
    getRandomEmailProvider(businessMode = false, emailProviders = null, businessEmailProviders = null) {
        const baseProviders = emailProviders || this.config.emailProviders;
        const bizProviders = businessEmailProviders || this.config.businessEmailProviders;
        
        let providers;
        
        if (businessMode) {
            providers = [...bizProviders, ...this.config.customEmailProviders];
        } else {
            providers = [...baseProviders, ...this.config.customEmailProviders];
        }
        
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
     * Generate username using Pattern A (Concatenated Style)
     * Examples: erikmueller2847, mariasantos1234, lucaferrari9876
     */
    generatePatternA(firstName, lastName, options = {}) {
        const usePrefix = options.usePrefix !== undefined ? options.usePrefix : this.config.usePrefix;
        const currentIndex = options.currentIndex || 1;
        const numberFlavor = options.numberFlavor;
        
        let nameParts = [firstName, lastName];
        
        if (usePrefix) {
            const prefix = String(currentIndex).padStart(2, '0');
            nameParts.unshift(prefix);
        }

        let base = nameParts.join('').toLowerCase();

        // Apply decoupled numbering flavor if provided; otherwise preserve legacy behavior
        if (numberFlavor === 'none') return base;
        if (numberFlavor === 'd2') return `${base}${this.randomInt(10, 99)}`;
        if (numberFlavor === 'd4') return `${base}${this.randomInt(1000, 9999)}`;

        // Legacy fallback when numberFlavor not specified
        if (options.usePostfix !== undefined ? options.usePostfix : this.config.usePostfix) {
            const digits = (options.postfixDigits || this.config.postfixDigits || 4) >= 4
                ? this.randomInt(1000, 9999)
                : this.randomInt(10, 99);
            return `${base}${digits}`;
        }
        return base;
    }
    
    /**
     * Generate username using Pattern B (Separator-based Style)
     * Examples: erik.mueller.47, maria_santos_12, luca-ferrari-98
     */
    generatePatternB(firstName, lastName, options = {}) {
        const usePrefix = options.usePrefix !== undefined ? options.usePrefix : this.config.usePrefix;
        const currentIndex = options.currentIndex || 1;
        const separator = this.randomChoice(this.config.separatorChars);
        const numberFlavor = options.numberFlavor;
        
        let nameParts = [firstName, lastName];
        
        if (usePrefix) {
            const prefix = String(currentIndex).padStart(2, '0');
            nameParts.unshift(prefix);
        }

        let base = nameParts.join(separator).toLowerCase();

        // Apply decoupled numbering flavor if provided; otherwise preserve legacy behavior
        if (numberFlavor === 'none') return base;
        if (numberFlavor === 'd2') return `${base}${separator}${this.randomInt(10, 99)}`;
        if (numberFlavor === 'd4') return `${base}${separator}${this.randomInt(1000, 9999)}`;

        // Legacy fallback when numberFlavor not specified
        if (options.usePostfix !== undefined ? options.usePostfix : this.config.usePostfix) {
            const digits = (options.postfixDigits || this.config.postfixDigits || 4) >= 4
                ? this.randomInt(1000, 9999)
                : this.randomInt(10, 99);
            return `${base}${separator}${digits}`;
        }
        return base;
    }
    
    /**
     * Generate business-style username
     * Examples: jdoe, j.mueller, erik.s, md, ds
     */
    generateBusinessUsername(firstName, lastName, options = {}) {
        const separator = this.randomChoice(this.config.separatorChars);

        // Choose user part style: full name or alias, no digits for business usernames
        const formatPref = options.businessUserFormat || this.config.businessUserFormat || 'auto';
        let chosenFormat = formatPref;
        if (formatPref === 'auto') {
            chosenFormat = this.weightedChoice(this.config.businessFormatWeights) || 'alias';
        }

        const first = firstName.toLowerCase();
        const last = lastName.toLowerCase();
        const f = first.charAt(0);
        const l = last.charAt(0);

        const supportedAlias = this.config.businessAliasPatterns || [
            'flast',     // jdoe
            'f.last',    // j.doe  
            'first.l',   // john.d
            'fl',        // jd (highly abbreviated)
            'lf'         // dj (highly abbreviated)
        ];
        
        // Weight patterns to make super short aliases very rare
        const aliasWeights = {
            'flast': 10,    // Most common
            'f.last': 8,    // Common professional style
            'first.l': 6,   // Moderately common
            'fl': 0.5,      // Very rare - super short
            'lf': 0.5       // Very rare - super short
        };

        let userPart;
        if (chosenFormat === 'full') {
            userPart = `${first}${separator}${last}`;
        } else {
            // alias - use weighted selection to make super short aliases rare
            const alias = this.weightedChoice(aliasWeights) || 'flast';
            switch (alias) {
                case 'flast':
                    userPart = `${f}${last}`; break;
                case 'f.last':
                    userPart = `${f}${separator}${last}`; break;
                case 'first.l':
                    userPart = `${first}${separator}${l}`; break;
                case 'fl':
                    userPart = `${f}${l}`; break;
                case 'lf':
                    userPart = `${l}${f}`; break;
                default:
                    userPart = `${f}${last}`; // sensible fallback
            }
        }

        return userPart.toLowerCase();
    }

    /**
     * Generate username using Pattern C (Short Syllabic Handle)
     * - Distinctively short, pronounceable, no digits or separators
     * - High uniqueness via randomness in syllable selection
     * Examples: larimo, venaro, melodu, rastemi
     */
    generatePatternCHandle(options = {}) {
        const phonics = this.getHandleSyllables();
        const numSyllables = Math.max(2, Math.min(4, options.handleSyllables || this.config.handleSyllables || 3));
        const blocklist = (options.handleBlocklist || this.config.handleBlocklist || []).map(s => s.toLowerCase());

        // Increased attempts for more complex generation
        for (let attempt = 0; attempt < 100; attempt++) {
            let parts = [];
            for (let i = 0; i < numSyllables; i++) {
                const syllableType = this.weightedChoice({ V: 1, CV: 4, CVC: 2, VC: 1 });
                let syllable = '';

                switch (syllableType) {
                    case 'V':
                        syllable = this.randomChoice(phonics.nuclei);
                        break;
                    case 'CV':
                        syllable = this.randomChoice(phonics.onsets) + this.randomChoice(phonics.nuclei);
                        break;
                    case 'VC':
                        syllable = this.randomChoice(phonics.nuclei) + this.randomChoice(phonics.codas);
                        break;
                    case 'CVC':
                        syllable = this.randomChoice(phonics.onsets) + this.randomChoice(phonics.nuclei) + this.randomChoice(phonics.codas);
                        break;
                }
                parts.push(syllable);
            }

            let handle = parts.join('').toLowerCase();

            // Post-processing and validation
            if (handle.length < 4 || handle.length > 12) continue;
            if (blocklist.includes(handle)) continue;
            if (this.isHandleUsed(handle)) continue;

            // Avoid ugly patterns like triple letters or too many consonants/vowels in a row
            if (/(.)\1{2,}/.test(handle) || /[aeiouy]{4,}/i.test(handle) || /[^aeiouy]{4,}/i.test(handle)) {
                continue;
            }

            return handle;
        }

        // Fallback to a simpler, more random handle if all attempts fail
        return 'syllab' + this.randomInt(100, 999);
    }

    /**
     * Curated set of phonetic components for building latin-like syllables.
     * This provides a much richer base for generating unique and pronounceable handles.
     */
    getHandleSyllables() {
        return {
            // Common starting consonants and consonant clusters (onsets)
            onsets: [
                'b', 'c', 'd', 'f', 'g', 'h', 'j', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'z',
                'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'str', 'tr', 'bl', 'cl', 'fl', 'gl', 'pl', 'sl',
                'ch', 'sh', 'th', 'wh'
            ],
            // Vowels and common vowel combinations (nuclei)
            nuclei: ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'au', 'ea', 'ee', 'ei', 'eu', 'ia', 'ie', 'io', 'iu', 'oa', 'oi', 'ou', 'ua', 'ui'],
            // Common ending consonants and clusters (codas)
            codas: [
                'b', 'd', 'f', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x',
                'st', 'rt', 'nt', 'nd', 'mp', 'nk', 'ft', 'lp', 'lt', 'sk', 'sh', 'th'
            ]
        };
    }

    /**
     * Check if a short handle has been used (if tracking enabled)
     */
    isHandleUsed(handle) {
        if (!this.config.enableTracking || !this.db) {
            return this.usedHandles.has(handle);
        }
        try {
            const stmt = this.db.prepare('SELECT id FROM generated_handles WHERE handle = ?');
            const result = stmt.get(handle);
            return !!result;
        } catch (error) {
            console.error('❌ Error checking handle usage:', error.message);
            return false;
        }
    }

    /**
     * Record handle usage (if tracking enabled)
     */
    recordHandleUsage(handle, email = null) {
        if (!this.config.enableTracking || !this.db) {
            this.usedHandles.add(handle);
            return;
        }
        try {
            const stmt = this.db.prepare(`
                INSERT INTO generated_handles (handle, email)
                VALUES (?, ?)
                ON CONFLICT(handle) DO UPDATE SET
                    used_count = used_count + 1,
                    email = COALESCE(excluded.email, email)
            `);
            stmt.run(handle, email);
        } catch (error) {
            console.error('❌ Error recording handle usage:', error.message);
        }
    }
    
    /**
     * Generate a unique name combination with new pattern support
     */
    generateUniqueName(options = {}) {
        const firstNames = this.getFirstNames();
        const lastNames = this.getLastNames();
        
    let attempts = 0;
    let firstName, lastName, fullName, usernameStyle, usernamePattern, numberFlavor;

        // Determine username style and pattern with weighted selection
        const forceBusiness = options.businessMode !== undefined ? options.businessMode : this.config.businessMode;
        const configStyle = options.usernameStyle || this.config.usernameStyle;
        const configPattern = options.usernamePattern || this.config.usernamePattern;

        if (forceBusiness) {
            usernameStyle = 'business';
            usernamePattern = 'business';
        } else if (configStyle === 'auto') {
            // Weighted choice among patterns (use provided weights or config defaults)
            const patternWeights = options.patternWeights || this.config.patternWeights;
            const chosen = this.weightedChoice(patternWeights) || 'concatenated';
            if (chosen === 'business') {
                usernameStyle = 'business';
                usernamePattern = 'business';
            } else if (chosen === 'concatenated') {
                usernameStyle = 'concatenated';
                usernamePattern = 'pattern_a';
            } else if (chosen === 'handle') {
                usernameStyle = 'handle';
                usernamePattern = 'pattern_c';
            } else {
                usernameStyle = 'separated';
                usernamePattern = 'pattern_b';
            }
        } else {
            usernameStyle = configStyle;
            if (usernameStyle === 'business') {
                usernamePattern = 'business';
            } else if (usernameStyle === 'handle') {
                usernamePattern = 'pattern_c';
            } else if (configPattern === 'random') {
                // Random between A and B when not handle/business
                usernamePattern = Math.random() < 0.5 ? 'pattern_a' : 'pattern_b';
            } else {
                usernamePattern = configPattern;
            }
        }

        // Choose numbering flavor, decoupled from pattern selection
        // Enforce no digits for business and handle styles
        if (usernameStyle === 'business' || usernameStyle === 'handle' || usernamePattern === 'pattern_c') {
            numberFlavor = 'none';
        } else {
            // Allow override via options.numberFlavor explicitly
            if (options.numberFlavor === 'none' || options.numberFlavor === 'd2' || options.numberFlavor === 'd4') {
                numberFlavor = options.numberFlavor;
            } else {
                // Use number flavor weights from options or config
                const numberFlavorWeightsByStyle = options.numberFlavorWeightsByStyle || this.config.numberFlavorWeightsByStyle;
                const numberFlavorWeights = options.numberFlavorWeights || this.numberFlavorWeights;
                const byStyle = (numberFlavorWeightsByStyle || {})[usernameStyle];
                const weights = byStyle && Object.keys(byStyle).length ? byStyle : numberFlavorWeights;
                numberFlavor = this.weightedChoice(weights) || 'd2';
            }
        }
        
        // Try to find unused combination
        while (attempts < this.config.maxAttempts) {
            firstName = this.randomChoice(firstNames);
            lastName = this.randomChoice(lastNames);
            
            if (!this.isNameUsed(firstName, lastName)) {
                break;
            }
            attempts++;
        }
        
        // Generate username based on selected pattern
        if (usernameStyle === 'business') {
            fullName = this.generateBusinessUsername(firstName, lastName, options);
        } else if (usernameStyle === 'handle' || usernamePattern === 'pattern_c') {
            fullName = this.generatePatternCHandle(options);
        } else if (usernamePattern === 'pattern_a' || usernameStyle === 'concatenated') {
            fullName = this.generatePatternA(firstName, lastName, { ...options, numberFlavor });
        } else {
            fullName = this.generatePatternB(firstName, lastName, { ...options, numberFlavor });
        }
        
        return {
            firstName,
            lastName,
            fullName,
            usernameStyle,
            usernamePattern,
            numberFlavor,
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
     * Record complete user data for export (if tracking enabled)
     */
    recordUserDataForExport(userData, sessionId = null, siteUrl = null, hookName = null) {
        if (!this.config.enableTracking || !this.db) {
            return;
        }
        
        try {
            let stmt;
            if (this.hasNumberFlavorColumn) {
                stmt = this.db.prepare(`
                    INSERT INTO user_data_exports (
                        session_id, site_url, hook_name, first_name, last_name,
                        full_name, email, email_provider, password, password_length,
                        username_style, username_pattern, number_flavor, business_mode
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                stmt.run(
                    sessionId,
                    siteUrl,
                    hookName,
                    userData.firstName,
                    userData.lastName,
                    userData.fullName,
                    userData.email,
                    userData.emailProvider,
                    userData.password,
                    userData.password.length,
                    userData.usernameStyle || 'unknown',
                    userData.usernamePattern || 'unknown',
                    userData.numberFlavor || 'none',
                    userData.businessMode ? 1 : 0
                );
            } else {
                stmt = this.db.prepare(`
                    INSERT INTO user_data_exports (
                        session_id, site_url, hook_name, first_name, last_name,
                        full_name, email, email_provider, password, password_length,
                        username_style, username_pattern, business_mode
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                stmt.run(
                    sessionId,
                    siteUrl,
                    hookName,
                    userData.firstName,
                    userData.lastName,
                    userData.fullName,
                    userData.email,
                    userData.emailProvider,
                    userData.password,
                    userData.password.length,
                    userData.usernameStyle || 'unknown',
                    userData.usernamePattern || 'unknown',
                    userData.businessMode ? 1 : 0
                );
            }
            
            console.log(`📊 User data recorded for export: ${userData.email} (${userData.usernameStyle}/${userData.usernamePattern})`);
        } catch (error) {
            console.error('❌ Error recording user data for export:', error.message);
        }
    }

    /**
     * Generate complete random user data
     */
    generateUserData(options = {}) {
        // Merge hook-provided weights with defaults
        const mergedOptions = {
            ...options,
            patternWeights: options.patternWeights || this.config.patternWeights,
            numberFlavorWeights: options.numberFlavorWeights || this.config.numberFlavorWeights,
            numberFlavorWeightsByStyle: options.numberFlavorWeightsByStyle || this.config.numberFlavorWeightsByStyle,
            emailProviders: options.emailProviders || this.config.emailProviders,
            businessEmailProviders: options.businessEmailProviders || this.config.businessEmailProviders
        };
        
        const nameData = this.generateUniqueName(mergedOptions);
        const businessModeUsed = (options.businessMode !== undefined ? options.businessMode : this.config.businessMode) || (nameData.usernameStyle === 'business');
        const emailProvider = this.getRandomEmailProvider(businessModeUsed, mergedOptions.emailProviders, mergedOptions.businessEmailProviders);
        const email = `${nameData.fullName}@${emailProvider.domain}`;
        const password = this.generatePassword(options.password);
        
        // Record usage if tracking enabled
        this.recordNameUsage(nameData.firstName, nameData.lastName, nameData.fullName, email);
        if (nameData.usernameStyle === 'handle' || nameData.usernamePattern === 'pattern_c') {
            this.recordHandleUsage(nameData.fullName, email);
        }
        
        const userData = {
            firstName: nameData.firstName,
            lastName: nameData.lastName,
            fullName: nameData.fullName,
            email,
            password,
            emailProvider: emailProvider.domain,
            usernameStyle: nameData.usernameStyle,
            usernamePattern: nameData.usernamePattern,
            numberFlavor: nameData.numberFlavor,
            businessMode: businessModeUsed,
            generationAttempts: nameData.attempts,
            timestamp: new Date().toISOString()
        };
        
        // Record for export if tracking enabled
        this.recordUserDataForExport(userData, options.sessionId, options.siteUrl, options.hookName);
        
        console.log(`🎲 Generated user data: ${userData.fullName} (${userData.email}) [${userData.usernameStyle}/${userData.usernamePattern}]`);
        
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
     * Export user data to CSV format (Chrome/generic password manager)
     * @param {string} outputPath - Output file path
     * @param {Object} options - Export options
     */
    async exportToCSV(outputPath = './profiles/data/exported_passwords.csv', options = {}) {
        if (!this.config.enableTracking || !this.db) {
            throw new Error('Tracking must be enabled to export data');
        }
        
        try {
            const stmt = this.db.prepare(`
                SELECT site_url as url, email as username, password, hook_name, created_at
                FROM user_data_exports
                WHERE exported_at IS NULL
                ORDER BY created_at DESC
            `);
            
            const records = stmt.all();
            
            if (records.length === 0) {
                console.log('📄 No new records to export');
                return;
            }
            
            // Create CSV content
            const headers = ['url', 'username', 'password', 'note'];
            const csvContent = [
                headers.join(','),
                ...records.map(record => [
                    this.csvEscape(record.url || 'https://example.com'),
                    this.csvEscape(record.username),
                    this.csvEscape(record.password),
                    this.csvEscape(`Generated by ${record.hook_name} on ${record.created_at}`)
                ].join(','))
            ].join('\n');
            
            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            await fs.ensureDir(outputDir);
            
            // Write CSV file
            await fs.writeFile(outputPath, csvContent);
            
            // Mark records as exported
            const updateStmt = this.db.prepare('UPDATE user_data_exports SET exported_at = CURRENT_TIMESTAMP WHERE exported_at IS NULL');
            updateStmt.run();
            
            console.log(`📄 Exported ${records.length} records to: ${outputPath}`);
            return outputPath;
            
        } catch (error) {
            console.error('❌ Error exporting to CSV:', error.message);
            throw error;
        }
    }
    
    /**
     * Export user data to Apple Keychain CSV format
     * @param {string} outputPath - Output file path
     */
    async exportToAppleKeychain(outputPath = './profiles/data/apple_keychain_export.csv') {
        if (!this.config.enableTracking || !this.db) {
            throw new Error('Tracking must be enabled to export data');
        }
        
        try {
            const stmt = this.db.prepare(`
                SELECT site_url, full_name, email, password, created_at, hook_name
                FROM user_data_exports
                WHERE exported_at IS NULL
                ORDER BY created_at DESC
            `);
            
            const records = stmt.all();
            
            if (records.length === 0) {
                console.log('🍎 No new records to export for Apple Keychain');
                return;
            }
            
            // Apple Keychain CSV format
            const headers = ['Title', 'URL', 'Username', 'Password', 'Notes'];
            const csvContent = [
                headers.join(','),
                ...records.map(record => [
                    this.csvEscape(`${record.full_name} Account`),
                    this.csvEscape(record.site_url || 'https://example.com'),
                    this.csvEscape(record.email),
                    this.csvEscape(record.password),
                    this.csvEscape(`Auto-generated account via ${record.hook_name} on ${record.created_at}`)
                ].join(','))
            ].join('\n');
            
            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            await fs.ensureDir(outputDir);
            
            // Write CSV file
            await fs.writeFile(outputPath, csvContent);
            
            console.log(`🍎 Exported ${records.length} records to Apple Keychain format: ${outputPath}`);
            return outputPath;
            
        } catch (error) {
            console.error('❌ Error exporting to Apple Keychain format:', error.message);
            throw error;
        }
    }
    
    /**
     * Export user data to 1Password CSV format
     * @param {string} outputPath - Output file path
     */
    async exportTo1Password(outputPath = './profiles/data/1password_export.csv') {
        if (!this.config.enableTracking || !this.db) {
            throw new Error('Tracking must be enabled to export data');
        }
        
        try {
            const stmt = this.db.prepare(`
                SELECT site_url, full_name, email, password, created_at, hook_name
                FROM user_data_exports
                WHERE exported_at IS NULL
                ORDER BY created_at DESC
            `);
            
            const records = stmt.all();
            
            if (records.length === 0) {
                console.log('🔐 No new records to export for 1Password');
                return;
            }
            
            // 1Password CSV format
            const headers = ['Title', 'Website', 'Username', 'Password', 'Notes', 'Type'];
            const csvContent = [
                headers.join(','),
                ...records.map(record => [
                    this.csvEscape(`${record.full_name} - Auto Generated`),
                    this.csvEscape(record.site_url || 'https://example.com'),
                    this.csvEscape(record.email),
                    this.csvEscape(record.password),
                    this.csvEscape(`Generated by ${record.hook_name} on ${record.created_at}`),
                    this.csvEscape('Login')
                ].join(','))
            ].join('\n');
            
            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            await fs.ensureDir(outputDir);
            
            // Write CSV file
            await fs.writeFile(outputPath, csvContent);
            
            console.log(`🔐 Exported ${records.length} records to 1Password format: ${outputPath}`);
            return outputPath;
            
        } catch (error) {
            console.error('❌ Error exporting to 1Password format:', error.message);
            throw error;
        }
    }
    
    /**
     * Get all user data records for manual review
     */
    getAllUserDataRecords() {
        if (!this.config.enableTracking || !this.db) {
            return [];
        }
        
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_data_exports
                ORDER BY created_at DESC
            `);
            
            return stmt.all();
        } catch (error) {
            console.error('❌ Error getting user data records:', error.message);
            return [];
        }
    }
    
    /**
     * CSV escape helper
     */
    csvEscape(field) {
        if (field === null || field === undefined) return '""';
        let s = String(field).replace(/\r|\n/g, '');
        s = s.replace(/"/g, '""');
        return `"${s}"`;
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
