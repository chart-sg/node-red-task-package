/** Task Package Ongoing Node
 *  Updates task package status to 'ongoing' in database
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
    nodeName: 'tp-ongoing',
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
    this.name = config.name || 'tp-ongoing'
    
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
            
            // Update database status to 'ongoing'
            const taskPackageDB = require('../lib/task-package-db')
            await taskPackageDB.updateTaskStatus(tpc_id, 'ongoing')
            
            // Update tp_data status and add ongoing timestamp
            msg.tp_data.status = 'ongoing'
            msg.tp_data.ongoing_at = new Date().toISOString()
            msg.tp_data.updated_at = new Date().toISOString()
            msg.topic = `task-package/${msg.tp_data.tp_id}/ongoing`
            
            // Set node status
            this.status({fill: 'yellow', shape: 'dot', text: `Ongoing: ${tpc_id.substr(0, 8)}...`})
            
            // Send message to next node
            send(msg)
            
            if (mod.debug) {
                this.log(`Task package ongoing: ${tpc_id}`)
            }
            
            if (done) done()
            
        } catch (error) {
            this.error(`Error updating task package to ongoing: ${error.message}`, msg)
            this.status({fill: 'red', shape: 'ring', text: 'Error'})
            if (done) done(error)
        }
    })
    
    if (mod.debug) {
        this.log('tp-ongoing node initialized')
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log('tp-ongoing node closing')
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpOngoing(RED) {
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
    TpOngoing(RED)
}