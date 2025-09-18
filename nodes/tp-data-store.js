/**
 * Task Package Data Store Node
 * Stores task data in global context with TTL for memory management
 */

module.exports = function(RED) {
    'use strict'

    function TpDataStoreNode(config) {
        RED.nodes.createNode(this, config)
        
        this.name = config.name || 'tp-data-store'
        this.ttl = parseInt(config.ttl) || 3600000 // Default 1 hour in milliseconds
        this.key_field = config.key_field || 'tp_data.tpc_id' // Field to use as storage key
        this.auto_cleanup = config.auto_cleanup !== false // Default true
        
        // Set initial status
        this.status({fill: 'blue', shape: 'ring', text: `Ready (TTL: ${this.ttl/1000}s)`})
        
        // Handle incoming messages
        this.on('input', (msg) => {
            try {
                // Extract storage key from message
                const keyPath = this.key_field.split('.')
                let storageKey = msg
                
                for (const path of keyPath) {
                    if (storageKey && typeof storageKey === 'object' && storageKey[path]) {
                        storageKey = storageKey[path]
                    } else {
                        this.warn(`Storage key not found at path: ${this.key_field}`)
                        this.status({fill: 'yellow', shape: 'ring', text: 'Key not found'})
                        return
                    }
                }
                
                if (!storageKey || typeof storageKey !== 'string') {
                    this.warn('Invalid storage key - must be a non-empty string')
                    this.status({fill: 'red', shape: 'ring', text: 'Invalid key'})
                    return
                }
                
                // Get current storage
                let storage = RED.settings.functionGlobalContext.tp_data_storage || {}
                
                // Cleanup expired entries if auto_cleanup is enabled
                if (this.auto_cleanup) {
                    this.cleanupExpiredEntries(storage)
                }
                
                // Store the data
                const now = Date.now()
                storage[storageKey] = {
                    data: msg.payload,
                    metadata: {
                        tp_id: msg.tp_data?.tp_id,
                        user: msg.tp_data?.user,
                        created_at: msg.tp_data?.created_at
                    },
                    stored_at: now,
                    expires_at: now + this.ttl
                }
                
                // Save back to global context
                RED.settings.functionGlobalContext.tp_data_storage = storage
                
                // Update status
                const storageSize = Object.keys(storage).length
                this.status({fill: 'green', shape: 'dot', text: `Stored ${storageKey} (${storageSize} total)`})
                
                // Pass message through
                this.send(msg)
                
            } catch (error) {
                this.error(`Error storing data: ${error.message}`, msg)
                this.status({fill: 'red', shape: 'ring', text: 'Error'})
            }
        })
        
        // Cleanup expired entries
        this.cleanupExpiredEntries = function(storage) {
            const now = Date.now()
            const keysToDelete = []
            
            for (const [key, entry] of Object.entries(storage)) {
                if (entry.expires_at && entry.expires_at < now) {
                    keysToDelete.push(key)
                }
            }
            
            keysToDelete.forEach(key => {
                delete storage[key]
            })
            
            if (keysToDelete.length > 0) {
                this.debug(`Cleaned up ${keysToDelete.length} expired entries`)
            }
        }
        
        // Periodic cleanup every 5 minutes if auto_cleanup is enabled
        if (this.auto_cleanup) {
            this.cleanupInterval = setInterval(() => {
                const storage = RED.settings.functionGlobalContext.tp_data_storage || {}
                this.cleanupExpiredEntries(storage)
                RED.settings.functionGlobalContext.tp_data_storage = storage
            }, 300000) // 5 minutes
        }
        
        // Cleanup on node close
        this.on('close', () => {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval)
            }
        })
    }

    RED.nodes.registerType('tp-data-store', TpDataStoreNode)
}
