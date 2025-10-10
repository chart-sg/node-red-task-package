/** Task Package Check Cancel Node
 *  Checks for cancellation and routes flow accordingly
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

// Import shared utilities
const { isCleanupFlow, isTaskCancelled, markAsCleanup } = require('../lib/tp-node-utils');

//#region ----- Module level variables ---- //

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-check-cancel',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

function inputMsgHandler(msg, send, done) {
    const node = this
    
    try {
        if (!msg.tp_data) {
            node.error('No tp_data found in message', msg)
            done()
            return
        }
        
        const flow = node.context().flow
        const tpc_id = msg.tp_data.tpc_id
        
        if (!tpc_id) {
            node.error('No task instance ID found in tp_data', msg)
            done()
            return
        }
        
        // Check if this is a cleanup flow (bypass cancellation check)
        const isCleanup = isCleanupFlow(msg)
        const statusPrefix = isCleanup ? '[CLEANUP] ' : ''
        
        if (mod.debug) {
            node.log(`Checking cancellation for tpc_id: ${tpc_id}`)
        }
        
        // Check if task has been cancelled
        if (!isCleanup && isTaskCancelled(flow, tpc_id, msg)) {
            // Output 2: Task is cancelled - route to failure sequence
            node.status({fill: 'orange', shape: 'dot', text: `Cancelled: ${tpc_id.substr(0, 8)}...`})
            
            if (mod.debug) {
                node.log(`Task ${tpc_id} is cancelled - routing to cancelled output`)
            }
            
            // Add cancellation metadata to message
            const cancelledMsg = {
                ...msg,
                tp_cancelled: true,
                tp_cancel_reason: 'Task package was cancelled',
                tp_cancel_timestamp: new Date().toISOString()
            }
            
            send([null, markAsCleanup(cancelledMsg, 'cancelled')])
        } else {
            // Output 1: Task is not cancelled - continue normal flow
            const statusText = isCleanup ? '[CLEANUP] Passed' : `Passed: ${tpc_id.substr(0, 8)}...`
            node.status({fill: 'green', shape: 'dot', text: statusText})
            
            if (mod.debug) {
                node.log(`Task ${tpc_id} is active - routing to pass output`)
            }
            
            send([msg, null])
        }
        
        done()
        
    } catch (error) {
        node.error(`Error checking cancellation: ${error.message}`, msg)
        node.status({fill: 'red', shape: 'ring', text: 'Error'})
        done(error)
    }
}

function nodeInstance(config) {
    const RED = mod.RED
    RED.nodes.createNode(this, config) 
    
    this.name = config.name || 'Check Cancel'
    
    // Set initial status
    this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
    
    if (mod.debug) {
        this.log(`tp-check-cancel node initialized: ${this.name}`)
    }
    
    // Handle incoming messages
    this.on('input', inputMsgHandler)
    
    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log(`tp-check-cancel node closing: ${this.name}`)
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpCheckCancel(RED) {
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
    TpCheckCancel(RED)
}