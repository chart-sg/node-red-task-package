/** Task Package Data Get Node
 *  Retrieves task data using tpc_id as key
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
    nodeName: 'tp-data-get',
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
    this.name = config.name || 'tp-data-get'
    this.output_field = config.output_field || 'stored_data' // Where to put retrieved data
    this.fail_on_missing = config.fail_on_missing !== false // Default true
        
        // Set initial status
        this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
        
        // Handle incoming messages
        this.on('input', (msg, send, done) => {
            try {
                // Validate input message - must have tp_data.tpc_id
                if (!msg.tp_data || !msg.tp_data.tpc_id) {
                    if (this.fail_on_missing) {
                        this.error('Message must contain tp_data.tpc_id', msg)
                        this.status({fill: 'red', shape: 'ring', text: 'Missing tpc_id'})
                        if (done) done()
                        return
                    } else {
                        this.setOutputField(msg, null)
                        this.status({fill: 'grey', shape: 'ring', text: 'Missing tpc_id (ignored)'})
                        send(msg)
                        if (done) done()
                        return
                    }
                }
                
                const lookupKey = msg.tp_data.tpc_id
                
                // Get storage from global context
                const globalContext = this.context().global
                const storage = globalContext.get('tp_data_storage') || {}
                const entry = storage[lookupKey]
                
                // Check if entry exists
                if (!entry) {
                    if (this.fail_on_missing) {
                        this.warn(`No data found for key: ${lookupKey}`)
                        this.status({fill: 'yellow', shape: 'ring', text: 'Not found'})
                        if (done) done()
                        return
                    } else {
                        this.setOutputField(msg, null)
                        this.status({fill: 'grey', shape: 'ring', text: 'Not found (ignored)'})
                        send(msg)
                        if (done) done()
                        return
                    }
                }
                
                // Check if entry has expired
                const now = Date.now()
                if (entry.expires_at && entry.expires_at < now) {
                    // Remove expired entry
                    delete storage[lookupKey]
                    globalContext.set('tp_data_storage', storage)
                    
                    if (this.fail_on_missing) {
                        this.warn(`Data for key ${lookupKey} has expired`)
                        this.status({fill: 'yellow', shape: 'ring', text: 'Expired'})
                        if (done) done()
                        return
                    } else {
                        this.setOutputField(msg, null)
                        this.status({fill: 'grey', shape: 'ring', text: 'Expired (ignored)'})
                        send(msg)
                        if (done) done()
                        return
                    }
                }
                
                // Retrieve the data
                const retrievedData = {
                    data: entry.data,
                    metadata: entry.metadata,
                    stored_at: entry.stored_at,
                    retrieved_at: now
                }
                
                // Add to message
                this.setOutputField(msg, retrievedData)
                
                // Update status and send message
                this.status({fill: 'green', shape: 'dot', text: `Retrieved data`})
                
                // Send enhanced message
                send(msg)
                
                if (mod.debug) {
                    this.log(`Retrieved data for task: ${lookupKey}`)
                }
                
                if (done) done()
                
            } catch (error) {
                this.error(`Error retrieving data: ${error.message}`, msg)
                this.status({fill: 'red', shape: 'ring', text: 'Error'})
                if (done) done(error)
            }
        })
        
        // Helper to set output field using dot notation
        this.setOutputField = function(msg, value) {
            const fieldPath = this.output_field.split('.')
            let current = msg
            
            // Navigate to parent object
            for (let i = 0; i < fieldPath.length - 1; i++) {
                const field = fieldPath[i]
                if (!current[field] || typeof current[field] !== 'object') {
                    current[field] = {}
                }
                current = current[field]
            }
            
            // Set the final field
            current[fieldPath[fieldPath.length - 1]] = value
        }
        
        if (mod.debug) {
            this.log('tp-data-get node initialized')
        }

        /** Clean up on node removal/shutdown */
        this.on('close', (removed, done) => {
            if (mod.debug) {
                this.log('tp-data-get node closing')
            }
            done()
        })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpDataGet(RED) {
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
    TpDataGet(RED)
}
