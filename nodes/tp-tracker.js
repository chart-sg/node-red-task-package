/** TP Tracker Node - Database-Based Task Package Tracking
 *  Tracks task package instances using the centralized database
 *  No complex event handling - just direct database queries
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

/** --- Type Definitions --- */
// @typedef {import('node-red')} RED

//#region ----- Module level variables ---- //

const taskPackageDB = require('../lib/task-package-db')

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-tracker',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/**
 * Handle store action - store tpc_id mapping for entity
 */
async function handleStoreAction(msg, key, done) {
    const node = this
    
    try {
        const tpcId = msg.tp_data?.tpc_id || msg.payload?.tpc_id || msg.tpc_id
        
        if (!key) {
            throw new Error(`Key field '${node.key_field}' not found in message`)
        }
        if (!tpcId) {
            throw new Error('tpc_id not found in message')
        }
        
        // Store mapping in flow context (entity -> tpc_id)
        const flow = node.context().flow
        const mappingKey = `tp_mapping_${node.tp_id || 'all'}_${key}`
        flow.set(mappingKey, tpcId)
        
        msg.tp_tracker = {
            action: 'stored',
            key: key,
            tpc_id: tpcId
        }
        
        node.status({
            fill: 'green',
            shape: 'dot',
            text: `Stored: ${key}`
        })
        
        if (mod.debug) {
            node.log(`Stored mapping: ${key} -> ${tpcId}`)
        }
        
        node.send(msg)
        done()
        
    } catch (error) {
        throw error
    }
}

/**
 * Handle lookup action - get task status from database
 */
async function handleLookupAction(msg, key, done) {
    const node = this
    
    try {
        if (!key) {
            throw new Error(`Key field '${node.key_field}' not found in message`)
        }
        
        // Get tpc_id from flow context mapping
        const flow = node.context().flow
        const mappingKey = `tp_mapping_${node.tp_id || 'all'}_${key}`
        const tpcId = flow.get(mappingKey)
        
        if (!tpcId) {
            msg.tp_tracker = {
                action: 'not_found',
                key: key
            }
            
            node.status({
                fill: 'grey',
                shape: 'ring',
                text: `Not found: ${key}`
            })
            
            if (mod.debug) {
                node.log(`No mapping found for key: ${key}`)
            }
            
            node.send(msg)
            done()
            return
        }
        
        // Query database for current task status
        const taskInstance = await taskPackageDB.getTaskPackageInstance(tpcId)
        
        if (!taskInstance) {
            msg.tp_tracker = {
                action: 'not_found',
                key: key,
                tpc_id: tpcId,
                reason: 'task_not_in_database'
            }
            
            node.status({
                fill: 'yellow',
                shape: 'ring',
                text: `Task not found: ${key}`
            })
            
            if (mod.debug) {
                node.log(`Task ${tpcId} not found in database`)
            }
            
        } else {
            // Determine if task is still active
            const activeStatuses = ['created', 'started', 'ongoing']
            const isActive = activeStatuses.includes(taskInstance.status)
            
            const minutesSinceCreation = ((new Date() - new Date(taskInstance.created_at)) / 1000 / 60).toFixed(1)
            
            msg.tp_tracker = {
                action: 'found',
                key: key,
                tpc_id: tpcId,
                tp_id: taskInstance.tp_id,
                tp_name: taskInstance.tp_name,
                status: taskInstance.status,
                user_status: taskInstance.user_status,
                is_active: isActive,
                created_at: taskInstance.created_at,
                updated_at: taskInstance.updated_at,
                minutes_since_creation: minutesSinceCreation
            }
            
            // Also set tpc_id directly for easy access
            msg.tpc_id = tpcId
            
            const statusText = `Found: ${key} (${taskInstance.status})`
            node.status({
                fill: isActive ? 'green' : 'orange',
                shape: 'dot',
                text: statusText
            })
            
            if (mod.debug) {
                node.log(`Found task ${tpcId} for ${key}: ${taskInstance.status} (active: ${isActive})`)
            }
        }
        
        node.send(msg)
        done()
        
    } catch (error) {
        throw error
    }
}

/**
 * Handle remove action - remove entity mapping
 */
