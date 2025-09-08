import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

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
            importFrom = null
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
            
            return {
                id: profileId,
                name,
                description,
                browserType,
                userDataDir,
                importedFrom: importFrom
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
        
        return {
            id: profile.id,
            name: profile.name,
            description: profile.description,
            browserType: profile.browser_type,
            userDataDir: profile.user_data_dir,
            createdAt: profile.created_at,
            lastUsed: profile.last_used,
            sessionCount: profile.session_count,
            importedFrom: profile.imported_from
        };
    }

    async deleteProfile(nameOrId) {
        await this.initPromise;
        const profile = await this.getProfile(nameOrId);
        const run = promisify(this.db.run.bind(this.db));
        
        // Remove user data directory
        await fs.remove(profile.userDataDir);
        
        // Remove from database
        await run('DELETE FROM profiles WHERE id = ?', [profile.id]);
        
        return profile;
    }

    async cloneProfile(sourceNameOrId, newName, description = '') {
        const sourceProfile = await this.getProfile(sourceNameOrId);
        const clonedProfile = await this.createProfile(newName, {
            description: description || `Clone of ${sourceProfile.name}`,
            browserType: sourceProfile.browserType
        });
        
        // Copy user data directory
        await fs.copy(sourceProfile.userDataDir, clonedProfile.userDataDir);
        
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

    async close() {
        if (this.db) {
            const close = promisify(this.db.close.bind(this.db));
            await close();
        }
    }
}
