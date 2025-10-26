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
const taskPackageEvents = require('../lib/task-package-events');

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
        
        // Check mode state via database (with fallback to global context)
        let currentMode
        try {
            currentMode = await edtModeDB.getModeState(node.mode_name, entityId, node.initial_state)
            
            // If this is the first time we see this entity, create database entry
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
                        node.log(`Created database entry for ${node.mode_name}:${entityId}`)
                    }
                } catch (dbError) {
                    // Ignore if another node already created the entry (race condition)
                    if (!dbError.message.includes('UNIQUE constraint')) {
                        throw dbError
                    } else {
                        if (mod.debug) {
                            node.log(`Database entry already exists for ${node.mode_name}:${entityId} (race condition handled)`)
                        }
                        // Re-fetch the state that was created by the other node
                        currentMode = await edtModeDB.getModeState(node.mode_name, entityId, node.initial_state)
                    }
                }
            }
        } catch (error) {
            // Fallback to global context if database fails
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
                text: `Disabled: ${entityId}`
            })
            
            if (mod.debug) {
                node.log(`Message dropped - EDT mode ${node.mode_name}:${entityId} is disabled`)
            }
            return
        }
        
        // EDT is enabled, pass message through
        const outputMsg = {
            ...msg,
            _edt_mode: {
                mode_name: node.mode_name,
                entity_id: entityId,
                entity_field: node.entity_field,
                enabled: true,
                checked_at: new Date().toISOString()
            }
        }
        
        // Update status
        node.status({
            fill: 'green', 
            shape: 'dot', 
            text: `Enabled: ${entityId}`
        })
        
        // Send to output 1 (enabled messages)
        node.send([outputMsg, null])
        
        if (mod.debug) {
            node.log(`Message passed - EDT mode ${node.mode_name}:${entityId} is enabled`)
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
async function handleModeControl(msg) {
    const node = this
    
    try {
        // Parse control message
        const [, , targetMode, action] = msg.topic.split('/')
        
        if (targetMode !== node.mode_name) {
            // Not for this mode instance
            return
        }
        
        // Extract entity ID from control message or use default
        const entityId = msg.entity_id || resolveEntityId(msg, node.entity_field) || 'default'
        const stateKey = `${node.mode_name}_${entityId}`
        
        // Get current state from database first
        let currentMode
        try {
            currentMode = await edtModeDB.getModeState(node.mode_name, entityId, node.initial_state)
        } catch (error) {
            // Fallback to global context
            const globalContext = node.context().global
            const modeKey = `edt_mode_${node.mode_name}_${entityId}`
            currentMode = { enabled: globalContext.get(modeKey) !== false }
        }
        
        let newState = null
        
        switch (action) {
            case 'enable':
                newState = true
                break
            case 'disable':
                newState = false
                break
            case 'toggle':
                newState = !currentMode.enabled
                break
            case 'status':
                // Just return current status
                const statusMsg = {
                    topic: `edt-mode/status/${node.mode_name}`,
                    payload: {
                        mode_name: node.mode_name,
                        entity_id: entityId,
                        entity_field: node.entity_field,
                        enabled: currentMode.enabled,
                        reason: currentMode.reason,
                        updated_by: currentMode.updated_by,
                        last_updated: currentMode.updated_at || new Date().toISOString()
                    }
                }
                node.send([null, statusMsg])
                return
            default:
                node.warn(`Unknown mode action: ${action}`)
                return
        }
        
        if (newState !== null) {
            // Update mode state in database
            try {
                await edtModeDB.setModeState(
                    node.mode_name,
                    entityId,
                    newState,
                    msg.updated_by || 'control-message',
                    msg.reason || `Control message: ${action}`
                )
            } catch (error) {
                // Fallback to global context
                const globalContext = node.context().global
                const modeKey = `edt_mode_${node.mode_name}_${entityId}`
                globalContext.set(modeKey, newState)
                
                if (mod.debug) {
                    node.warn(`Database update failed, using global context: ${error.message}`)
                }
            }
            
            // Update node status (show entity if not default)
            const statusText = entityId === 'default' ? 
                `${newState ? 'Enabled' : 'Disabled'}: ${node.mode_name}` :
                `${newState ? 'Enabled' : 'Disabled'}: ${entityId}`
                
            node.status({
                fill: newState ? 'green' : 'red',
                shape: newState ? 'dot' : 'ring',
                text: statusText
            })
            
            // Send status update to output 2
            const statusMsg = {
                topic: `edt-mode/status/${node.mode_name}`,
                payload: {
                    mode_name: node.mode_name,
                    entity_id: entityId,
                    entity_field: node.entity_field,
                    enabled: newState,
                    changed: true,
                    action: action,
                    reason: msg.reason || `Control message: ${action}`,
                    updated_by: msg.updated_by || 'control-message',
                    changed_at: new Date().toISOString()
                }
            }
            node.send([null, statusMsg])
            
            // Emit event for other EDT mode nodes with same scope
            taskPackageEvents.emit('edt-mode-change', {
                scope: node.mode_name,
                entity_id: entityId,
                enabled: newState,
                reason: msg.reason || `Control message: ${action}`,
                updated_by: msg.updated_by || 'control-message',
                changed_at: new Date().toISOString()
            })
            
            if (mod.debug) {
                node.log(`EDT mode ${node.mode_name}:${entityId} ${action}: → ${newState}`)
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
            this.warn(`Found ${conflictingNodes} other edt-mode node(s) with same scope "${this.mode_name}" and entity field "${this.entity_field}". This may cause conflicting behavior.`)
        }
    }
    
    // Run conflict check
    if (mod.debug) {
        this.checkForConflicts()
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
                this.log(`Database entry created for mode: ${this.mode_name}`)
            }
        } catch (error) {
            this.error(`Failed to initialize database entry for ${this.mode_name}: ${error.message}`)
        }
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
            this.log(`Initial state set for mode: ${this.mode_name} = ${this.initial_state}`)
        }
    }
    
    // Set initial status
    const currentState = globalContext.get(modeKey)
    this.status({
        fill: currentState ? 'green' : 'red',
        shape: currentState ? 'dot' : 'ring',
        text: `${currentState ? 'Enabled' : 'Disabled'}: ${this.mode_name}`
    })
    
    // Listen for EDT mode change events from API
    this.edtEventHandler = (eventData) => {
        // Check if this event is for our mode
        if (eventData.scope === this.mode_name) {
            // Send status update to output 2
            const statusMsg = {
                topic: `edt-mode/status/${this.mode_name}`,
                payload: {
                    mode_name: eventData.scope,
                    entity_id: eventData.entity_id,
                    entity_field: this.entity_field,
                    enabled: eventData.enabled,
                    changed: true,
                    reason: eventData.reason || 'API change',
                    updated_by: eventData.updated_by || 'api',
                    changed_at: new Date().toISOString()
                }
            }
            
            // Send to output 2 (status updates)
            this.send([null, statusMsg])
            
            // Update node status display
            const statusText = eventData.entity_id === 'default' ? 
                `${eventData.enabled ? 'Enabled' : 'Disabled'}: ${this.mode_name}` :
                `${eventData.enabled ? 'Enabled' : 'Disabled'}: ${eventData.entity_id}`
                
            this.status({
                fill: eventData.enabled ? 'green' : 'red',
                shape: eventData.enabled ? 'dot' : 'ring',
                text: statusText
            })
            
            if (mod.debug) {
                this.log(`📢 API change detected for ${eventData.entity_id}: ${eventData.enabled}`)
            }
        }
    }
    
    // Register event listener for EDT mode changes
    taskPackageEvents.on('edt-mode-change', this.edtEventHandler)
    
    // Handle incoming messages
    this.on('input', handleMessage.bind(this))
    
    if (mod.debug) {
        this.log(`edt-mode node initialized: ${this.mode_name} (${currentState ? 'enabled' : 'disabled'})`)
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        // Remove event listener
        if (this.edtEventHandler) {
            taskPackageEvents.off('edt-mode-change', this.edtEventHandler)
        }
        
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
        RED.log.info(`Registered node: ${mod.nodeName}`)
    }
}

// Export the module definition
module.exports = function(RED) {
    EdtMode(RED)
}