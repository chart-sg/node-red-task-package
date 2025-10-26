/** Cancel TP Node - API Control
 *  Cancels task packages via API call - input only, no output
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
    nodeName: 'tp-cancel-api',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/** 
 * Make API call to cancel task package
 * @param {object} data - The TP cancellation data
 * @param {object} config - Node configuration
 * @returns {Promise<object>} API response
 */
async function callCancelAPI(data, config) {
    try {
        const apiUrl = config.api_url || 'http://localhost:1880/task-package'
        const endpoint = `${apiUrl}/cancel`
        
        const requestData = {
            tp_id: data.tp_id,
            tpc_id: data.tpc_id,
            ...data.payload
        }
        
        const headers = {
            'Content-Type': 'application/json'
        }
        
        // Add authorization header if token provided
        if (config.auth_token) {
            headers['Authorization'] = `Bearer ${config.auth_token}`
        }
        
        if (mod.debug) {
            console.log('🛑 Cancelling TP via API:', endpoint, requestData)
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
    this.name = config.name || 'API - Cancel'
    this.tp_id = config.tp_id
    this.auth_token = config.auth_token
    
    // Use fixed API URL - always use the base endpoint
    this.api_url = 'http://localhost:1880/task-package'

    // Set initial status
    const statusText = this.tp_id ? `Ready: ${this.tp_id}` : 'Ready'
    this.status({fill: 'blue', shape: 'ring', text: statusText})
    
    if (mod.debug) {
        this.log(`tp-cancel-api node initialized${this.tp_id ? ' for: ' + this.tp_id : ''}`)
    }

    // Handle incoming messages
    this.on('input', async function(msg, send, done) {
        try {
            // Extract cancellation data from message
            const cancelData = {
                tp_id: msg.tp_id || this.tp_id,
                tpc_id: msg.tpc_id,
                payload: msg.payload || {}
            }
            
            // Validation
            if (!cancelData.tp_id) {
                throw new Error('tp_id is required (from node config or msg.tp_id)')
            }
            
            if (!cancelData.tpc_id) {
                throw new Error('tpc_id is required in msg.tpc_id')
            }
            
            // Set status to cancelling
            this.status({fill: 'yellow', shape: 'dot', text: 'Cancelling...'})
            
            // Make API call - use auth token from message or config
            const apiConfig = {
                api_url: this.api_url,
                auth_token: msg.accessToken || this.auth_token
            }
            
            const result = await callCancelAPI(cancelData, apiConfig)
            
            // Success status
            const statusMsg = result.message ? 'Already cancelling' : 'Cancelled'
            this.status({fill: 'orange', shape: 'dot', text: `${statusMsg}: ${cancelData.tpc_id.substr(0, 8)}...`})
            
            if (mod.debug) {
                this.log(`Successfully cancelled TP: ${cancelData.tpc_id} (${result.status})`)
            }
            
            // Send API response to output
            const outputMsg = {
                ...msg,
                payload: result,
                topic: 'tp-cancel-success',
                tp_data: {
                    tpc_id: cancelData.tpc_id,
                    tp_id: cancelData.tp_id,
                    status: result.status,
                    cancelled_at: new Date().toISOString(),
                    message: result.message
                }
            }
            this.send(outputMsg)
            
            // Reset status after 3 seconds
            setTimeout(() => {
                const statusText = this.tp_id ? `Ready: ${this.tp_id}` : 'Ready'
                this.status({fill: 'blue', shape: 'ring', text: statusText})
            }, 3000)
            
        } catch (error) {
            this.error(`Failed to cancel TP: ${error.message}`, msg)
            this.status({fill: 'red', shape: 'ring', text: 'Cancel failed'})
            
            // Send error response to output
            const errorMsg = {
                ...msg,
                payload: { error: error.message },
                topic: 'tp-cancel-error',
                error: true
            }
            this.send(errorMsg)
            
            // Reset status after 5 seconds
            setTimeout(() => {
                const statusText = this.tp_id ? `Ready: ${this.tp_id}` : 'Ready'
                this.status({fill: 'blue', shape: 'ring', text: statusText})
            }, 5000)
        }
        
        if (done) done()
    })

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log(`tp-cancel-api node closing${this.tp_id ? ': ' + this.tp_id : ''}`)
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function CancelTp(RED) {
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
    CancelTp(RED)
}