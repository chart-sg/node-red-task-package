/** TP Update API Node - API Control
 *  Updates task packages via API call - input only, no output
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

/** --- Type Definitions --- */
// @typedef {import('node-red')} RED

//#region ----- Module level variables ---- //

const axios = require('axios')

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-update-api',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/** 
 * Make API call to update task package
 * @param {object} data - The TP update data
 * @param {object} config - Node configuration
 * @returns {Promise<object>} API response
 */
async function callUpdateAPI(data, config) {
    try {
        const apiUrl = config.api_url || 'http://localhost:1880/task-package'
        const endpoint = `${apiUrl}/update`
        
        const requestData = {
            tpc_id: data.tpc_id,
            tp_id: data.tp_id,
            ...data.update_data
        }
        
        const headers = {
            'Content-Type': 'application/json'
        }
        
        // Add authorization header if token provided
        if (config.auth_token) {
            headers['Authorization'] = `Bearer ${config.auth_token}`
        }
        
        if (mod.debug) {
            console.log('Updating TP via API:', endpoint, requestData)
        }
        
        const response = await axios.post(endpoint, requestData, {
            headers,
            timeout: 10000
        })
        
        return response.data
    } catch (error) {
        if (error.response) {
            // API returned an error response
            throw new Error(`API Error ${error.response.status}: ${error.response.data?.error || error.response.statusText}`)
        } else if (error.request) {
            // Network error
            throw new Error(`Network Error: Unable to reach API at ${endpoint}`)
        } else {
            throw new Error(`Request Error: ${error.message}`)
        }
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
    this.name = config.name || 'API - UPDATE'
    this.tp_id = config.tp_id
    this.auth_token = config.auth_token
    
    // Use fixed API URL - always use the base endpoint
    this.api_url = 'http://localhost:1880/task-package'

    // Set initial status
    const statusText = this.tp_id ? `Ready: ${this.tp_id}` : 'Ready: Any TP'
    this.status({fill: 'blue', shape: 'ring', text: statusText})
    
    if (mod.debug) {
        this.log(`tp-update-api node initialized for: ${this.tp_id || 'any task package'}`)
    }

    // Handle incoming messages
    this.on('input', async function(msg, send, done) {
        try {
            // Extract TP data from message
            const updateData = {
                tpc_id: msg.tpc_id || (msg.tp_data && msg.tp_data.tpc_id),
                tp_id: msg.tp_id || this.tp_id || (msg.tp_data && msg.tp_data.tp_id),
                update_data: msg.payload || {}
            }
            
            // Validate required fields
            if (!updateData.tpc_id && !updateData.tp_id) {
                throw new Error('Either tpc_id or tp_id is required (from node config, msg.tpc_id, msg.tp_id, or msg.tp_data)')
            }
            
            // Set status to updating
            this.status({fill: 'yellow', shape: 'dot', text: 'Updating...'})
            
            // Make API call - use auth token from message or config
            const apiConfig = {
                api_url: this.api_url,
                auth_token: msg.accessToken || this.auth_token
            }
            
            const result = await callUpdateAPI(updateData, apiConfig)
            
            // Success status
            const taskId = result.tpc_id || updateData.tpc_id || updateData.tp_id
            this.status({fill: 'green', shape: 'dot', text: `Updated: ${taskId.substr(0, 8)}...`})
            
            if (mod.debug) {
                this.log(`Successfully updated TP: ${taskId}`)
            }
            
            // Send API response to output
            const outputMsg = {
                ...msg,
                payload: result,
                topic: 'tp-update-success',
                tp_data: {
                    tpc_id: result.tpc_id || updateData.tpc_id,
                    tp_id: result.tp_id || updateData.tp_id,
                    status: result.status || 'updated',
                    updated_at: new Date().toISOString()
                }
            }
            this.send(outputMsg)
            
            // Reset status after 3 seconds
            setTimeout(() => {
                const statusText = this.tp_id ? `Ready: ${this.tp_id}` : 'Ready: Any TP'
                this.status({fill: 'blue', shape: 'ring', text: statusText})
            }, 3000)
            
        } catch (error) {
            this.error(`Failed to update TP: ${error.message}`, msg)
            this.status({fill: 'red', shape: 'ring', text: 'Update failed'})
            
            // Send error response to output
            const errorMsg = {
                ...msg,
                payload: { error: error.message },
                topic: 'tp-update-error',
                error: true
            }
            this.send(errorMsg)
            
            // Reset status after 5 seconds
            setTimeout(() => {
                const statusText = this.tp_id ? `Ready: ${this.tp_id}` : 'Ready: Any TP'
                this.status({fill: 'blue', shape: 'ring', text: statusText})
            }, 5000)
        }
        
        if (done) done()
    })

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log(`tp-update-api node closing: ${this.tp_id || 'any'}`)
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function UpdateTp(RED) {
    // Save a reference to the RED runtime for convenience
    mod.RED = RED
    
    // Register the node type
    RED.nodes.registerType(mod.nodeName, nodeInstance)
    
    if (mod.debug) {
        RED.log.info(`Registered node: ${mod.nodeName}`)
    }
}

// Export the module definition, this is consumed by Node-RED on startup.
module.exports = function(RED) {
    UpdateTp(RED)
}