import path from 'path';
import fs from 'fs-extra';
import Database from 'better-sqlite3';

/**
 * CredentialsResolver
 * - Reads credentials (email/password) associated with a profile from the existing SQLite databases:
 *   - ./profiles/profiles.db (profiles + sessions)
 *   - ./profiles/data/generated_names.db (user_data_exports with email/password)
 * - Matching strategy:
 *   1) Resolve profile by name/id in profiles.db
 *   2) Collect recent session ids for that profile (most recent first)
 *   3) Lookup user_data_exports rows in generated_names.db with matching session_ids
 *      - Prefer rows whose site_url/hook_name indicates VidIQ
 *      - Fallback to any row with email/password for those sessions
 */
export class CredentialsResolver {
  /**
   * @param {string} baseDir - Profiles base directory (default: ./profiles)
   */
  constructor(baseDir = './profiles') {
    this.baseDir = path.resolve(baseDir);
    this.profilesDbPath = path.join(this.baseDir, 'profiles.db');
    this.generatedDbPath = path.join(this.baseDir, 'data', 'generated_names.db');

    this._profilesDb = null;
    this._generatedDb = null;
  }

  _openProfilesDb() {
    if (!this._profilesDb) {
      this._profilesDb = new Database(this.profilesDbPath, { readonly: true, fileMustExist: true });
    }
    return this._profilesDb;
  }

  _openGeneratedDb() {
    if (!this._generatedDb) {
      this._generatedDb = new Database(this.generatedDbPath, { readonly: true, fileMustExist: true });
    }
    return this._generatedDb;
  }

  close() {
    try { if (this._profilesDb) this._profilesDb.close(); } catch (_) {}
    try { if (this._generatedDb) this._generatedDb.close(); } catch (_) {}
    this._profilesDb = null;
    this._generatedDb = null;
  }

  /**
   * Resolve profile basic info by id or name
   * @param {string} nameOrId
   * @returns {{id:string, name:string, user_data_dir:string}|null}
   */
  getProfileByNameOrId(nameOrId) {
    try {
      const db = this._openProfilesDb();
      const rowById = db.prepare('SELECT id, name, user_data_dir FROM profiles WHERE id = ?').get(nameOrId);
      if (rowById) return rowById;
      const rowByName = db.prepare('SELECT id, name, user_data_dir FROM profiles WHERE name = ?').get(nameOrId);
      if (rowByName) return rowByName;
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Get recent session ids for a profile
   * @param {string} profileId
   * @param {number} limit
   * @returns {string[]}
   */
  getRecentSessionIds(profileId, limit = 50) {
    try {
      const db = this._openProfilesDb();
      const rows = db.prepare(
        'SELECT id FROM sessions WHERE profile_id = ? ORDER BY start_time DESC LIMIT ?'
      ).all(profileId, limit);
      return rows.map(r => r.id);
    } catch (_) {
      return [];
    }
  }

  /**
   * Lookup credentials in generated_names.db for given session ids
   * @param {string[]} sessionIds
   * @returns {{email:string, password:string}|null}
   */
  getCredentialsBySessions(sessionIds) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) return null;
    // Ensure DB exists
    if (!fs.existsSync(this.generatedDbPath)) return null;

    try {
      const gdb = this._openGeneratedDb();

      // Build session-id placeholders
      const placeholders = sessionIds.map(() => '?').join(',');
      const baseQuery = `
        SELECT email, password, site_url, hook_name, created_at
        FROM user_data_exports
        WHERE session_id IN (${placeholders})
          AND email IS NOT NULL AND email != ''
          AND password IS NOT NULL AND password != ''
        ORDER BY datetime(created_at) DESC
      `;

      const all = gdb.prepare(baseQuery).all(...sessionIds);
      if (!all || all.length === 0) return null;

      // Prefer VidIQ-related rows
      const prefer = all.find(r => {
        const u = (r.site_url || '').toLowerCase();
        const h = (r.hook_name || '').toLowerCase();
        return u.includes('vidiq') || h.includes('vidiq');
      });

      const row = prefer || all[0];
      return { email: row.email, password: row.password };
    } catch (_) {
      return null;
    }
  }

  /**
   * High-level helper
   * @param {string} nameOrId
   * @returns {Promise<{email:string, password:string}|null>}
   */
  async getCredentialsForProfile(nameOrId) {
    try {
      const profile = this.getProfileByNameOrId(nameOrId);
      if (!profile) return null;

      const sessionIds = this.getRecentSessionIds(profile.id, 100);
      if (sessionIds.length === 0) return null;

      const creds = this.getCredentialsBySessions(sessionIds);
      return creds || null;
    } catch (_) {
      return null;
    }
  }
}

export default CredentialsResolver;