/** Task Package Update Node
 *  Handles update events for task packages and can trigger update flows
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

/** --- Type Definitions --- */
// @typedef {import('node-red')} RED

//#region ----- Module level variables ---- //

const tpEvents = require('../lib/task-package-events')

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-update',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/** 
 * Handle incoming update events for this task package
 * @param {object} payload - The event payload from API layer
 */
async function handleUpdateEvent(payload) {
    // `this` context is the node instance
    const node = this
    
    try {
        const tpc_id = payload.tpc_id
        const tp_id = payload.tp_id || this.tp_id
        
        // Get current task context from flow
        const flow = node.context().flow
        const active_tasks = flow.get('active_tasks') || []
        
        // Find this specific task if tpc_id provided, or any task with matching tp_id
        let task = null
        if (tpc_id) {
            task = active_tasks.find(t => t.tpc_id === tpc_id)
        } else if (tp_id) {
            task = active_tasks.find(t => t.tp_id === tp_id)
        }
        
        if (!task && this.tp_id) {
            // Check legacy flow context for backward compatibility
            const current_tpc_id = flow.get('current_tpc_id')
            const current_tp_id = flow.get('current_tp_id')
            
            if ((current_tpc_id === tpc_id) || (current_tp_id === this.tp_id)) {
                task = {
                    tpc_id: current_tpc_id,
                    tp_id: current_tp_id,
                    tp_name: flow.get('current_tp_name')
                }
            }
        }
        
        if (!task) {
            node.warn(`No active task found for update. tpc_id: ${tpc_id}, tp_id: ${tp_id}`)
            node.status({fill: 'orange', shape: 'ring', text: 'No active task'})
            return
        }
        
        // Update the database with new information if provided
        if (payload.update_data) {
            try {
                const taskPackageDB = require('../lib/task-package-db')
                await taskPackageDB.updateTaskData(task.tpc_id, payload.update_data)
                
                if (mod.debug) {
                    node.log(`Updated task data for: ${task.tpc_id}`)
                }
            } catch (dbError) {
                node.warn(`Failed to update database: ${dbError.message}`)
            }
        }
        
        // Create output message
        const msg = {
            tp_data: {
                tpc_id: task.tpc_id,
                tp_id: task.tp_id,
                tp_name: task.tp_name,
                status: 'ongoing', // Assume ongoing for updates
                updated_at: new Date().toISOString(),
                update_data: payload.update_data || {},
                update_source: 'api'
            },
            payload: payload.update_data || {},
            topic: `task-package/${task.tp_id}/updated`,
            _tpOriginator: node.id
        }
        
        // Set node status
        node.status({fill: 'blue', shape: 'dot', text: `Updated: ${task.tpc_id.substr(0, 8)}...`})
        
        // Send message to flow for custom update logic
        node.send(msg)
        
        if (mod.debug) {
            node.log(`Update event handled for task: ${task.tpc_id}`)
        }
        
    } catch (error) {
        node.error(`Error handling update event: ${error.message}`, payload)
        node.status({fill: 'red', shape: 'ring', text: 'Error'})
    }
}

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
    this.name = config.name || `tp-update-${config.tp_id || 'any'}`
    this.tp_id = config.tp_id // Can be empty for "any task package"

    // Set initial status
    const statusText = this.tp_id ? `Listening: ${this.tp_id}` : 'Listening: Any TP'
    this.status({fill: 'blue', shape: 'ring', text: statusText})
    
    // Create event listener for update events
    const updateEventHandler = handleUpdateEvent.bind(this)
    let eventName
    
    if (this.tp_id) {
        // Listen for specific task package updates
        eventName = tpEvents.onUpdate(this.tp_id, updateEventHandler)
    } else {
        // Listen for all task package updates (any tp_id)
        eventName = tpEvents.onUpdate('*', updateEventHandler)
    }
    
    // Store event name for cleanup
    this._eventName = eventName
    this._eventHandler = updateEventHandler
    
    if (mod.debug) {
        this.log(`tp-update node initialized for: ${this.tp_id || 'any task package'}`)
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        // Remove event listener
        if (this._eventName && this._eventHandler) {
            tpEvents.removeEventListener(this._eventName, this._eventHandler)
        }
        
        if (mod.debug) {
            this.log(`tp-update node closing: ${this.tp_id || 'any'}`)
        }
        
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpUpdate(RED) {
    // Save a reference to the RED runtime for convenience
    mod.RED = RED
    
    // Register the node type
    RED.nodes.registerType(mod.nodeName, nodeInstance)
    
    if (mod.debug) {
        RED.log.info(`✅ Registered node: ${mod.nodeName}`)
    }
}

// Export the module definition, this is consumed by Node-RED on startup.
module.exports = function(RED) {
    TpUpdate(RED)
}