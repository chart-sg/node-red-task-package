/** Task Package End Node
 *  Terminates task package execution and updates final status
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

// Import shared utilities
const { isCleanupFlow } = require('../lib/tp-node-utils');

/** --- Type Definitions --- */
// @typedef {import('node-red')} RED

//#region ----- Module level variables ---- //

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-end',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/**
 * Handle incoming messages for task completion
 * @param {object} msg - The message object
 * @param {function} send - Send function for Node-RED 1.0+
 * @param {function} done - Done function for Node-RED 1.0+
 */
async function inputMsgHandler(msg, send, done) {
    // `this` context is the node instance
    const node = this
    
    try {
        // Check if we have tp_data in the message
        if (!msg.tp_data) {
            node.error('No tp_data found in message. tp-end must receive messages from tp-start or other tp-* nodes.', msg)
            done()
            return
        }
        
        const tpc_id = msg.tp_data.tpc_id
        if (!tpc_id) {
            node.error('No task instance ID found in tp_data', msg)
            done()
            return
        }
        
        // Get current task context from flow
        const flow = node.context().flow
        const active_tasks = flow.get('active_tasks') || []
        
        // Find this specific task
        const task_index = active_tasks.findIndex(task => task.tpc_id === tpc_id)
        if (task_index === -1) {
            node.warn(`Task ${tpc_id} not found in active tasks`)
            done()
            return
        }
        
        const task = active_tasks[task_index]
        const wasCancelled = task.cancelled || false
        const isCleanup = isCleanupFlow(msg)
        
        // Validate current status - be more flexible for cleanup flows and cancellation states
        const currentStatus = msg.tp_data.status
        const validStatusesForCompletion = ['ongoing', 'started', 'created', 'cancelling']
        
        if (!validStatusesForCompletion.includes(currentStatus)) {
            node.warn(`Task ${tpc_id} has status '${currentStatus}' which is not valid for completion. Expected: ${validStatusesForCompletion.join(', ')}`)  
            node.status({fill: 'orange', shape: 'ring', text: `Invalid status: ${currentStatus}`})
            done()
            return
        }
        
        // Determine final status based on cancellation state and cleanup context
        let finalStatus
        if (wasCancelled || currentStatus === 'cancelling') {
            finalStatus = 'cancelled'
        } else {
            finalStatus = 'completed'
        }
        
        const statusPrefix = isCleanup ? '[CLEANUP] ' : ''
        
        // Update tp_data with final information
        const updatedTpData = {
            ...msg.tp_data,
            status: finalStatus,
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString()
        }
        
        // Update database with final status (only status, not user_status)
        try {
            const dbConfig = flow.get('tp_config') || {}
            const taskPackageDB = require('../lib/task-package-db')
            await taskPackageDB.updateTaskStatus(tpc_id, finalStatus)
            
            if (mod.debug) {
                node.log(`Database updated: ${tpc_id} -> ${finalStatus}`)
            }
        } catch (dbError) {
            node.warn(`Failed to update database: ${dbError.message}`)
        }
        
        // Set node status based on completion type
        if (finalStatus === 'cancelled') {
            node.status({fill: 'orange', shape: 'dot', text: `${statusPrefix}Cancelled: ${tpc_id.substr(0, 8)}...`})
        } else {
            node.status({fill: 'green', shape: 'dot', text: `${statusPrefix}Completed: ${tpc_id.substr(0, 8)}...`})
        }
        
        // Remove this task from active tasks
        active_tasks.splice(task_index, 1)
        flow.set('active_tasks', active_tasks)
        
        // Clear legacy flow context if this was the current task
        if (flow.get('current_tpc_id') === tpc_id) {
            flow.set('current_tpc_id', null)
            flow.set('current_tp_id', null)
            flow.set('current_tp_name', null)
            flow.set('task_cancelled', false)
        }
        
        if (mod.debug) {
            node.log(`Task package ended with status: ${finalStatus} for tpc_id: ${tpc_id}`)
        }
        
        // Node has no outputs - this is the end of the task package flow
        done()
        
    } catch (error) {
        node.error(`Error handling end event: ${error.message}`, msg)
        node.status({fill: 'red', shape: 'ring', text: 'Error'})
        done(error)
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
    this.name = config.name || 'tp-end'
    
    /** Helper function to find the first available tp-config node */
    this.findTpConfigNode = function() {
        let configNode = null
        RED.nodes.eachNode((node) => {
            if (node.type === 'tp-config' && !configNode) {
                configNode = RED.nodes.getNode(node.id)
            }
        })
        return configNode
    }
    
    // Auto-find tp-config node if not explicitly set
    this.config_node = RED.nodes.getNode(config.config_node) || this.findTpConfigNode()
    
    if (!this.config_node) {
        this.warn('No tp-config node found. Please add a tp-config node to your workspace.')
    }
    
    // Set initial status
    this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
    
    // Handle incoming messages
    this.on('input', inputMsgHandler)
    
    if (mod.debug) {
        this.log('tp-end node initialized')
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log('tp-end node closing')
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpEnd(RED) {
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
    TpEnd(RED)
}
