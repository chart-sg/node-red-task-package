/** EDT Mode Node
 *  Provides dynamic on/off control for EDT flows with API integration
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

/** --- Type Definitions --- */
// @typedef {import('node-red')} RED

//#region ----- Module level variables ---- //

// Import EDT Mode database for integration
const edtModeDB = require('../lib/edt-mode-db');

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'edt-mode',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/**
 * Extract entity ID from message based on specified field
 * @param {object} msg - The Node-RED message object
 * @param {string} entityField - Field name to extract entity ID from
 * @returns {string} - Entity ID or 'default' if not found
 */
function resolveEntityId(msg, entityField) {
    if (!entityField || !msg) {
        return 'default'
    }
    
    // Support nested field access (e.g., 'payload.room_id')
    const fieldParts = entityField.split('.')
    let value = msg
    
    for (const part of fieldParts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part]
        } else {
            return 'default'
        }
    }
    
    // Convert to string and sanitize
    return String(value || 'default')
}

/**
 * Handle incoming messages and apply mode control
 * @param {object} msg - The Node-RED message object
 */
async function handleMessage(msg) {
    const node = this
    
    try {
        // Check if mode control message
        if (msg.topic && msg.topic.startsWith('edt-mode/')) {
            handleModeControl.call(this, msg)
            return
        }
        
        // Regular message - check if EDT is enabled
        // Get entity identifier for mode checking  
        const entityId = resolveEntityId(msg, node.entity_field) || 'default'
        
        // Check mode state via API (with fallback to global context)
        let currentMode
        try {
            currentMode = await edtModeDB.getModeState(node.mode_name, entityId, node.initial_state)
            
            // If this is the first time we see this entity, create database entry
            // Use a more robust check to avoid race conditions
            if (!currentMode.updated_by || currentMode.updated_by === 'system') {
                try {
                    await edtModeDB.setModeState(
                        node.mode_name,
                        entityId,
                        node.initial_state,
                        'auto-message',
                        `Auto-created for entity ${entityId} from message via node ${node.id}`
                    )
                    if (mod.debug) {
                        node.log(`📊 Created database entry for ${node.mode_name}:${entityId}`)
                    }
                } catch (dbError) {
                    // Ignore if another node already created the entry (race condition)
                    if (!dbError.message.includes('UNIQUE constraint')) {
                        throw dbError
                    } else {
                        if (mod.debug) {
                            node.log(`📊 Database entry already exists for ${node.mode_name}:${entityId} (race condition handled)`)
                        }
                        // Re-fetch the state that was created by the other node
                        currentMode = await edtModeDB.getModeState(node.mode_name, entityId, node.initial_state)
                    }
                }
            }
        } catch (error) {
            // Fallback to global context if API fails
            const globalContext = node.context().global
            const modeKey = `edt_mode_${node.mode_name}_${entityId}`
            currentMode = { enabled: globalContext.get(modeKey) !== false }
            
            if (mod.debug) {
                node.warn(`Database access failed, using global context fallback: ${error.message}`)
            }
        }
        
        // Default to enabled if not set
        const isEnabled = currentMode.enabled !== false
        
        if (!isEnabled) {
            // EDT is disabled, drop message
            node.status({
                fill: 'red', 
                shape: 'ring', 
                text: `Disabled: ${node.mode_name}`
            })
            
            if (mod.debug) {
                node.log(`Message dropped - EDT mode ${node.mode_name} is disabled`)
            }
            return
        }
        
        // EDT is enabled, pass message through
        const outputMsg = {
            ...msg,
            _edt_mode: {
                mode_name: node.mode_name,
                enabled: true,
                checked_at: new Date().toISOString()
            }
        }
        
        // Update status
        node.status({
            fill: 'green', 
            shape: 'dot', 
            text: `Enabled: ${node.mode_name}`
        })
        
        node.send(outputMsg)
        
        if (mod.debug) {
            node.log(`Message passed - EDT mode ${node.mode_name} is enabled`)
        }
        
    } catch (error) {
        node.error(`Error in mode control: ${error.message}`, msg)
        node.status({fill: 'red', shape: 'ring', text: 'Error'})
    }
}

/**
 * Handle mode control messages
 * @param {object} msg - The control message
 */
