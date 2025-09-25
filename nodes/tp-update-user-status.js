/** Task Package Update User Status Node
 *  Updates user-defined status information for task packages
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
    nodeName: 'tp-update-user-status',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

async function inputMsgHandler(msg, send, done) {
    const node = this
    
    try {
        if (!msg.tp_data) {
            node.error('No tp_data found in message', msg)
            done()
            return
        }
        
        const tpc_id = msg.tp_data.tpc_id
        if (!tpc_id) {
            node.error('No task instance ID found in tp_data', msg)
            done()
            return
        }
        
        // Get user status from node config, message payload.update, or message user_status
        let userStatus = node.user_status || ''
        
        // Check for update in msg.payload.update (highest priority)
        if (msg.payload && msg.payload.update) {
            userStatus = msg.payload.update
        } else if (msg.user_status) {
            userStatus = msg.user_status
        }
        
        if (!userStatus) {
            node.warn('No user status to update - use msg.payload.update, msg.user_status, or node configuration')
            done()
            return
        }
        
        // Update database user_status column
        try {
            const taskPackageDB = require('../lib/task-package-db')
            await taskPackageDB.updateUserStatus(tpc_id, userStatus)
            
            if (mod.debug) {
                node.log(`Database updated: ${tpc_id} user_status -> ${userStatus}`)
            }
        } catch (dbError) {
            node.error(`Failed to update database: ${dbError.message}`, msg)
            done(dbError)
            return
        }
        
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
        
        node.status({fill: 'green', shape: 'dot', text: `Updated: ${userStatus.substring(0, 20)}...`})
        
        if (mod.debug) {
            node.log(`Updated user status: ${userStatus}`)
        }
        
        send(updatedMsg)
        done()
        
    } catch (error) {
        node.error(`Error updating status: ${error.message}`, msg)
        node.status({fill: 'red', shape: 'ring', text: 'Error'})
        done(error)
    }
}

function nodeInstance(config) {
    const RED = mod.RED
    RED.nodes.createNode(this, config) 
    
    this.name = config.name || 'tp-update-user-status'
    this.user_status = config.user_status || ''
    
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
    
    this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
    this.on('input', inputMsgHandler)
    
    this.on('close', (removed, done) => {
        done()
    })
}

//#endregion

function TpUpdateUserStatus(RED) {
    mod.RED = RED
    RED.nodes.registerType(mod.nodeName, nodeInstance)
}

module.exports = function(RED) {
    TpUpdateUserStatus(RED)
}
