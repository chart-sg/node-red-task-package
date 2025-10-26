/** Task Package Data Set Node
 *  Stores task data using tpc_id as key with automatic TTL management
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

/** --- Type Definitions --- */
// @typedef {import('node-red')} RED

//#region ----- Module level variables ---- //

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-data-set',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/** 
 * Run when an actual instance of our node is committed to a flow
 * @param {object} config The Node-RED config object
 */
function nodeInstance(config) {
    // As a module-level named function, it will inherit `mod` and other module-level variables
    
    // If you need it - which you will here - or just use mod.RED if you prefer:
    const RED = mod.RED

    // Create the node instance - `this` can only be referenced AFTER here
    RED.nodes.createNode(this, config) 

    // Transfer config items from the Editor panel to the runtime
    this.name = config.name || 'tp-data-set'
    
    // Set initial status
    this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
    
    // Handle incoming messages
    this.on('input', async (msg, send, done) => {
        try {
            // Validate input message
            if (!msg.tp_data || !msg.tp_data.tpc_id) {
                this.error('Message must contain tp_data.tpc_id', msg)
                this.status({fill: 'red', shape: 'ring', text: 'Missing tpc_id'})
                if (done) done()
                return
            }
            
            const tpc_id = msg.tp_data.tpc_id
            
            // Get current storage from global context
            const globalContext = this.context().global
            let storage = globalContext.get('tp_data_storage') || {}
            
            // Cleanup expired entries
            this.cleanupExpiredEntries(storage)
            
            // Store the data with tpc_id as key
            const now = Date.now()
            const oneHour = 60 * 60 * 1000 // 1 hour in milliseconds
            
            storage[tpc_id] = {
                data: msg.payload,
                metadata: {
                    tp_id: msg.tp_data.tp_id,
                    tp_name: msg.tp_data.tp_name,
                    user: msg.tp_data.user,
                    status: msg.tp_data.status,
                    created_at: msg.tp_data.created_at
                },
                stored_at: now,
                expires_at: now + oneHour // Default 1 hour TTL
            }
            
            // If task is completed or cancelled, extend TTL to 1 hour from completion
            if (msg.tp_data.status === 'completed' || msg.tp_data.status === 'cancelled') {
                storage[tpc_id].expires_at = now + oneHour
            }
            
            // Save back to global context
            globalContext.set('tp_data_storage', storage)
            
            // Update status
            const storageSize = Object.keys(storage).length
            this.status({fill: 'green', shape: 'dot', text: `Stored (${storageSize} total)`})
            
            // Pass message through
            send(msg)
            
            if (mod.debug) {
                this.log(`Stored data for task: ${tpc_id}`)
            }
            
            if (done) done()
            
        } catch (error) {
            this.error(`Error storing data: ${error.message}`, msg)
            this.status({fill: 'red', shape: 'ring', text: 'Error'})
            if (done) done(error)
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
        
        if (keysToDelete.length > 0 && mod.debug) {
            this.log(`Cleaned up ${keysToDelete.length} expired entries`)
        }
    }
    
    // Periodic cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
        const globalContext = this.context().global
        let storage = globalContext.get('tp_data_storage') || {}
        this.cleanupExpiredEntries(storage)
        globalContext.set('tp_data_storage', storage)
    }, 300000) // 5 minutes
    
    if (mod.debug) {
        this.log('tp-data-set node initialized')
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
        }
        
        if (mod.debug) {
            this.log('tp-data-set node closing')
        }
        
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpDataSet(RED) {
    // Save a reference to the RED runtime for convenience
    mod.RED = RED
    
    // Register the node type
    RED.nodes.registerType(mod.nodeName, nodeInstance)
    
    if (mod.debug) {
        RED.log.info(`Registered node: ${mod.nodeName}`)
    }
}

// Export the module definition, this is consumed by Node-RED on startup.
module.exports = function(RED) {
    TpDataSet(RED)
}