/** Task Package Update Node
 *  Updates user-defined status information
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

//#region ----- Module level variables ---- //

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

function inputMsgHandler(msg, send, done) {
    const node = this
    
    try {
        if (!msg.tp_data) {
            node.error('No tp_data found in message', msg)
            done()
            return
        }
        
        // Get user status from node config or message
        const userStatus = node.user_status || msg.user_status || 'Status updated'
        
        // TODO: Update database user_status column
        // This will be implemented when we add database integration
        
        // Update tp_data with user status
        const updatedTpData = {
            ...msg.tp_data,
            user_status: userStatus,
            updated_at: new Date().toISOString()
        }
        
        const updatedMsg = {
            ...msg,
            tp_data: updatedTpData
        }
        
        node.status({fill: 'green', shape: 'dot', text: `Updated: ${userStatus}`})
        
        if (mod.debug) {
            node.log(`Updated user status: ${userStatus}`)
        }
        
        done()
        
    } catch (error) {
        node.error(`Error updating status: ${error.message}`, msg)
        done(error)
    }
}

function nodeInstance(config) {
    const RED = mod.RED
    RED.nodes.createNode(this, config) 
    
    this.name = config.name || 'tp-update'
    this.user_status = config.user_status || ''
    this.config_node = RED.nodes.getNode(config.config_node)
    
    this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
    this.on('input', inputMsgHandler)
    
    this.on('close', (removed, done) => {
        done()
    })
}

//#endregion

function TpUpdate(RED) {
    mod.RED = RED
    RED.nodes.registerType(mod.nodeName, nodeInstance)
}

module.exports = function(RED) {
    TpUpdate(RED)
}
