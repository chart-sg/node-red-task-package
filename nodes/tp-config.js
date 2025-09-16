/** Task Package Configuration Node
 *  Global configuration for the task package system
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

/** --- Type Definitions --- */
// @typedef {import('node-red')} RED

//#region ----- Module level variables ---- //

/** Module dependencies */
const taskPackageAPI = require('../lib/task-package-api')

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-config',
    /** @type {boolean} Turn on/off debugging */
    debug: true,
    /** @type {boolean} Track if API has been initialized */
    apiInitialized: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/** 
 * Run when an actual instance of our config node is committed to a flow
 * @param {object} config The Node-RED config object
 */
function nodeInstance(config) {
    // As a module-level named function, it will inherit `mod` and other module-level variables
    
    // If you need it - which you will here - or just use mod.RED if you prefer:
    const RED = mod.RED

    // Create the node instance - `this` can only be referenced AFTER here
    RED.nodes.createNode(this, config) 

    // Transfer config items from the Editor panel to the runtime
    this.name = config.name || 'Task Package Config'
    this.keycloak_url = config.keycloak_url || ''
    this.db_url = config.db_url || '/tmp/sqlite'
    this.host_url = config.host_url || 'localhost'
    this.host_port = config.host_port || 1880

    // Validate configuration
    if (this.keycloak_url && !this.keycloak_url.startsWith('http')) {
        this.warn('Keycloak URL should start with http:// or https://')
    }
    
    if (this.host_port && (isNaN(this.host_port) || this.host_port < 1 || this.host_port > 65535)) {
        this.warn('Host port should be a valid port number (1-65535)')
        this.host_port = 1880
    }

    // Initialize API if not already done
    if (!mod.apiInitialized) {
        try {
            // Get Node-RED's Express app
            const app = RED.httpNode || RED.httpAdmin
            
            // Initialize API routes
            taskPackageAPI.initializeRoutes(app, {
                keycloak_url: this.keycloak_url,
                db_url: this.db_url,
                host_url: this.host_url,
                host_port: this.host_port
            })
            
            mod.apiInitialized = true
            this.log('✅ Task Package API initialized on Node-RED server')
            
        } catch (error) {
            this.error('Failed to initialize Task Package API: ' + error.message)
        }
    }
    
    // Set status indicator
    if (mod.debug) {
        this.status({fill: 'green', shape: 'dot', text: `API:${this.host_port}`})
    }
    
    if (mod.debug) {
        this.log(`Config loaded: ${JSON.stringify({
            keycloak_url: this.keycloak_url ? '***configured***' : 'none',
            db_url: this.db_url,
            host_url: this.host_url,
            host_port: this.host_port
        })}`)
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log('tp-config node closing...')
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpConfig(RED) {
    // Save a reference to the RED runtime for convenience
    mod.RED = RED
    
    // Register the config node type
    RED.nodes.registerType(mod.nodeName, nodeInstance)
    
    if (mod.debug) {
        RED.log.info(`✅ Registered config node: ${mod.nodeName}`)
    }
}

// Export the module definition, this is consumed by Node-RED on startup.
module.exports = function(RED) {
    TpConfig(RED)
}
