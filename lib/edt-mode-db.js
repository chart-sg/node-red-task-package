/**
 * EDT Mode Database - SQLite database for EDT mode persistence
 * Following Task Package DB patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class EdtModeDB {
    constructor() {
        this.db = null;
        this.dbPath = null;
        this.isInitialized = false;
    }

    /**
     * Initialize database connection and create tables
     * @param {string} dbPath - Path to SQLite database file
     */
    async init(dbPath = '/tmp/sqlite') {
        return new Promise((resolve, reject) => {
            try {
                this.dbPath = dbPath;
                
                // Ensure directory exists
                const dir = path.dirname(dbPath);
                require('fs').mkdirSync(dir, { recursive: true });
                
                this.db = new sqlite3.Database(dbPath, (err) => {
                    if (err) {
                        console.error('EDT Mode database connection failed:', err.message);
                        reject(err);
                    } else {
                        console.log(`EDT Mode connected to SQLite database: ${dbPath}`);
                        this.createTables()
                            .then(() => {
                                this.isInitialized = true;
                                resolve(this);
                            })
                            .catch(reject);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Create database tables if they don't exist
     */
    async createTables() {
        const createEdtModesTable = `
            CREATE TABLE IF NOT EXISTS edt_modes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                reason TEXT,
                updated_by TEXT DEFAULT 'system',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(scope, entity_id)
            )
        `;

        const createEdtModeHistoryTable = `
            CREATE TABLE IF NOT EXISTS edt_mode_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                action TEXT NOT NULL,
                enabled BOOLEAN NOT NULL,
                reason TEXT,
                updated_by TEXT DEFAULT 'system',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(createEdtModesTable, (err) => {
                    if (err) {
                        console.error('Error creating edt_modes table:', err.message);
                        reject(err);
                        return;
                    }
                });

                this.db.run(createEdtModeHistoryTable, (err) => {
                    if (err) {
                        console.error('Error creating edt_mode_history table:', err.message);
                        reject(err);
                        return;
                    }
                });

                console.log('EDT Mode database tables ready');
                resolve();
            });
        });
    }

    /**
     * Get mode state for a specific entity
     * @param {string} scope - Mode scope (e.g., 'bed_exit_monitoring')
     * @param {string} entityId - Entity identifier (e.g., 'CHART_Ward-Bed1')
     * @param {boolean} defaultState - Default state if not found
     */
    async getModeState(scope, entityId, defaultState = true) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT enabled, reason, updated_by, updated_at
                FROM edt_modes 
                WHERE scope = ? AND entity_id = ?
            `;

            this.db.get(query, [scope, entityId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    resolve({
                        enabled: Boolean(row.enabled),
                        reason: row.reason,
                        updated_by: row.updated_by,
                        updated_at: row.updated_at
                    });
                } else {
                    // Not found, return default
                    resolve({
                        enabled: defaultState,
                        reason: 'Default state',
                        updated_by: 'system',
                        updated_at: new Date().toISOString()
                    });
                }
            });
        });
    }

    /**
     * Set mode state for a specific entity
     * @param {string} scope - Mode scope
     * @param {string} entityId - Entity identifier
     * @param {boolean} enabled - Whether mode is enabled
     * @param {string} updatedBy - Who updated the mode
     * @param {string} reason - Reason for the change
     */
    async setModeState(scope, entityId, enabled, updatedBy = 'system', reason = null) {
        return new Promise((resolve, reject) => {
            const upsertQuery = `
                INSERT INTO edt_modes (scope, entity_id, enabled, reason, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(scope, entity_id) 
                DO UPDATE SET 
                    enabled = excluded.enabled,
                    reason = excluded.reason,
                    updated_by = excluded.updated_by,
                    updated_at = CURRENT_TIMESTAMP
            `;

            const historyQuery = `
                INSERT INTO edt_mode_history (scope, entity_id, action, enabled, reason, updated_by)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            this.db.serialize(() => {
                // Update current state
                this.db.run(upsertQuery, [scope, entityId, enabled, reason, updatedBy], (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Record history using the correct database reference
                    const action = enabled ? 'enable' : 'disable';
                    this.db.run(historyQuery, [scope, entityId, action, enabled, reason, updatedBy], (err) => {
                        if (err) {
                            console.warn('Failed to record EDT mode history:', err.message);
                        }
                    });

                    resolve({
                        scope,
                        entity_id: entityId,
                        enabled,
                        updated_by: updatedBy,
                        reason,
                        updated_at: new Date().toISOString()
                    });
                });
            });
        });
    }

    /**
     * Get all mode states for a specific scope
     * @param {string} scope - Mode scope
     */
    async getScopeStates(scope) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT entity_id, enabled, reason, updated_by, updated_at
                FROM edt_modes 
                WHERE scope = ?
                ORDER BY entity_id
            `;

            this.db.all(query, [scope], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const states = {};
                    rows.forEach(row => {
                        states[row.entity_id] = {
                            enabled: Boolean(row.enabled),
                            reason: row.reason,
                            updated_by: row.updated_by,
                            updated_at: row.updated_at
                        };
                    });
                    resolve(states);
                }
            });
        });
    }

    /**
     * Get all mode states across all scopes
     */
    async getAllStates() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT scope, entity_id, enabled, reason, updated_by, updated_at
                FROM edt_modes 
                ORDER BY scope, entity_id
            `;

            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const allStates = {};
                    rows.forEach(row => {
                        if (!allStates[row.scope]) {
                            allStates[row.scope] = {};
                        }
                        allStates[row.scope][row.entity_id] = {
                            enabled: Boolean(row.enabled),
                            reason: row.reason,
                            updated_by: row.updated_by,
                            updated_at: row.updated_at
                        };
                    });
                    resolve(allStates);
                }
            });
        });
    }

    /**
     * Clear all entities in a scope
     * @param {string} scope - Mode scope to clear
     * @param {string} updatedBy - Who cleared the scope
     */
    async clearScope(scope, updatedBy = 'system') {
        return new Promise((resolve, reject) => {
            const deleteQuery = `DELETE FROM edt_modes WHERE scope = ?`;
            const historyQuery = `
                INSERT INTO edt_mode_history (scope, entity_id, action, enabled, reason, updated_by)
                VALUES (?, 'ALL', 'clear_scope', 0, 'Scope cleared', ?)
            `;

            this.db.serialize(() => {
                this.db.run(deleteQuery, [scope], (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const deletedCount = this.changes;

                    // Record history using correct database reference
                    this.db.run(historyQuery, [scope, updatedBy], (err) => {
                        if (err) {
                            console.warn('Failed to record scope clear history:', err.message);
                        }
                    });

                    resolve({ scope, entities_cleared: deletedCount });
                });
            });
        });
    }

    /**
     * Get mode change history for debugging
     * @param {string} scope - Optional scope filter
     * @param {string} entityId - Optional entity filter
     * @param {number} limit - Limit number of results
     */
    async getHistory(scope = null, entityId = null, limit = 100) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT scope, entity_id, action, enabled, reason, updated_by, timestamp
                FROM edt_mode_history
            `;
            const params = [];

            if (scope) {
                query += ` WHERE scope = ?`;
                params.push(scope);
                
                if (entityId) {
                    query += ` AND entity_id = ?`;
                    params.push(entityId);
                }
            }

            query += ` ORDER BY timestamp DESC LIMIT ?`;
            params.push(limit);

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing EDT Mode database:', err.message);
                } else {
                    console.log('EDT Mode database connection closed');
                }
            });
        }
    }
}

// Export singleton instance
module.exports = new EdtModeDB();