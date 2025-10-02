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
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

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
        
        // Setup Swagger documentation
        const swaggerOptions = {
            definition: {
                openapi: '3.0.0',
                info: {
                    title: 'Task Package API',
                    version: '1.0.0',
                    description: 'REST API for managing Node-RED task packages'
                },
                servers: [{ url: '/task-package' }],
                components: {
                    securitySchemes: {
                        BearerAuth: {
                            type: 'http',
                            scheme: 'bearer',
                            bearerFormat: 'JWT'
                        }
                    }
                }
            },
            apis: [__filename] // Use current file for JSDoc comments
        };
        
        const specs = swaggerJsdoc(swaggerOptions);
        
        // Setup CORS middleware for our routes
        app.use('/task-package', cors());
        app.use('/task-package', express.json());
        
        // Setup Swagger UI
        app.use('/task-package/docs', swaggerUi.serve, swaggerUi.setup(specs, {
            customCss: '.swagger-ui .topbar { display: none }',
            customSiteTitle: 'Task Package API Documentation'
        }));
        
        // Add our routes to the app
        app.use('/task-package', this.router);
        
        console.log('✅ Task Package API routes initialized');
        console.log('📚 API documentation available at /task-package/docs');
    }

    /**
     * Update configuration without full re-initialization
     * @param {Object} config - New configuration object
     */
    updateConfig(config) {
        console.log('🔄 Updating Task Package API configuration');
        this.config = config;
        
        // Re-initialize database with new config
        this.db.init(config.db_url);
        
        console.log('✅ Task Package API configuration updated');
    }

    setupRoutes() {
        /**
         * @swagger
         * /start:
         *   post:
         *     summary: Start a new task package instance
         *     description: Creates and starts a new task package execution instance
         *     security:
         *       - BearerAuth: []
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - tp_id
         *             properties:
         *               tp_id:
         *                 type: string
         *                 description: Task package ID
         *                 example: "tp01"
         *             additionalProperties: true
         *           example:
         *             tp_id: "tp01"
         *             room: "101"
         *             priority: "high"
         *     responses:
         *       200:
         *         description: Task created successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 tpc_id:
         *                   type: string
         *                   description: Generated task instance ID
         *                   example: "550e8400-e29b-41d4-a716-446655440000"
         *                 status:
         *                   type: string
         *                   example: "created"
         *       400:
         *         description: Bad request - missing tp_id
         *       401:
         *         description: Unauthorized - Bearer token required
         *       403:
         *         description: Forbidden - Invalid token
         *       404:
         *         description: Task package not found
         *       500:
         *         description: Internal server error
         */
        // POST /task-package/start - Start a new task instance
        this.router.post('/start', async (req, res) => {
            try {
                const { tp_id, ...payload } = req.body;

                // Validate request
                if (!tp_id) {
                    return res.status(400).json({ error: 'tp_id is required' });
                }

                // Security validation (will extract user from token)
                const validation = await this.validateRequest(req);
                if (!validation.valid) {
                    return res.status(validation.status).json({ error: validation.message });
                }

                // Get user from token validation
                const user = validation.user;

                // Get task package info to get the proper name
                const taskPackage = await this.db.getTaskPackage(tp_id);
                if (!taskPackage) {
                    return res.status(404).json({ error: `Task package '${tp_id}' not found` });
                }

                // Generate unique instance ID
                const tpc_id = uuidv4();
                
                // Store in database with proper tp_name from task_packages table
                await this.db.createTaskPackageInstance(tpc_id, tp_id, taskPackage.name, user);

                // Emit create event with payload containing all other fields
                taskPackageEvents.emitCreate(tp_id, {
                    tpc_id,
                    tp_id,
                    user,
                    payload // This will contain all fields except tp_id and user
                });

                res.json({ tpc_id, status: 'created' });
            } catch (error) {
                console.error('Error starting task package:', error);
                res.status(500).json({ error: error.message });
            }
        });

        /**
         * @swagger
         * /cancel:
         *   post:
         *     summary: Cancel a task package instance
         *     description: Cancels an active task package execution instance
         *     security:
         *       - BearerAuth: []
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - tp_id
         *               - tpc_id
         *             properties:
         *               tp_id:
         *                 type: string
         *                 description: Task package ID
         *                 example: "tp01"
         *               tpc_id:
         *                 type: string
         *                 description: Task instance ID to cancel
         *                 example: "550e8400-e29b-41d4-a716-446655440000"
         *             additionalProperties: true
         *           example:
         *             tp_id: "tp01"
         *             tpc_id: "550e8400-e29b-41d4-a716-446655440000"
         *             reason: "User requested cancellation"
         *     responses:
         *       200:
         *         description: Task cancelled successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 status:
         *                   type: string
         *                   example: "cancelled"
         *       400:
         *         description: Bad request - missing tp_id or tpc_id
         *       401:
         *         description: Unauthorized - Bearer token required
         *       403:
         *         description: Forbidden - Invalid token
         *       500:
         *         description: Internal server error
         */
        // POST /task-package/cancel - Cancel a task instance
        this.router.post('/cancel', async (req, res) => {
            try {
                const { tp_id, tpc_id, ...payload } = req.body;

                // Validate request
                if (!tp_id || !tpc_id) {
                    return res.status(400).json({ error: 'tp_id and tpc_id are required' });
                }

                // Security validation (will extract user from token)
                const validation = await this.validateRequest(req);
                if (!validation.valid) {
                    return res.status(validation.status).json({ error: validation.message });
                }

                // Get user from token validation
                const user = validation.user;

                // Update database status to cancelled (no user_status)
                await this.db.updateTaskStatus(tpc_id, 'cancelled');

                // Emit cancel event with proper parameters
                taskPackageEvents.emitCancel(tpc_id, {
                    tp_id,
                    tpc_id,
                    user,
                    cancelled_by: user,
                    cancelled_at: new Date().toISOString(),
                    payload // This will contain all fields except tp_id and tpc_id
                });

                res.json({ status: 'cancelled' });
            } catch (error) {
                console.error('Error cancelling task package:', error);
                res.status(500).json({ error: error.message });
            }
        });

                /**
         * @swagger
         * /status:
         *   get:
         *     summary: Get task instance status
         *     description: Retrieve status of task instances with optional filtering
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: query
         *         name: tpc_id
         *         schema:
         *           type: string
         *         description: Specific task instance ID
         *         example: "550e8400-e29b-41d4-a716-446655440000"
         *       - in: query
         *         name: tp_id
         *         schema:
         *           type: string
         *         description: Filter by task package ID
         *         example: "tp01"
         *       - in: query
         *         name: user
         *         schema:
         *           type: string
         *         description: Filter by user
         *         example: "john.doe"
         *       - in: query
         *         name: status
         *         schema:
         *           type: string
         *           enum: [created, started, ongoing, completed, cancelled, failed]
         *         description: Filter by status
         *         example: "started"
         *     responses:
         *       200:
         *         description: Task instance(s) retrieved successfully
         *         content:
         *           application/json:
         *             schema:
         *               oneOf:
         *                 - type: object
         *                   description: Single task instance (when tpc_id provided)
         *                   properties:
         *                     tpc_id:
         *                       type: string
         *                     tp_id:
         *                       type: string
         *                     tp_name:
         *                       type: string
         *                     user:
         *                       type: string
         *                     status:
         *                       type: string
         *                     created_at:
         *                       type: string
         *                       format: date-time
         *                 - type: array
         *                   description: Array of task instances (when filtering)
         *                   items:
         *                     type: object
         *                     properties:
         *                       tpc_id:
         *                         type: string
         *                       tp_id:
         *                         type: string
         *                       tp_name:
         *                         type: string
         *                       user:
         *                         type: string
         *                       status:
         *                         type: string
         *                       created_at:
         *                         type: string
         *                         format: date-time
         *       401:
         *         description: Unauthorized - Bearer token required
         *       403:
         *         description: Forbidden - Invalid token
         *       404:
         *         description: Task instance not found (when specific tpc_id provided)
         *       500:
         *         description: Internal server error
         */
        // GET /task-package/status - Get task instance(s) status
        this.router.get('/status', async (req, res) => {
            try {
                // Security validation (no specific user since this is read-only)
                const validation = await this.validateRequest(req);
                if (!validation.valid) {
                    return res.status(validation.status).json({ error: validation.message });
                }

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
                console.error('Error getting task status:', error);
                res.status(500).json({ error: error.message });
            }
        });

        /**
         * @swagger
         * /info:
         *   get:
         *     summary: Get task package definitions
         *     description: Retrieve available task package types and their configurations
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: query
         *         name: tp_id
         *         schema:
         *           type: string
         *         description: Specific task package ID to retrieve
         *         example: "tp01"
         *     responses:
         *       200:
         *         description: Task package definition(s) retrieved successfully
         *         content:
         *           application/json:
         *             schema:
         *               oneOf:
         *                 - type: object
         *                   description: Single task package (when tp_id provided)
         *                   properties:
         *                     tp_id:
         *                       type: string
         *                       example: "tp01"
         *                     name:
         *                       type: string
         *                       example: "Linen Delivery"
         *                     form_url:
         *                       type: string
         *                       example: "linen_delivery"
         *                     schema:
         *                       type: object
         *                       description: JSON schema for validation
         *                 - type: array
         *                   description: Array of all task packages (when no tp_id)
         *                   items:
         *                     type: object
         *                     properties:
         *                       tp_id:
         *                         type: string
         *                       name:
         *                         type: string
         *                       form_url:
         *                         type: string
         *                       schema:
         *                         type: object
         *       401:
         *         description: Unauthorized - Bearer token required
         *       403:
         *         description: Forbidden - Invalid token
         *       404:
         *         description: Task package not found (when specific tp_id provided)
         *       500:
         *         description: Internal server error
         */
        // GET /task-package/info - List all available task package types OR get specific one with ?tp_id=
        this.router.get('/info', async (req, res) => {
            try {
                // Security validation (no specific user since this is read-only)
                const validation = await this.validateRequest(req);
                if (!validation.valid) {
                    return res.status(validation.status).json({ error: validation.message });
                }

                const { tp_id } = req.query;
                
                if (tp_id) {
                    // Get specific task package definition
                    const taskPackage = await this.db.getTaskPackage(tp_id);
                    if (!taskPackage) {
                        return res.status(404).json({ error: `Task package '${tp_id}' not found` });
                    }
                    
                    // Return form_url as stored in database (no path manipulation)
                    
                    res.json(taskPackage);
                } else {
                    // Get all task package definitions
                    const taskPackages = await this.db.getTaskPackages();
                    
                    // Return form_urls as stored in database (no path manipulation)
                    
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
                return { valid: true, user: 'admin' };
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
            const validationResult = await this.validateOIDCToken(token, expectedUser);
            
            if (!validationResult.valid) {
                return { 
                    valid: false, 
                    status: 403, 
                    message: 'Invalid token or unauthorized' 
                };
            }

            return { valid: true, user: validationResult.user };
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
     * Detect OIDC provider type and build appropriate userinfo endpoint
     */
    buildUserinfoUrl(baseUrl) {
        const url = baseUrl.toLowerCase();
        
        // Auth0
        if (url.includes('auth0.com')) {
            return `${baseUrl}/userinfo`;
        }
        
        // Microsoft Azure AD
        if (url.includes('microsoftonline.com') || url.includes('login.microsoft')) {
            return 'https://graph.microsoft.com/v1.0/me';
        }
        
        // Okta
        if (url.includes('okta.com') || url.includes('oktapreview.com')) {
            return `${baseUrl}/oauth2/v1/userinfo`;
        }
        
        // Google OAuth
        if (url.includes('googleapis.com') || url.includes('accounts.google.com')) {
            return 'https://www.googleapis.com/oauth2/v1/userinfo';
        }
        
        // AWS Cognito
        if (url.includes('amazoncognito.com')) {
            return `${baseUrl}/oauth2/userInfo`;
        }
        
        // Default to OIDC standard (Keycloak, generic OIDC providers)
        return `${baseUrl}/protocol/openid-connect/userinfo`;
    }

    /**
     * Validate token against OIDC provider and check tp_allowed
     */
    async validateOIDCToken(token, expectedUser) {
        try {
            // Build the userinfo endpoint URL from the base provider URL
            const baseUrl = this.config.keycloak_url.replace(/\/$/, ''); // Remove trailing slash
            const userinfoUrl = this.buildUserinfoUrl(baseUrl);

            console.log('🔐 Validating token against OIDC userinfo:', userinfoUrl);
            
            const response = await axios.get(userinfoUrl, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000
            });

            const userData = response.data;
            const username = userData.preferred_username || userData.email || userData.name || userData.sub;
            console.log('✅ OIDC validation successful for user:', username);
            
            // Check if user matches expected user (if provided)
            if (expectedUser && username !== expectedUser) {
                console.log('❌ User mismatch:', username, 'vs expected:', expectedUser);
                return { valid: false };
            }

            // For now, assume all authenticated users are authorized
            // In the future, you might check userData.tp_allowed array
            return { valid: true, user: username };
        } catch (error) {
            console.error('❌ Keycloak validation failed:', error.message);
            console.error('🔧 Keycloak URL being used:', this.config.keycloak_url);
            return { valid: false };
        }
    }
}

// Export singleton instance
module.exports = new TaskPackageAPI();
