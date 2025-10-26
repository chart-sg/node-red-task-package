/** TP Start API Node - API Control
 *  Starts task packages via API call - input only, no output
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
    nodeName: 'tp-start-api',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/** 
 * Make API call to start task package
 * @param {object} data - The TP start data
 * @param {object} config - Node configuration
 * @returns {Promise<object>} API response
 */
async function callStartAPI(data, config) {
    try {
        const apiUrl = config.api_url || 'http://localhost:1880/task-package'
        const endpoint = `${apiUrl}/start`
        
        const requestData = {
            tp_id: data.tp_id,
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
            console.log('🚀 Starting TP via API:', endpoint, requestData)
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
    this.name = config.name || 'API - Start'
    this.tp_id = config.tp_id
    this.auth_token = config.auth_token
    
    // Use fixed API URL - always use the base endpoint
    this.api_url = 'http://localhost:1880/task-package'

    // Validation
    if (!this.tp_id) {
        this.error('Task Package ID is required')
        this.status({fill: 'red', shape: 'ring', text: 'No tp_id'})
        return
    }
    
    // Set initial status
    this.status({fill: 'blue', shape: 'ring', text: `Ready: ${this.tp_id}`})
    
    if (mod.debug) {
        this.log(`tp-start-api node initialized for: ${this.tp_id}`)
    }

    // Handle incoming messages
    this.on('input', async function(msg, send, done) {
        try {
            // Extract TP data from message
            const tpData = {
                tp_id: msg.tp_id || this.tp_id,
                payload: msg.payload || {}
            }
            
            // Validate tp_id
            if (!tpData.tp_id) {
                throw new Error('tp_id is required (from node config or msg.tp_id)')
            }
            
            // Set status to starting
            this.status({fill: 'yellow', shape: 'dot', text: 'Starting...'})
            
            // Make API call - use auth token from message or config
            const apiConfig = {
                api_url: this.api_url,
                auth_token: msg.accessToken || this.auth_token
            }
            
            const result = await callStartAPI(tpData, apiConfig)
            
            // Success status
            this.status({fill: 'green', shape: 'dot', text: `Started: ${result.tpc_id?.substr(0, 8)}...`})
            
            if (mod.debug) {
                this.log(`Successfully started TP: ${result.tpc_id}`)
            }
            
            // Send API response to output
            const outputMsg = {
                ...msg,
                payload: result,
                topic: 'tp-start-success',
                tp_data: {
                    tpc_id: result.tpc_id,
                    tp_id: tpData.tp_id,
                    status: result.status,
                    created_at: new Date().toISOString()
                }
            }
            this.send(outputMsg)
            
            // Reset status after 3 seconds
            setTimeout(() => {
                this.status({fill: 'blue', shape: 'ring', text: `Ready: ${this.tp_id}`})
            }, 3000)
            
        } catch (error) {
            this.error(`Failed to start TP: ${error.message}`, msg)
            this.status({fill: 'red', shape: 'ring', text: 'Start failed'})
            
            // Send error response to output
            const errorMsg = {
                ...msg,
                payload: { error: error.message },
                topic: 'tp-start-error',
                error: true
            }
            this.send(errorMsg)
            
            // Reset status after 5 seconds
            setTimeout(() => {
                this.status({fill: 'blue', shape: 'ring', text: `Ready: ${this.tp_id}`})
            }, 5000)
        }
        
        if (done) done()
    })

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log(`tp-start-api node closing: ${this.tp_id}`)
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function StartTp(RED) {
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
    StartTp(RED)
}