function handleModeControl(msg) {
    const node = this
    
    try {
        // Parse control message
        const [, , targetMode, action] = msg.topic.split('/')
        
        if (targetMode !== node.mode_name) {
            // Not for this mode instance
            return
        }
        
        const globalContext = node.context().global
        const modeKey = `edt_mode_${node.mode_name}`
        
        let newState = null
        
        switch (action) {
            case 'enable':
                newState = true
                break
            case 'disable':
                newState = false
                break
            case 'toggle':
                const currentState = globalContext.get(modeKey)
                newState = currentState === false ? true : false
                break
            case 'status':
                // Just return current status
                const currentStatus = globalContext.get(modeKey)
                const statusMsg = {
                    topic: `edt-mode/status/${node.mode_name}`,
                    payload: {
                        mode_name: node.mode_name,
                        enabled: currentStatus !== false,
                        last_updated: new Date().toISOString()
                    }
                }
                node.send([null, statusMsg])
                return
            default:
                node.warn(`Unknown mode action: ${action}`)
                return
        }
        
        if (newState !== null) {
            // Update mode state
            globalContext.set(modeKey, newState)
            
            // Update node status
            node.status({
                fill: newState ? 'green' : 'red',
                shape: newState ? 'dot' : 'ring',
                text: `${newState ? 'Enabled' : 'Disabled'}: ${node.mode_name}`
            })
            
            // Send status update
            const statusMsg = {
                topic: `edt-mode/status/${node.mode_name}`,
                payload: {
                    mode_name: node.mode_name,
                    enabled: newState,
                    action: action,
                    changed_at: new Date().toISOString()
                }
            }
            node.send([null, statusMsg])
            
            if (mod.debug) {
                node.log(`EDT mode ${node.mode_name} ${action}: ${newState}`)
            }
        }
        
    } catch (error) {
        node.error(`Error handling mode control: ${error.message}`, msg)
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
    this.name = config.name || 'EDT Mode'
    this.mode_name = config.mode_name || 'default'
    this.entity_field = config.entity_field || ''
    this.initial_state = config.initial_state !== false // Default to enabled
    
    // Check for potential conflicts with other EDT mode nodes
    this.checkForConflicts = () => {
        const RED = mod.RED
        const allNodes = RED.nodes.getFlows()
        
        let conflictingNodes = 0
        for (const flow of allNodes) {
            if (flow.nodes) {
                for (const otherNode of flow.nodes) {
                    if (otherNode.type === 'edt-mode' && 
                        otherNode.id !== this.id &&
                        otherNode.mode_name === this.mode_name &&
                        otherNode.entity_field === this.entity_field) {
                        conflictingNodes++
                    }
                }
            }
        }
        
        if (conflictingNodes > 0) {
            this.warn(`⚠️  Found ${conflictingNodes} other edt-mode node(s) with same scope "${this.mode_name}" and entity field "${this.entity_field}". This may cause conflicting behavior.`)
        }
    }
    
    // Run conflict check
    if (mod.debug) {
        this.checkForConflicts()
    }
    
    // Initialize mode state in global context AND database
    const globalContext = this.context().global
    const modeKey = `edt_mode_${this.mode_name}`
    
    // Only set initial state if not already set (preserve across deploys)
    if (globalContext.get(modeKey) === undefined) {
        globalContext.set(modeKey, this.initial_state)
        
        // Create database entry on deployment with 'default' entity if no entity_field specified
        if (!this.entity_field) {
            this.initializeDatabaseEntry()
        }
        
        if (mod.debug) {
            this.log(`📊 Initial state set for mode: ${this.mode_name} = ${this.initial_state}`)
        }
    }
    
    // Define database initialization method
    this.initializeDatabaseEntry = async () => {
        try {
            await edtModeDB.setModeState(
                this.mode_name,           // scope
                'default',                // entity_id
                this.initial_state,       // enabled
                'node-deployment',        // updated_by
                `Auto-created from ${this.mode_name} node deployment`  // reason
            )
            
            if (mod.debug) {
                this.log(`📊 Database entry created for mode: ${this.mode_name}`)
            }
        } catch (error) {
            this.error(`Failed to initialize database entry for ${this.mode_name}: ${error.message}`)
        }
    }
    
    // Set initial status based on current state
    const currentState = globalContext.get(modeKey)
    this.status({
        fill: currentState ? 'green' : 'red',
        shape: currentState ? 'dot' : 'ring',
        text: `${currentState ? 'Enabled' : 'Disabled'}: ${this.mode_name}`
    })
    
    // Handle incoming messages
    this.on('input', handleMessage.bind(this))
    
    if (mod.debug) {
        this.log(`edt-mode node initialized: ${this.mode_name} (${currentState ? 'enabled' : 'disabled'})`)
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log(`edt-mode node closing: ${this.mode_name}`)
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node
 * @param {RED} RED The Node-RED runtime object
 */
function EdtMode(RED) {
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
    EdtMode(RED)
}