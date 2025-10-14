/** EDT State Node
 *  Manages entity state in global context with spam prevention
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
    nodeName: 'edt-state',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/**
 * Handle incoming messages and manage entity state
 * @param {object} msg - The Node-RED message object
 */
function handleMessage(msg) {
    const node = this
    
    try {
        // Get entity ID from configured field or msg.entity_id
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
        
        // Get global context for persistent storage
        const globalContext = node.context().global
        const stateKey = `edt_state_${node.state_name || 'default'}`
        const entityStates = globalContext.get(stateKey) || {}
        
        // Get current state for this entity
        const currentState = entityStates[entityId] || {}
        
        // Extract state data from message
        let newStateData = {}
        
        if (node.state_fields && node.state_fields.trim() !== '') {
            // Extract specific fields
            const fields = node.state_fields.split(',').map(f => f.trim())
            
            for (const field of fields) {
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
                    newStateData[field] = value
                }
            }
        } else {
            // Store entire payload as state
            newStateData = msg.payload || {}
        }
        
        // Compare only the actual state data (exclude metadata)
        const previousStateData = { ...currentState }
        delete previousStateData.last_updated
        delete previousStateData.update_count
        delete previousStateData.last_state_change  // ← Add this back!
        
        // Check if actual state data changed
        const actualStateChanged = JSON.stringify(previousStateData) !== JSON.stringify(newStateData)
        
        // Update state with timestamp (keep last_state_change separate)
        const now = new Date().toISOString()
        const lastStateChange = actualStateChanged ? now : (currentState.last_state_change || now)
        
        const updatedState = {
            ...currentState,
            ...newStateData,
            last_updated: now,
            update_count: (currentState.update_count || 0) + 1,
            last_state_change: lastStateChange  // ← Store it for next comparison
        }
        
        // Store updated state
        entityStates[entityId] = updatedState
        globalContext.set(stateKey, entityStates)
        
        // Create output message with state information
        const outputMsg = {
            ...msg,
            entity_id: entityId,
            entity_state: { ...updatedState },
            previous_state: { ...currentState },
            state_changed: actualStateChanged,
            last_state_change: lastStateChange,  // ← At msg level
            state_name: node.state_name || 'default'
        }
        
        // Remove last_state_change from the state objects to keep them clean
        delete outputMsg.entity_state.last_state_change
        delete outputMsg.previous_state.last_state_change
        
        // Update node status
        const entityCount = Object.keys(entityStates).length
        node.status({
            fill: 'green', 
            shape: 'dot', 
            text: `${entityCount} entities tracked`
        })
        
        // Send message
        node.send(outputMsg)
        
        if (mod.debug) {
            node.log(`State updated for entity ${entityId}: ${JSON.stringify(newStateData)}`)
        }
        
    } catch (error) {
        node.error(`Error managing state: ${error.message}`, msg)
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
    this.name = config.name || 'EDT State'
    this.state_name = config.state_name || 'default'
    this.entity_id_field = config.entity_id_field || 'entity_id'
    this.state_fields = config.state_fields || ''
    
    // Set initial status
    this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
    
    // Handle incoming messages
    this.on('input', handleMessage.bind(this))
    
    if (mod.debug) {
        this.log(`edt-state node initialized: ${this.state_name}`)
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log(`edt-state node closing: ${this.state_name}`)
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node
 * @param {RED} RED The Node-RED runtime object
 */
function EdtState(RED) {
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
    EdtState(RED)
}