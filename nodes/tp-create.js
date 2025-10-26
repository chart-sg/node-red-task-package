/** Task Package Start Node
 *  Entry point for task package flows - handles start events and validation
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
const { v4: uuidv4 } = require('uuid')
const Ajv = require('ajv')

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-start',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/** 
 * Handle incoming start events for this task package
 * @param {object} payload - The event payload from API layer
 */
async function handleStartEvent(payload) {
    // `this` context is the node instance
    const node = this
    
    try {
        // Validate payload against schema if provided
        if (node.tp_schema) {
            const ajv = new Ajv()
            const validate = ajv.compile(JSON.parse(node.tp_schema))
            const valid = validate(payload.payload || {})
            
            if (!valid) {
                node.error(`Schema validation failed: ${JSON.stringify(validate.errors)}`, payload)
                node.status({fill: 'red', shape: 'ring', text: 'Schema validation failed'})
                return
            }
        }
        
        // Use the tpc_id from API (already generated and stored in DB)
        const tpc_id = payload.tpc_id
        
        // Store task context in node instance for parallel support
        this.current_tpc_id = tpc_id
        this.current_tp_id = this.tp_id
        this.current_tp_name = this.tp_name
        this.task_cancelled = false
        
        // Also store in flow context for backward compatibility
        // But use arrays to support multiple concurrent tasks
        const flow = node.context().flow
        const active_tasks = flow.get('active_tasks') || []
        active_tasks.push({
            tpc_id: tpc_id,
            tp_id: this.tp_id,
            tp_name: this.tp_name,
            create_node_id: node.id,
            created_at: new Date().toISOString()
        })
        flow.set('active_tasks', active_tasks)
        
        // Keep legacy single-task context for existing flows
        flow.set('current_tpc_id', tpc_id)
        flow.set('current_tp_id', this.tp_id)
        flow.set('current_tp_name', this.tp_name)
        flow.set('task_cancelled', false)
        
        // Update database status to 'started'
        const taskPackageDB = require('../lib/task-package-db')
        await taskPackageDB.updateTaskStatus(tpc_id, 'started')
        
        // Create msg.tp_data object
        const tp_data = {
            tpc_id: tpc_id,
            tp_id: node.tp_id,
            tp_name: node.tp_name,
            user: payload.user,
            status: 'started',
            payload: payload.payload || {},
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
        
        // Create output message
        const msg = {
            tp_data: tp_data,
            payload: payload.payload || {},
            topic: `task-package/${node.tp_id}/started`,
            _tpOriginator: node.id
        }
        
        // Set node status
        node.status({fill: 'green', shape: 'dot', text: `Started: ${tpc_id.substr(0, 8)}...`})
        
        // Send message to flow
        node.send(msg)
        
        if (mod.debug) {
            node.log(`Started task package: ${node.tp_id} with tpc_id: ${tpc_id}`)
        }
        
    } catch (error) {
        node.error(`Error handling start event: ${error.message}`, payload)
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
    this.name = config.name || `tp-start-${config.tp_id}`
    this.tp_id = config.tp_id
    this.tp_name = config.tp_name
    this.tp_form_url = config.tp_form_url
    this.tp_schema = config.tp_schema
    this.config_node = RED.nodes.getNode(config.config_node)

    // Validation
    if (!this.tp_id) {
        this.error('Task Package ID is required')
        this.status({fill: 'red', shape: 'ring', text: 'No tp_id'})
        return
    }
    
    if (!this.config_node) {
        this.warn('No configuration node selected')
    }
    
    // Update task_packages table with current node configuration
    // Use a robust approach that waits for database to be ready
    const syncToDatabase = async () => {
        try {
            const taskPackageDB = require('../lib/task-package-db')
            
            // Upsert the task package definition
            await taskPackageDB.upsertTaskPackage(
                this.tp_id,
                this.tp_name || this.tp_id,
                this.tp_form_url || this.tp_id
            )
            
            if (mod.debug) {
                this.log(`Task package definition updated: ${this.tp_id} -> ${this.tp_name}`)
            }
        } catch (error) {
            this.warn(`Failed to update task package in database: ${error.message}`)
        }
    }
    
    // Robust database sync that waits for database to be ready
    let syncCompleted = false
    const waitForDatabaseAndSync = () => {
        if (syncCompleted) return // Prevent multiple syncs
        
        try {
            const taskPackageDB = require('../lib/task-package-db')
            
            // Check if database is initialized
            if (taskPackageDB.isInitialized) {
                syncToDatabase().then(() => {
                    syncCompleted = true
                })
                return
            }
            
            // Database not ready yet, wait and retry
            setTimeout(() => {
                waitForDatabaseAndSync()
            }, 1000) // Check every second
            
        } catch (error) {
            // Database module might not be ready, try again later
            setTimeout(() => {
                waitForDatabaseAndSync()
            }, 1000)
        }
    }
    
    // Start the database sync process
    waitForDatabaseAndSync()
    
    // Also do immediate sync for deployment scenarios (when db is already ready)
    setTimeout(() => {
        if (!syncCompleted) {
            syncToDatabase().then(() => {
                syncCompleted = true
            })
        }
    }, 100) // Small delay to avoid race conditions
    
    // Set initial status
    this.status({fill: 'blue', shape: 'ring', text: `Listening: ${this.tp_id}`})
    
    // Create event listener for start events
    const startEventHandler = handleStartEvent.bind(this)
    const eventName = tpEvents.onStart(this.tp_id, startEventHandler)
    
    // Store event name for cleanup
    this._eventName = eventName
    this._eventHandler = startEventHandler
    
    if (mod.debug) {
        this.log(`tp-start node initialized for: ${this.tp_id}`)
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        // Remove event listener
        if (this._eventName && this._eventHandler) {
            tpEvents.removeEventListener(this._eventName, this._eventHandler)
        }
        
        if (mod.debug) {
            this.log(`tp-start node closing: ${this.tp_id}`)
        }
        
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpStart(RED) {
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
    TpStart(RED)
}