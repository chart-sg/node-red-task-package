/** EDT Filter Node
 *  Prevents spam events and duplicate messages based on time and value changes
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
    nodeName: 'edt-filter',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/**
 * Handle incoming messages and apply filtering logic
 * @param {object} msg - The Node-RED message object
 */
function handleMessage(msg) {
    const node = this
    
    try {
        // Get entity ID for tracking
        let entityId = null
        
        if (node.entity_id_field && node.entity_id_field !== '') {
            // Extract from specified message field
            const fieldPath = node.entity_id_field.split('.')
            let value = msg
            
            for (const field of fieldPath) {
                if (value && typeof value === 'object' && field in value) {
                    value = value[field]
                } else {
                    value = null
                    break
                }
            }
            entityId = value
        } else {
            // Default to msg.entity_id
            entityId = msg.entity_id
        }
        
        if (!entityId) {
            node.warn('No entity ID found in message')
            node.status({fill: 'yellow', shape: 'ring', text: 'No entity ID'})
            return
        }
        
        const now = Date.now()
        const filterKey = `${node.filter_name || 'default'}_${entityId}`
        
        // Get last message data for this entity
        const lastData = node._lastMessages[filterKey] || {}
        
        // Time-based filtering
        if (node.min_interval > 0) {
            const timeSinceLastMsg = now - (lastData.timestamp || 0)
            if (timeSinceLastMsg < node.min_interval * 1000) {
                // Too soon, drop message
                node.status({
                    fill: 'yellow', 
                    shape: 'ring', 
                    text: `Filtered: ${entityId} (time)`
                })
                
                if (mod.debug) {
                    node.log(`Time filter blocked message for ${entityId}: ${timeSinceLastMsg}ms < ${node.min_interval * 1000}ms`)
                }
                return
            }
        }
        
        // Value-based filtering
        if (node.filter_duplicates && node.filter_fields) {
            const fieldsToCheck = node.filter_fields.split(',').map(f => f.trim())
            let hasChanges = false
            
            for (const field of fieldsToCheck) {
                const fieldPath = field.split('.')
                let currentValue = msg
                let lastValue = lastData.values || {}
                
                // Extract current value
                for (const pathPart of fieldPath) {
                    if (currentValue && typeof currentValue === 'object' && pathPart in currentValue) {
                        currentValue = currentValue[pathPart]
                    } else {
                        currentValue = null
                        break
                    }
                }
                
                // Extract last value
                for (const pathPart of fieldPath) {
                    if (lastValue && typeof lastValue === 'object' && pathPart in lastValue) {
                        lastValue = lastValue[pathPart]
                    } else {
                        lastValue = null
                        break
                    }
                }
                
                // Compare values
                if (JSON.stringify(currentValue) !== JSON.stringify(lastValue)) {
                    hasChanges = true
                    break
                }
            }
            
            if (!hasChanges && lastData.timestamp) {
                // No changes detected, drop message
                node.status({
                    fill: 'yellow', 
                    shape: 'ring', 
                    text: `Filtered: ${entityId} (duplicate)`
                })
                
                if (mod.debug) {
                    node.log(`Duplicate filter blocked message for ${entityId}: no changes in tracked fields`)
                }
                return
            }
        }
        
        // Message passes filters, store for future comparisons
        const valuesToStore = {}
        if (node.filter_duplicates && node.filter_fields) {
            const fieldsToCheck = node.filter_fields.split(',').map(f => f.trim())
            
            for (const field of fieldsToCheck) {
                const fieldPath = field.split('.')
                let value = msg
                
                for (const pathPart of fieldPath) {
                    if (value && typeof value === 'object' && pathPart in value) {
                        value = value[pathPart]
                    } else {
                        value = null
                        break
                    }
                }
                
                if (value !== null) {
                    valuesToStore[field] = value
                }
            }
        }
        
        node._lastMessages[filterKey] = {
            timestamp: now,
            values: valuesToStore
        }
        
        // Add filter metadata to message
        const outputMsg = {
            ...msg,
            _filter: {
                entity_id: entityId,
                filter_name: node.filter_name || 'default',
                passed_at: new Date().toISOString(),
                time_since_last: lastData.timestamp ? now - lastData.timestamp : null
            }
        }
        
        // Update node status
        const trackedCount = Object.keys(node._lastMessages).length
        node.status({
            fill: 'green', 
            shape: 'dot', 
            text: `Passed: ${entityId} (${trackedCount} tracked)`
        })
        
        // Send message
        node.send(outputMsg)
        
        if (mod.debug) {
            node.log(`Message passed filter for entity ${entityId}`)
        }
        
    } catch (error) {
        node.error(`Error in filter: ${error.message}`, msg)
        node.status({fill: 'red', shape: 'ring', text: 'Error'})
    }
}

/** 
 * Run when an actual instance of our node is committed to a flow
 * @param {object} config The Node-RED config object
 */
function nodeInstance(config) {
    // Create the node instance
    const RED = mod.RED
    RED.nodes.createNode(this, config) 

    // Transfer config items from the Editor panel to the runtime
    this.name = config.name || 'EDT Filter'
    this.filter_name = config.filter_name || 'default'
    this.entity_id_field = config.entity_id_field || 'entity_id'
    this.min_interval = parseInt(config.min_interval) || 0
    this.filter_duplicates = config.filter_duplicates || false
    this.filter_fields = config.filter_fields || ''
    
    // Internal storage for last messages per entity
    this._lastMessages = {}
    
    // Set initial status
    this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
    
    // Handle incoming messages
    this.on('input', handleMessage.bind(this))
    
    if (mod.debug) {
        this.log(`edt-filter node initialized: ${this.filter_name}`)
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        // Clear message cache
        this._lastMessages = {}
        
        if (mod.debug) {
            this.log(`edt-filter node closing: ${this.filter_name}`)
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node
 * @param {RED} RED The Node-RED runtime object
 */
function EdtFilter(RED) {
    // Save a reference to the RED runtime for convenience
    mod.RED = RED
    
    // Register the node type
    RED.nodes.registerType(mod.nodeName, nodeInstance)
    
    if (mod.debug) {
        RED.log.info(`✅ Registered node: ${mod.nodeName}`)
    }
}

// Export the module definition
module.exports = function(RED) {
    EdtFilter(RED)
}