import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import tar from 'tar';

export class ProfileManager {
    constructor(baseDir = './profiles') {
        this.baseDir = path.resolve(baseDir);
        this.dbPath = path.join(this.baseDir, 'profiles.db');
        this.initPromise = this.init();
    }

    async init() {
        // Ensure base directory exists
        await fs.ensureDir(this.baseDir);
        
        // Initialize SQLite database
        this.db = new sqlite3.Database(this.dbPath);
        const run = promisify(this.db.run.bind(this.db));
        
        await run(`
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                browser_type TEXT DEFAULT 'chromium',
                user_data_dir TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used DATETIME,
                session_count INTEGER DEFAULT 0,
                imported_from TEXT,
                metadata TEXT
            )
        `);
        
        await run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                session_type TEXT DEFAULT 'manual',
                metadata TEXT,
                FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
            )
        `);
    }

    async createProfile(name, options = {}) {
        await this.initPromise;
        
        const {
            description = '',
            browserType = 'chromium',
            importFrom = null,
            disableCompression = false
        } = options;

        const profileId = uuidv4();
        const userDataDir = path.join(this.baseDir, 'data', profileId);
        
        // Ensure user data directory exists
        await fs.ensureDir(userDataDir);
        
        const run = promisify(this.db.run.bind(this.db));
        
        try {
            await run(`
                INSERT INTO profiles (id, name, description, browser_type, user_data_dir, imported_from)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [profileId, name, description, browserType, userDataDir, importFrom]);
            // Initialize metadata: compression preference on by default unless disabled
            const initialMeta = {
                compressOnClose: !disableCompression,
                compressed: false
            };
            await this.setProfileMetadata(profileId, initialMeta);
            
            return {
                id: profileId,
                name,
                description,
                browserType,
                userDataDir,
                importedFrom: importFrom,
                metadata: initialMeta
            };
        } catch (error) {
            // Clean up directory if database insert fails
            await fs.remove(userDataDir);
            throw new Error(`Failed to create profile: ${error.message}`);
        }
    }

    async listProfiles() {
        await this.initPromise;
        const all = promisify(this.db.all.bind(this.db));
        const profiles = await all(`
            SELECT 
                id, name, description, browser_type, user_data_dir, 
                created_at, last_used, session_count, imported_from
            FROM profiles 
            ORDER BY last_used DESC, created_at DESC
        `);
        
        return profiles.map(profile => ({
            id: profile.id,
            name: profile.name,
            description: profile.description,
            browserType: profile.browser_type,
            userDataDir: profile.user_data_dir,
            createdAt: profile.created_at,
            lastUsed: profile.last_used,
            sessionCount: profile.session_count,
            importedFrom: profile.imported_from
        }));
    }

    async getProfile(nameOrId) {
        await this.initPromise;
        const get = promisify(this.db.get.bind(this.db));
        const profile = await get(`
            SELECT * FROM profiles 
            WHERE id = ? OR name = ?
        `, [nameOrId, nameOrId]);
        
        if (!profile) {
            throw new Error(`Profile not found: ${nameOrId}`);
        }
        
        // Load metadata if present
        let metadata = {};
        try {
            const meta = await this.getProfileMetadataRaw(profile.id);
            metadata = meta || {};
        } catch (_) {}

        return {
            id: profile.id,
            name: profile.name,
            description: profile.description,
            browserType: profile.browser_type,
            userDataDir: profile.user_data_dir,
            createdAt: profile.created_at,
            lastUsed: profile.last_used,
            sessionCount: profile.session_count,
            importedFrom: profile.imported_from,
            metadata
        };
    }

    async deleteProfile(nameOrId) {
        await this.initPromise;
        const profile = await this.getProfile(nameOrId);
        const run = promisify(this.db.run.bind(this.db));
        
        // Remove user data directory or archive
        const { archivePath } = this.getProfileStoragePaths(profile);
        if (await fs.pathExists(archivePath)) {
            await fs.remove(archivePath);
        }
        await fs.remove(profile.userDataDir);
        
        // Clean up profile-specific VidIQ extension
        try {
            const vidiqExtensionPath = `./profiles/data/vidiq-extensions/${profile.name}-vidiq-extension`;
            if (await fs.pathExists(vidiqExtensionPath)) {
                await fs.remove(vidiqExtensionPath);
            }
        } catch (error) {
            // Non-critical error, just warn
            console.warn(`Could not clean up VidIQ extension for ${profile.name}: ${error.message}`);
        }
        
        // Remove from database
        await run('DELETE FROM profiles WHERE id = ?', [profile.id]);
        
        return profile;
    }

    async cloneProfile(sourceNameOrId, newName, description = '', options = {}) {
        const sourceProfile = await this.getProfile(sourceNameOrId);
        const clonedProfile = await this.createProfile(newName, {
            description: description || `Clone of ${sourceProfile.name}`,
            browserType: sourceProfile.browserType,
            disableCompression: options.disableCompression !== undefined ? options.disableCompression : (sourceProfile.metadata?.compressOnClose === false)
        });
        
        // Copy or extract source data
        const { archivePath: srcArchive } = this.getProfileStoragePaths(sourceProfile);
        if (await fs.pathExists(sourceProfile.userDataDir)) {
            await fs.copy(sourceProfile.userDataDir, clonedProfile.userDataDir);
        } else if (await fs.pathExists(srcArchive)) {
            await fs.ensureDir(clonedProfile.userDataDir);
            await tar.extract({ file: srcArchive, cwd: clonedProfile.userDataDir, strip: 1 });
        }
        
        return clonedProfile;
    }

    async renameProfile(nameOrId, newName) {
        await this.initPromise;
        const profile = await this.getProfile(nameOrId);
        const run = promisify(this.db.run.bind(this.db));
        
        await run('UPDATE profiles SET name = ? WHERE id = ?', [newName, profile.id]);
        
        return { ...profile, name: newName };
    }

    async updateLastUsed(profileId) {
        await this.initPromise;
        const run = promisify(this.db.run.bind(this.db));
        await run(`
            UPDATE profiles 
            SET last_used = CURRENT_TIMESTAMP, session_count = session_count + 1 
            WHERE id = ?
        `, [profileId]);
    }

    async startSession(profileId, sessionType = 'manual') {
        await this.initPromise;
        const sessionId = uuidv4();
        const run = promisify(this.db.run.bind(this.db));
        
        await run(`
            INSERT INTO sessions (id, profile_id, session_type)
            VALUES (?, ?, ?)
        `, [sessionId, profileId, sessionType]);
        
        await this.updateLastUsed(profileId);
        
        return sessionId;
    }

    async endSession(sessionId) {
        await this.initPromise;
        const run = promisify(this.db.run.bind(this.db));
        await run(`
            UPDATE sessions 
            SET end_time = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [sessionId]);
    }

    async clearProfileCache(nameOrId) {
        const profile = await this.getProfile(nameOrId);
        // If profile is compressed, skip cache clearing (no effect) and report
        if (await this.isCompressed(profile)) {
            return profile; // no-op for compressed archives
        }
        await this.clearCacheDirectories(profile.userDataDir);
        return profile;
    }

    async clearAllProfilesCache() {
        const profiles = await this.listProfiles();
        const results = [];
        
        for (const profile of profiles) {
            try {
                await this.clearCacheDirectories(profile.userDataDir);
                results.push({ 
                    profileId: profile.id, 
                    profileName: profile.name, 
                    success: true 
                });
            } catch (error) {
                results.push({ 
                    profileId: profile.id, 
                    profileName: profile.name, 
                    success: false, 
                    error: error.message 
                });
            }
        }
        
        return results;
    }

    async clearCacheDirectories(userDataDir) {
        const cacheDirectories = [
            // Main browser cache directories
            'Default/Cache',
            'Default/Code Cache',
            'Default/GPUCache',
            'Default/DawnGraphiteCache',
            'Default/DawnWebGPUCache',
            'GraphiteDawnCache',
            'GrShaderCache',
            'ShaderCache',
            
            // Component and extension caches
            'component_crx_cache',
            'extensions_crx_cache',
            
            // Temporary and blob storage
            'Default/blob_storage',
            'Default/Shared Dictionary',
            
            // Database cache files that can be safely removed
            'Default/heavy_ad_intervention_opt_out.db',
            'Default/heavy_ad_intervention_opt_out.db-journal'
        ];

        const filesToRemove = [
            // Temporary files
            'BrowserMetrics-spare.pma',
            'SingletonCookie',
            'SingletonLock', 
            'SingletonSocket',
            'RunningChromeVersion'
        ];

        let totalSizeCleared = 0;
        const results = {
            directoriesCleared: [],
            filesRemoved: [],
            errors: [],
            totalSizeCleared: 0
        };

        // Clear cache directories
        for (const cacheDir of cacheDirectories) {
            const fullPath = path.join(userDataDir, cacheDir);
            try {
                if (await fs.pathExists(fullPath)) {
                    // Calculate size before removal
                    const size = await this.getDirectorySize(fullPath);
                    await fs.remove(fullPath);
                    totalSizeCleared += size;
                    results.directoriesCleared.push({ path: cacheDir, size });
                }
            } catch (error) {
                results.errors.push({ path: cacheDir, error: error.message });
            }
        }

        // Remove temporary files
        for (const file of filesToRemove) {
            const fullPath = path.join(userDataDir, file);
            try {
                if (await fs.pathExists(fullPath)) {
                    const stats = await fs.stat(fullPath);
                    await fs.remove(fullPath);
                    totalSizeCleared += stats.size;
                    results.filesRemoved.push({ path: file, size: stats.size });
                }
            } catch (error) {
                results.errors.push({ path: file, error: error.message });
            }
        }

        results.totalSizeCleared = totalSizeCleared;
        return results;
    }

    async getDirectorySize(dirPath) {
        let totalSize = 0;
        try {
            const items = await fs.readdir(dirPath);
            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stats = await fs.stat(itemPath);
                if (stats.isDirectory()) {
                    totalSize += await this.getDirectorySize(itemPath);
                } else {
                    totalSize += stats.size;
                }
            }
        } catch (error) {
            // If we can't read the directory, just return 0
            return 0;
        }
        return totalSize;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // ---- Compression helpers ----

    getProfileStoragePaths(profile) {
        const dirPath = profile.userDataDir;
        const archivePath = path.join(this.baseDir, 'data', `${profile.id}.tgz`);
        return { dirPath, archivePath };
    }

    async getProfileMetadataRaw(profileId) {
        const get = promisify(this.db.get.bind(this.db));
        const row = await get('SELECT metadata FROM profiles WHERE id = ?', [profileId]);
        if (!row) return null;
        try {
            return row.metadata ? JSON.parse(row.metadata) : null;
        } catch (_) {
            return null;
        }
    }

    async setProfileMetadata(profileId, obj = {}) {
        await this.initPromise;
        const run = promisify(this.db.run.bind(this.db));
        const existing = (await this.getProfileMetadataRaw(profileId)) || {};
        const merged = { ...existing, ...obj };
        await run('UPDATE profiles SET metadata = ? WHERE id = ?', [JSON.stringify(merged), profileId]);
        return merged;
    }

    async isCompressed(profile) {
        const { dirPath, archivePath } = this.getProfileStoragePaths(profile);
        const dirExists = await fs.pathExists(dirPath);
        const archiveExists = await fs.pathExists(archivePath);
        return archiveExists && !dirExists;
    }

    async compressProfile(profile) {
        const { dirPath, archivePath } = this.getProfileStoragePaths(profile);
        if (!await fs.pathExists(dirPath)) {
            // Nothing to compress
            return { skipped: true, reason: 'No directory to compress' };
        }
        await fs.ensureDir(path.dirname(archivePath));
        // Create tar.gz archive of the directory contents
        await tar.create(
            { gzip: true, cwd: dirPath, file: archivePath },
            ['.']
        );
        // Remove original directory after successful archive
        await fs.remove(dirPath);
        await this.setProfileMetadata(profile.id, { compressed: true });
        return { archivePath };
    }

    async decompressProfile(profile) {
        const { dirPath, archivePath } = this.getProfileStoragePaths(profile);
        if (!await fs.pathExists(archivePath)) {
            return { skipped: true, reason: 'No archive to decompress' };
        }
        await fs.ensureDir(dirPath);
        await tar.extract({ file: archivePath, cwd: dirPath });
        // Remove archive after extraction to avoid duplication
        await fs.remove(archivePath);
        await this.setProfileMetadata(profile.id, { compressed: false });
        return { dirPath };
    }

    async ensureDecompressed(profile) {
        if (await this.isCompressed(profile)) {
            await this.decompressProfile(profile);
        }
    }

    async setCompressionPreference(nameOrId, compressOnClose) {
        const profile = await this.getProfile(nameOrId);
        await this.setProfileMetadata(profile.id, { compressOnClose: !!compressOnClose });
        return { ...profile, metadata: { ...(profile.metadata || {}), compressOnClose: !!compressOnClose } };
    }

    async compressAllProfiles(filter = {}) {
        const profiles = await this.listProfiles();
        const results = [];
        for (const p of profiles) {
            try {
                if (await this.isCompressed(p)) {
                    results.push({ profileId: p.id, profileName: p.name, skipped: true, reason: 'already compressed' });
                    continue;
                }
                const r = await this.compressProfile(p);
                results.push({ profileId: p.id, profileName: p.name, success: true, ...r });
            } catch (e) {
                results.push({ profileId: p.id, profileName: p.name, success: false, error: e.message });
            }
        }
        return results;
    }

    async decompressAllProfiles() {
        const profiles = await this.listProfiles();
        const results = [];
        for (const p of profiles) {
            try {
                if (!(await this.isCompressed(p))) {
                    results.push({ profileId: p.id, profileName: p.name, skipped: true, reason: 'not compressed' });
                    continue;
                }
                const r = await this.decompressProfile(p);
                results.push({ profileId: p.id, profileName: p.name, success: true, ...r });
            } catch (e) {
                results.push({ profileId: p.id, profileName: p.name, success: false, error: e.message });
            }
        }
        return results;
    }

    async close() {
        if (this.db) {
            const close = promisify(this.db.close.bind(this.db));
            await close();
        }
    }
}
