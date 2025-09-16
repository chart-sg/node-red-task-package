/**
 * Task Package API - REST endpoints for external access
 * Integrates with Node-RED's existing Express server
 * Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Import our shared modules
const taskPackageEvents = require('./task-package-events');
const taskPackageDB = require('./task-package-db');

class TaskPackageAPI {
    constructor() {
        this.config = null;
        this.db = null;
        this.router = express.Router();
        this.setupRoutes();
    }

    /**
     * Initialize routes on an existing Express app (for Node-RED integration)
     * @param {Express} app - Express application instance  
     * @param {Object} config - Configuration object
     */
    initializeRoutes(app, config) {
        this.config = config;
        this.db = taskPackageDB; // Use singleton instance directly
        
        // Initialize database with config
        this.db.init(config.db_url);
        
        // Setup CORS middleware for our routes
        app.use('/task-package', cors());
        app.use('/task-package', express.json());
        
        // Add our routes to the app
        app.use('/task-package', this.router);
        
        console.log('✅ Task Package API routes initialized');
    }

    setupRoutes() {
        // POST /task-package/start - Start a new task instance
        this.router.post('/start', async (req, res) => {
            try {
                const { tp_id, user, ...payload } = req.body;

                // Validate request
                if (!tp_id || !user) {
                    return res.status(400).json({ error: 'tp_id and user are required' });
                }

                // Security validation
                const validation = await this.validateRequest(req, user);
                if (!validation.valid) {
                    return res.status(validation.status).json({ error: validation.message });
                }

                // Get task package info to get the proper name
                const taskPackage = await this.db.getTaskPackage(tp_id);
                if (!taskPackage) {
                    return res.status(404).json({ error: `Task package '${tp_id}' not found` });
                }

                // Generate unique instance ID
                const tpc_id = uuidv4();
                
                // Store in database with proper tp_name from task_packages table
                await this.db.createTaskPackageInstance(tpc_id, tp_id, taskPackage.name, user);

                // Emit start event with payload containing all other fields
                taskPackageEvents.emitStart(tp_id, {
                    tpc_id,
                    tp_id,
                    user,
                    payload // This will contain all fields except tp_id and user
                });

                res.json({ tpc_id, status: 'started' });
            } catch (error) {
                console.error('Error starting task package:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // POST /task-package/cancel - Cancel a task instance
        this.router.post('/cancel', async (req, res) => {
            try {
                const { tp_id, tpc_id, user } = req.body;

                // Validate request
                if (!tp_id || !tpc_id || !user) {
                    return res.status(400).json({ error: 'tp_id, tpc_id, and user are required' });
                }

                // Security validation
                const validation = await this.validateRequest(req, user);
                if (!validation.valid) {
                    return res.status(validation.status).json({ error: validation.message });
                }

                // Update database status to cancelled
                await this.db.updateTaskStatus(tpc_id, 'cancelled', 'Cancelled by user');

                // Emit cancel event with proper parameters
                taskPackageEvents.emitCancel(tpc_id, {
                    tp_id,
                    tpc_id,
                    user,
                    cancelled_by: user,
                    cancelled_at: new Date().toISOString(),
                    payload: req.body
                });

                res.json({ status: 'cancelled' });
            } catch (error) {
                console.error('Error cancelling task package:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // GET /task-package/status - List all task instances OR get specific one with ?tpc_id=
        this.router.get('/status', async (req, res) => {
            try {
                const { tpc_id, tp_id, user, status } = req.query;
                
                if (tpc_id) {
                    // Get specific task instance
                    const instance = await this.db.getTaskPackageInstance(tpc_id);
                    if (!instance) {
                        return res.status(404).json({ error: `Task instance '${tpc_id}' not found` });
                    }
                    res.json(instance);
                } else {
                    // Get all task instances with optional filtering
                    let instances = await this.db.getTaskPackageInstances();
                    
                    // Apply filters if provided
                    if (tp_id) {
                        instances = instances.filter(inst => inst.tp_id === tp_id);
                    }
                    if (user) {
                        instances = instances.filter(inst => inst.user === user);
                    }
                    if (status) {
                        instances = instances.filter(inst => inst.status === status);
                    }
                    
                    res.json(instances);
                }
            } catch (error) {
                console.error('Error getting task package instances:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // GET /task-package - List all available task package types OR get specific one with ?tp_id=
        this.router.get('/', async (req, res) => {
            try {
                const { tp_id } = req.query;
                
                if (tp_id) {
                    // Get specific task package definition
                    const taskPackage = await this.db.getTaskPackage(tp_id);
                    if (!taskPackage) {
                        return res.status(404).json({ error: `Task package '${tp_id}' not found` });
                    }
                    res.json(taskPackage);
                } else {
                    // Get all task package definitions
                    const taskPackages = await this.db.getTaskPackages();
                    res.json(taskPackages);
                }
            } catch (error) {
                console.error('Error getting task packages:', error);
                res.status(500).json({ error: error.message });
            }
        });
    }

    /**
     * Validate Keycloak token and authorization
     */
    async validateRequest(req, expectedUser = null) {
        try {
            // If no Keycloak URL configured, allow all requests
            if (!this.config || !this.config.keycloak_url) {
                return { valid: true };
            }

            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return { 
                    valid: false, 
                    status: 401, 
                    message: 'Bearer token required' 
                };
            }

            const token = authHeader.substring(7);
            const isValid = await this.validateKeycloakToken(token, expectedUser);
            
            if (!isValid) {
                return { 
                    valid: false, 
                    status: 403, 
                    message: 'Invalid token or unauthorized' 
                };
            }

            return { valid: true };
        } catch (error) {
            console.error('Error validating request:', error);
            return { 
                valid: false, 
                status: 500, 
                message: 'Internal server error' 
            };
        }
    }

    /**
     * Validate token against Keycloak and check tp_allowed
     */
    async validateKeycloakToken(token, expectedUser) {
        try {
            if (!this.config.keycloak_url) {
                return true; // Skip validation if no Keycloak URL
            }

            const response = await axios.get(this.config.keycloak_url, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000
            });

            const userData = response.data;
            
            // Check if user matches expected user (if provided)
            if (expectedUser && userData.preferred_username !== expectedUser) {
                return false;
            }

            // For now, assume all authenticated users are authorized
            // In the future, you might check userData.tp_allowed array
            return true;
        } catch (error) {
            console.error('Keycloak validation failed:', error.message);
            return false;
        }
    }
}

// Export singleton instance
module.exports = new TaskPackageAPI();