async function handleRemoveAction(msg, key, done) {
    const node = this
    
    try {
        if (!key) {
            throw new Error(`Key field '${node.key_field}' not found in message`)
        }
        
        // Remove mapping from flow context
        const flow = node.context().flow
        const mappingKey = `tp_mapping_${node.tp_id || 'all'}_${key}`
        const tpcId = flow.get(mappingKey)
        
        if (tpcId) {
            flow.set(mappingKey, undefined)
            
            msg.tp_tracker = {
                action: 'removed',
                key: key,
                tpc_id: tpcId
            }
            
            node.status({
                fill: 'yellow',
                shape: 'dot',
                text: `Removed: ${key}`
            })
            
            if (mod.debug) {
                node.log(`Removed mapping for key: ${key}`)
            }
        } else {
            msg.tp_tracker = {
                action: 'not_found',
                key: key
            }
            
            node.status({
                fill: 'grey',
                shape: 'ring',
                text: `Not found: ${key}`
            })
            
            if (mod.debug) {
                node.log(`No mapping found to remove for key: ${key}`)
            }
        }
        
        node.send(msg)
        done()
        
    } catch (error) {
        throw error
    }
}

/**
 * Handle list action - get all active tasks from database
 */
async function handleListAction(msg, done) {
    const node = this
    
    try {
        // Get all task instances from database
        const allTasks = await taskPackageDB.getTaskPackageInstances()
        
        // Filter by tp_id if specified
        const filteredTasks = node.tp_id ? 
            allTasks.filter(task => task.tp_id === node.tp_id) : 
            allTasks
        
        // Group by status
        const activeStatuses = ['created', 'started', 'ongoing']
        const activeTasks = filteredTasks.filter(task => activeStatuses.includes(task.status))
        const completedTasks = filteredTasks.filter(task => !activeStatuses.includes(task.status))
        
        msg.tp_tracker = {
            action: 'list',
            total_count: filteredTasks.length,
            active_count: activeTasks.length,
            completed_count: completedTasks.length,
            active_tasks: activeTasks,
            completed_tasks: completedTasks,
            all_tasks: filteredTasks
        }
        
        node.status({
            fill: 'blue',
            shape: 'dot',
            text: `Listed: ${activeTasks.length} active, ${completedTasks.length} completed`
        })
        
        if (mod.debug) {
            node.log(`Listed ${filteredTasks.length} tasks (${activeTasks.length} active)`)
        }
        
        node.send(msg)
        done()
        
    } catch (error) {
        throw error
    }
}

/** 
 * Run when an actual instance of our node is committed to a flow
 * @param {object} config The Node-RED config object
 */
function nodeInstance(config) {
    const RED = mod.RED
    
    // Create the node instance
    RED.nodes.createNode(this, config) 
    
    // Transfer config items from the Editor panel to the runtime
    this.name = config.name || 'TP Tracker'
    this.action = config.action || 'store'  // 'store', 'lookup', 'remove', 'list'
    this.key_field = config.key_field || 'entity_id'
    this.tp_id = config.tp_id  // Optional filter for specific task package type
    
    if (mod.debug) {
        this.log(`tp-tracker initialized - Action: ${this.action}, TP ID: ${this.tp_id || 'all'}`)
    }
    
    // Helper function to extract field values using dot notation
    this.extractFieldValue = function(obj, fieldPath) {
        if (!fieldPath) return null
        
        const parts = fieldPath.split('.')
        let value = obj
        
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part]
            } else {
                return null
            }
        }
        
        return value
    }
    
    // Handle incoming messages
    this.on('input', async function(msg, send, done) {
        try {
            // Extract key (usually entity_id) from message
            const key = this.extractFieldValue(msg, this.key_field)
            
            switch (this.action) {
                case 'store':
                    await handleStoreAction.call(this, msg, key, done)
                    break
                    
                case 'lookup':
                    await handleLookupAction.call(this, msg, key, done)
                    break
                    
                case 'remove':
                    await handleRemoveAction.call(this, msg, key, done)
                    break
                    
                case 'list':
                    await handleListAction.call(this, msg, done)
                    break
                    
                default:
                    throw new Error(`Unknown action: ${this.action}`)
            }
            
        } catch (error) {
            this.error(`tp-tracker error: ${error.message}`, msg)
            this.status({fill: 'red', shape: 'ring', text: 'Error'})
            done(error)
        }
    })
    
    // Set initial status
    this.status({fill: 'blue', shape: 'ring', text: `Ready (${this.action})`})
    
    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        if (mod.debug) {
            this.log(`tp-tracker closing: ${this.action}`)
        }
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node
 * @param {RED} RED The Node-RED runtime object
 */
function TpTracker(RED) {
    mod.RED = RED
    RED.nodes.registerType(mod.nodeName, nodeInstance)
    
    if (mod.debug) {
        RED.log.info(`✅ Registered node: ${mod.nodeName}`)
    }
}

// Export the module definition
module.exports = function(RED) {
    TpTracker(RED)
}