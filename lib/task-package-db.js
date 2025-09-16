/** Task Package Database Integration
 *  SQLite database for task package persistence
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

const sqlite3 = require('sqlite3').verbose()
const path = require('path')

/** Database Manager Class */
class TaskPackageDB {
    constructor() {
        this.db = null
        this.dbPath = null
        this.isInitialized = false
    }
    
    /** Initialize database with given path */
    async init(dbPath = '/tmp/task-package.db') {
        return new Promise((resolve, reject) => {
            try {
                this.dbPath = dbPath
                
                // Ensure directory exists
                const dir = path.dirname(dbPath)
                require('fs').mkdirSync(dir, { recursive: true })
                
                this.db = new sqlite3.Database(dbPath, (err) => {
                    if (err) {
                        console.error('❌ Database connection failed:', err.message)
                        reject(err)
                    } else {
                        console.log(`📊 Connected to SQLite database: ${dbPath}`)
                        this.createTables().then(() => {
                            this.isInitialized = true
                            resolve()
                        }).catch(reject)
                    }
                })
            } catch (error) {
                reject(error)
            }
        })
    }
    
    /** Create database tables */
    async createTables() {
        return new Promise((resolve, reject) => {
            const createTaskPackages = `
                CREATE TABLE IF NOT EXISTS task_packages (
                    id TEXT PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    form_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `
            
            const createTaskPackagesCreated = `
                CREATE TABLE IF NOT EXISTS task_packages_created (
                    id TEXT PRIMARY KEY NOT NULL,
                    tp_id TEXT NOT NULL,
                    tp_name TEXT NOT NULL,
                    user TEXT,
                    user_status TEXT,
                    status TEXT NOT NULL DEFAULT 'created',
                    payload TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(tp_id) REFERENCES task_packages(id)
                )
            `
            
            this.db.serialize(() => {
                this.db.run(createTaskPackages, (err) => {
                    if (err) {
                        console.error('❌ Error creating task_packages table:', err.message)
                        reject(err)
                        return
                    }
                })
                
                this.db.run(createTaskPackagesCreated, (err) => {
                    if (err) {
                        console.error('❌ Error creating task_packages_created table:', err.message)
                        reject(err)
                        return
                    }
                    
                    console.log('✅ Database tables created/verified')
                    resolve()
                })
            })
        })
    }
    
    /** Register/update a task package definition */
    async upsertTaskPackage(tp_id, tp_name, tp_form_url) {
        if (!this.isInitialized) {
            throw new Error('Database not initialized')
        }
        
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO task_packages (id, name, form_url)
                VALUES (?, ?, ?)
            `
            
            this.db.run(sql, [tp_id, tp_name, tp_form_url], function(err) {
                if (err) {
                    reject(err)
                } else {
                    console.log(`📝 Task package registered: ${tp_id}`)
                    resolve(this.changes)
                }
            })
        })
    }
    
    /** Create a task package instance */
    async createTaskPackageInstance(tpc_id, tp_id, tp_name, user) {
        if (!this.isInitialized) {
            throw new Error('Database not initialized')
        }
        
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO task_packages_created (id, tp_id, tp_name, user, status)
                VALUES (?, ?, ?, ?, 'created')
            `
            
            this.db.run(sql, [tpc_id, tp_id, tp_name, user], function(err) {
                if (err) {
                    reject(err)
                } else {
                    console.log(`📝 Task instance created: ${tpc_id}`)
                    resolve(this.changes)
                }
            })
        })
    }
    
    /** Update task package instance status */
    async updateTaskStatus(tpc_id, status, user_status = null) {
        if (!this.isInitialized) {
            throw new Error('Database not initialized')
        }
        
        return new Promise((resolve, reject) => {
            let sql, params
            
            if (user_status !== null) {
                sql = `
                    UPDATE task_packages_created 
                    SET status = ?, user_status = ?, updated_at = datetime('now')
                    WHERE id = ?
                `
                params = [status, user_status, tpc_id]
            } else {
                sql = `
                    UPDATE task_packages_created 
                    SET status = ?, updated_at = datetime('now')
                    WHERE id = ?
                `
                params = [status, tpc_id]
            }
            
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err)
                } else {
                    console.log(`📝 Task status updated: ${tpc_id} -> ${status}`)
                    resolve(this.changes)
                }
            })
        })
    }
    
    /** Get all task packages */
    async getTaskPackages() {
        if (!this.isInitialized) {
            throw new Error('Database not initialized')
        }
        
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM task_packages ORDER BY name'
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(rows)
                }
            })
        })
    }
    
    /** Get a specific task package by ID */
    async getTaskPackage(tp_id) {
        if (!this.isInitialized) {
            throw new Error('Database not initialized')
        }
        
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM task_packages WHERE id = ?'
            
            this.db.get(sql, [tp_id], (err, row) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(row)
                }
            })
        })
    }
    
    /** Get task package instance by tpc_id */
    async getTaskPackageInstance(tpc_id) {
        if (!this.isInitialized) {
            throw new Error('Database not initialized')
        }
        
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM task_packages_created WHERE id = ?'
            
            this.db.get(sql, [tpc_id], (err, row) => {
                if (err) {
                    reject(err)
                } else {
                    if (row && row.payload) {
                        try {
                            row.payload = JSON.parse(row.payload)
                        } catch (e) {
                            // Keep as string if parse fails
                        }
                    }
                    resolve(row)
                }
            })
        })
    }

    /** Get all task package instances */
    async getTaskPackageInstances() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'))
                return
            }
            
            this.db.all(`
                SELECT * FROM task_packages_created 
                ORDER BY created_at DESC
            `, (err, rows) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(rows || [])
                }
            })
        })
    }
    
    /** Close database connection */
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err.message)
                    } else {
                        console.log('📊 Database connection closed')
                    }
                    this.isInitialized = false
                    resolve()
                })
            })
        }
    }
}

// Export singleton instance
module.exports = new TaskPackageDB()
