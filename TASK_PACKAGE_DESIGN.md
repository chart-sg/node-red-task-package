# Node-RED Task Package Design Document

## Overview

The **node-red-task-package** module is a workflow orchestrator that provides a higher-layer abstraction for managing task execution flows. It enables external users to trigger Node-RED flows via REST API calls or internal events, with built-in security, lifecycle management capabilities, and a state machine-like architecture.

**Node Categories**:
The task package system organizes nodes into three distinct categories:

1. **🔄 TP Workflow Nodes**: Control the workflow lifecycle (tp-create, tp-start, tp-ongoing, tp-end, tp-cancel)
2. **🛠️ TP API Nodes**: Direct programmatic control via REST API (create-tp, cancel-tp)  
3. **📊 TP Data Nodes**: Handle data operations and utilities (tp-update-user-status, tp-data-get, tp-data-set, tp-delay)

**Enhanced Task Completion Handling**:
```javascript
const tpNodeUtils = require('../lib/tp-node-utils')
const tpc_id = msg.tp_data.tpc_id

// Validate task status - accept created, started, ongoing, cancelling
const allowedStatuses = ['ongoing', 'started', 'created', 'cancelling']
if (!allowedStatuses.includes(msg.tp_data.status)) {
    throw new Error(`Task has status '${msg.tp_data.status}' which is not valid for completion`)
}

// Determine final status
const active_tasks = flow.get('active_tasks') || []
const task = active_tasks.find(t => t.tpc_id === tpc_id)
const wasCancelled = (task && task.cancelled) || msg.tp_data.status === 'cancelling'
const finalStatus = wasCancelled ? 'cancelled' : 'completed'

// Display status with cleanup prefix if applicable
const isCleanup = tpNodeUtils.isCleanupFlow(msg)
const statusPrefix = isCleanup ? '[CLEANUP] ' : ''

if (finalStatus === 'cancelled') {
    node.status({fill: 'orange', shape: 'dot', text: `${statusPrefix}Cancelled: ${tpc_id.substr(0, 8)}...`})
} else {
    node.status({fill: 'green', shape: 'dot', text: `${statusPrefix}Completed: ${tpc_id.substr(0, 8)}...`})
}

// Update database and clean up task tracking
await taskPackageDB.updateTaskStatus(tpc_id, finalStatus)
if (task_index !== -1) {
    active_tasks.splice(task_index, 1)
    flow.set('active_tasks', active_tasks)
}
```fecycle management capabilities.

**Key Features**:
- **Interactive API Documentation**: Complete Swagger/OpenAPI documentation at `/task-package/docs`
- **Live Configuration Updates**: Configuration changes take effect immediately without Node-RED restart
- **Two-State Cancellation**: Proper cancellation flow with 'cancelling' → 'cancelled' states
- **Enhanced Validation**: Comprehensive request validation with proper error responses
- **Parallel Task Execution**: Multiple task packages can run simultaneously within the same flow
- **Event-Driven Cancellation**: Robust cancellation system with task-specific isolation
- **Cleanup Flow Handling**: Intelligent detection and handling of cancellation cleanup flows
- **Shared Node Utilities**: Common patterns for business logic nodes with consistent cancellation handling
- **Cancellation Isolation**: Task-specific cancellation prevents cross-task interference
- **Flexible Payload Handling**: Dynamic payload extraction with tp_id/user as control parameters
- **Auto-Discovery**: tp-cancel nodes automatically discover and monitor all active tasks
- **Database Synchronization**: Automatic task_packages table updates on deployment
- **OIDC Authorization**: User-based task package access control with tp_allowed filtering
- **State Machine Architecture**: Workflow state machine pattern with predictable state transitions

## Architecture

### State Machine Design Philosophy

The task package framework implements a **workflow state machine** architecture where:

**🔄 State Machine Characteristics**:
- **Clear States**: Created → Started → Ongoing → Ended (or Cancelled)
- **State Transitions**: Each TP Workflow node triggers specific state transitions
- **State Data**: Task context and user data managed through state transitions
- **Predictable Flow**: Well-defined progression through workflow states
- **Parallel Execution**: Multiple state machine instances can run simultaneously

**🎯 Implementation Pattern**:
- **Each task package instance** = One state machine instance with unique `tpc_id`
- **Node-RED flows** = Visual state transition logic and business rules
- **Database** = Persistent state storage with status tracking
- **Events** = State change notifications and coordination
- **API endpoints** = External state triggers and status queries

**🔄 State Transition Flow**:
```
API Call → Created → tp-start → Started → tp-ongoing → Ongoing → tp-end → Completed
                                   ↓                      ↓
API Cancel → Cancelling → tp-cancel → [cleanup] → tp-end → Cancelled
```

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   External      │    │   API Layer     │    │  Service Layer  │
│   Client        │────│  (Controller)   │────│  (Node-RED      │
│                 │    │                 │    │   Flows)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              │
                       ┌─────────────────┐
                       │   Security      │
                       │   Layer         │
                       │  (Keycloak)     │
                       └─────────────────┘
```

### Key Features

- **External API Access**: REST API endpoints for task lifecycle management
- **Parallel Task Support**: Multiple task packages can execute simultaneously per flow
- **Security Integration**: Keycloak-based authentication and authorization
- **Event-Driven Architecture**: Internal event system with proper event propagation
- **Schema Validation**: JSON schema validation for request payloads
- **Database Persistence**: SQLite-based task state management with auto-synchronization
- **Flexible Flow Design**: Modular node system with dual communication patterns
- **Auto-Discovery Cancellation**: tp-cancel nodes monitor all active tasks automatically
- **Dynamic Payload Extraction**: tp_id/user as control parameters, everything else as payload

## API Layer

### Security Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant OIDC
    participant Flow

    Client->>API: POST /task-package/start
    Note over Client,API: {tp_id, user, bearer_token}
    
    API->>API: Validate tp_id & user in payload
    
    alt OIDC URL configured
        API->>OIDC: GET /userinfo
        Note over API,OIDC: Bearer token validation
        OIDC->>API: User info with tp_allowed array
        API->>API: Check if tp_id in tp_allowed
    end
    
    API->>API: Generate tpc_id (UUID)
    API->>Flow: Publish event: task-package/start/{tp_id}
    API->>Client: Response with tpc_id
```

### REST Endpoints

#### Enhanced API Authorization with tp_allowed
**Purpose**: User-based task package access control

**Authorization Flow**:
1. **Token Validation**: Bearer token validated against OIDC provider userinfo endpoint
2. **User Identification**: Username extracted from `preferred_username`, `email`, `name`, or `sub` fields
3. **Authorization Check**: User's `tp_allowed` array checked against requested `tp_id`
4. **Filtering**: `/info` endpoint returns only authorized task packages for the user

**tp_allowed Structure**:
```json
{
    "preferred_username": "sbrow",
    "tp_allowed": ["tp01", "tp02", "tp03", "tp05"],
    "email": "sbrow@email.com"
}
```

**Authorization Behavior**:
- **Empty tp_allowed**: User has access to all task packages
- **Populated tp_allowed**: User restricted to specified task packages only
- **Missing tp_allowed**: User has access to all task packages
- **API Filtering**: Automatically filters results based on user permissions

#### Interactive API Documentation
**GET `/task-package/docs`**
- **Purpose**: Interactive Swagger UI documentation
- **Features**: Complete API documentation with "Try it out" functionality
- **Authentication**: Test Bearer token authentication directly in the UI
- **Examples**: Request/response examples for all endpoints

#### GET `/task-package/info`
**Purpose**: List available task package definitions OR get specific one with `?tp_id=`

**Query Parameters**:
- `tp_id` (optional): Get specific task package by ID

**Response Format**:
```json
[
    {
        "id": "tp01",
        "name": "Linen Delivery", 
        "form_url": "linen_delivery",
        "created_at": "2025-10-09T05:00:57Z",
        "updated_at": "2025-10-09T05:00:57Z"
    }
]
```

**Authorization Filtering**:
- Automatically filters results based on user's `tp_allowed` array
- Users without `tp_allowed` see all task packages
- Users with `tp_allowed` see only authorized task packages

#### GET `/task-package/status`
**Purpose**: Retrieve task instance status with optional filtering

**Query Parameters**:
- `tpc_id` (optional): Specific task instance ID
- `tp_id` (optional): Filter by task package ID
- `user` (optional): Filter by user
- `status` (optional): Filter by status (created, started, ongoing, completed, cancelling, cancelled, failed)

**Response Format**:
```json
[
    {
        "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
        "tp_id": "tp01",
        "tp_name": "Linen Delivery",
        "user": "admin",
        "status": "ongoing",
        "created_at": "2025-10-02T14:30:00Z",
        "updated_at": "2025-10-02T14:32:00Z"
    }
]
```

#### POST `/task-package/start`
**Purpose**: Initialize a new task package execution

**Request Body**:
```json
{
    "tp_id": "tp01",
    "user": "sbrow",
    "custom_field": "value",
    "another_field": 123,
    "complex_data": {
        "nested": "object"
    }
}
```

**Payload Processing**:
- `tp_id` and `user` are extracted as control parameters
- All other fields become `msg.payload` in the flow
- Supports dynamic, schema-free payload structures

**Headers**: 
- `Authorization: Bearer <token>` (if Keycloak configured)

**Response**:
```json
{
    "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "created"
}
```

#### POST `/task-package/cancel`
**Purpose**: Cancel a running task package (with comprehensive validation)

**Request Body**:
```json
{
    "tp_id": "tp01",
    "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "User requested cancellation"
}
```

**Validation Process**:
1. Verifies `tpc_id` exists in database
2. Validates `tpc_id` belongs to specified `tp_id`
3. Checks task is in cancellable state (not completed, cancelled, or failed)
4. Handles idempotent requests (already cancelling)

**Response**:
```json
{
    "status": "cancelling"
}
```

**Error Responses**:
- `400`: Missing parameters, task not cancellable, or tp_id mismatch
- `404`: Task instance not found
- `401/403`: Authentication/authorization errors

**Two-State Cancellation Flow**:
1. **API Call** → Database status: `'created'|'started'|'ongoing'` → `'cancelling'`
2. **Node-RED Flow** → Processes cancellation → tp-end updates to `'cancelled'`

## Service Layer (Node-RED Nodes)

### Node Categories and Palette Organization

The task package system organizes nodes into three functional categories for better user experience:

#### **🔄 TP Workflow Nodes**
**Purpose**: Control the workflow lifecycle of task packages
**Color Theme**: Dark red
**Nodes**:
- `tp-create` - Initiates a new workflow
- `tp-start` - Begins execution of a workflow  
- `tp-ongoing` - Marks workflow as in progress
- `tp-end` - Completes a workflow successfully
- `tp-cancel` - Terminates a workflow

#### **🛠️ TP API Nodes**
**Purpose**: Direct programmatic control via REST API
**Color Theme**: Light red (#FFCDD2)
**Nodes**:
- `tp-create-api` - Creates task packages via API calls (formerly call-tp)
- `tp-cancel-api` - Cancels task packages via API calls (formerly cancel-tp)

#### **📊 TP Data Nodes**
**Purpose**: Handle data operations and utilities within task packages
**Color Theme**: Green and Light red (#EF9A9A for tp-delay and tp-check-cancel)
**Nodes**:
- `tp-update-user-status` - Updates user status in tasks
- `tp-data-get` - Retrieves data from task packages
- `tp-data-set` - Sets/stores data in task packages  
- `tp-delay` - Adds delays/timing control to workflows
- `tp-check-cancel` - Checks for cancellation and routes flow accordingly

### Node Specifications

#### Configuration Node: `tp-config`
**Purpose**: Global configuration for task package system with live updates

**Configuration Properties**:
- `oidc_url`: OIDC provider URL (optional)
  - Auto-detects provider type (Keycloak, Auth0, Azure AD, Okta, Google, AWS Cognito)
  - Example: `http://10.233.0.80:8080/realms/chart-sandbox`
  - If empty, security layer is bypassed (defaults to 'admin' user)
- `db_url`: Database file path (default: `/tmp/sqlite`)

**Live Configuration Updates**:
- Configuration changes take effect immediately on deployment
- No Node-RED restart required
- First deployment: Full API initialization
- Subsequent deployments: Configuration update only
- Database connections are refreshed with new settings

#### Flow Control Nodes

##### `tp-create` (Entry Point)
- **Inputs**: None
- **Outputs**: 1 (main flow)
- **Purpose**: Entry point for task package flows

**Configuration**:
- `tp_id`: Unique task package identifier (e.g., "tp01")
- `tp_name`: Human-readable name (e.g., "Linen Delivery")  
- `tp_form_url`: Form endpoint path as stored in database (e.g., "/dashboard/linen_delivery")
- `tp_schema`: JSON schema for payload validation
- `auto_transition`: Automatically transition from 'created' to 'started' status

**Behavior**:
1. Listens to `task-package/start/{tp_id}` events
2. Filters by matching `tp_id`
3. Validates payload against `tp_schema` (if configured)
4. Updates database status to 'created'
5. If `auto_transition` is enabled, automatically transitions to 'started'
6. Stores task context in both node instance and flow context
7. Auto-updates task_packages table on deployment
8. Outputs `msg.tp_data` with task context and `msg.payload` with dynamic data

**Parallel Task Support**:
```javascript
// Node instance storage (for this specific task)
this.current_tpc_id = tpc_id
this.current_tp_id = this.tp_id
this.task_cancelled = false

// Flow context active tasks array (for multiple parallel tasks)
const active_tasks = flow.get('active_tasks') || []
active_tasks.push({
    tpc_id: tpc_id,
    tp_id: this.tp_id,
    tp_name: this.tp_name,
    start_node_id: node.id,
    started_at: new Date().toISOString()
})
flow.set('active_tasks', active_tasks)

// Legacy single-task context (backward compatibility)
flow.set('current_tpc_id', tpc_id)
flow.set('current_tp_id', this.tp_id)
flow.set('task_cancelled', false)
```

**Database Auto-Synchronization**:
```javascript
// Automatic task_packages table update on node deployment
taskPackageDB.upsertTaskPackage(this.tp_id, this.tp_name, this.tp_form_url)
```

##### `tp-start` (Workflow Transition)
- **Inputs**: 1 (from flow)
- **Outputs**: 1 (main flow)
- **Purpose**: Transitions task package status from 'created' to 'started'

**Configuration**:
- `name`: Optional custom name (defaults based on function)

**Behavior**:
1. Receives `msg.tp_data` from upstream tp-create node
2. Updates database status from 'created' to 'started'
3. Sets started_at timestamp
4. Passes message through unchanged
5. No auto-transition options (single clear purpose)

**Message Output**:
```javascript
msg.tp_data = {
    tpc_id: "550e8400-e29b-41d4-a716-446655440000",
    tp_id: "tp01",
    tp_name: "linen_delivery",
    user: "sbrow",
    status: "created",  // or "started" if auto_transition enabled
    mode: "start",
    created_at: "2025-09-16T10:30:00Z",
    updated_at: "2025-09-16T10:30:00Z"
}

msg.payload = {
    custom_field: "value",
    another_field: 123,
    complex_data: {
        nested: "object"
    }
    // Everything except tp_id and user from original request
}
```

##### `tp-end` (Exit Point)
- **Inputs**: 1 (from flow)
- **Outputs**: None
- **Purpose**: Terminate task package execution with enhanced cancellation state handling

**Behavior**:
1. Uses shared `tp-node-utils` for cleanup flow detection
2. Receives `msg.tp_data` via message passing from upstream nodes
3. Identifies specific task by `msg.tp_data.tpc_id`
4. Validates task status (accepts 'ongoing', 'started', 'created', 'cancelling')
5. Finds task in active_tasks array or checks legacy context
6. Determines final status: 'cancelled' if task was cancelled or status is 'cancelling', otherwise 'completed'
7. Updates database with final status
8. Displays appropriate status with cleanup prefix if applicable
9. Removes task from active_tasks array
10. Cleans up legacy context if this was the current task

**Parallel Task Handling**:
```javascript
const tpc_id = msg.tp_data.tpc_id
const active_tasks = flow.get('active_tasks') || []
const task_index = active_tasks.findIndex(task => task.tpc_id === tpc_id)

if (task_index !== -1) {
    const task = active_tasks[task_index]
    const wasCancelled = task.cancelled || false
    
    // Remove this specific task from active tasks
    active_tasks.splice(task_index, 1)
    flow.set('active_tasks', active_tasks)
    
    // Update database with final status
    const finalStatus = wasCancelled ? 'cancelled' : 'completed'
    await taskPackageDB.updateTaskStatus(tpc_id, finalStatus, message)
}
```

##### `tp-cancel` (Cancellation Handler)
- **Inputs**: None
- **Outputs**: 1 (cancellation flow)
- **Purpose**: Auto-discover and handle cancellation for all active tasks

**Behavior**:
1. **Auto-Discovery**: Monitors flow context for all active tasks
2. **Multi-Task Support**: Listens to cancel events for multiple tasks simultaneously  
3. **Dynamic Registration**: Automatically starts/stops listening as tasks start/finish
4. **Event Processing**: Processes `task-package/cancel/{tpc_id}` events
5. **Flow Context Updates**: Sets task-specific cancellation flags
6. **Status Reporting**: Shows count of monitored tasks in node status

**Parallel Task Monitoring**:
```javascript
// Track multiple task listeners
node._active_listeners = new Set() // Set of tpc_ids being monitored
node._event_handlers = new Map()   // Map of tpc_id -> {eventName, handler}

// Auto-discovery loop checks for new tasks
setInterval(() => {
    const active_tasks = flow.get('active_tasks') || []
    
    // Start listening to new tasks
    active_tasks.forEach(task => {
        if (!node._active_listeners.has(task.tpc_id)) {
            const handler = (payload) => handleCancelEvent.call(node, payload, task.tpc_id)
            const eventName = tpEvents.onCancel(task.tpc_id, handler)
            
            node._event_handlers.set(task.tpc_id, {eventName, handler})
            node._active_listeners.add(task.tpc_id)
        }
    })
    
    // Clean up listeners for completed tasks
    // ...
}, 1000)
```

**Cancellation Processing**:
```javascript
function handleCancelEvent(payload, tpc_id) {
    // Find specific task in active_tasks array
    const active_tasks = flow.get('active_tasks') || []
    const task_index = active_tasks.findIndex(task => task.tpc_id === tpc_id)
    
    if (task_index !== -1) {
        // Mark this specific task as cancelled
        const task = active_tasks[task_index]
        task.cancelled = true
        task.cancelled_at = new Date().toISOString()
        
        active_tasks[task_index] = task
        flow.set('active_tasks', active_tasks)
        
        // Output cancellation message
        node.send({
            tp_data: {
                tpc_id: tpc_id,
                tp_id: task.tp_id,
                mode: 'cancel',
                cancelled_at: task.cancelled_at
            },
            payload: payload.payload || {}
        })
    }
}
```

##### `tp-create-api` (API Control Node - TP API Category)
- **Inputs**: 1 (trigger message)
- **Outputs**: 1 (API response)
- **Purpose**: Programmatically create task packages via REST API calls
- **Category**: TP API Nodes
- **Color**: Light red theme (#FFCDD2)
- **Display Label**: "API - Create"

**Configuration**:
- `name`: Optional custom name (defaults to "API - Create")
- `tp_id`: Task package ID to create
- `auth_token`: Optional bearer token for authentication
- Fixed API endpoint URL

**Behavior**:
1. Receives trigger message with task package data
2. Makes HTTP POST request to `/task-package/start` endpoint
3. Includes Bearer token from configuration or message
4. Outputs API response with `tpc_id` and status
5. Handles authentication and authorization errors

##### `tp-cancel-api` (API Control Node - TP API Category)  
- **Inputs**: 1 (cancellation request)
- **Outputs**: 1 (API response)
- **Purpose**: Programmatically cancel task packages via REST API calls
- **Category**: TP API Nodes
- **Color**: Light red theme (#FFCDD2)
- **Display Label**: "API - Cancel"

**Configuration**:
- `name`: Optional custom name (defaults to "API - Cancel")
- `tp_id`: Optional task package ID (can be provided via message)
- `auth_token`: Optional bearer token for authentication
- Fixed API endpoint URL

**Behavior**:
1. Receives message with `tpc_id` to cancel
2. Makes HTTP POST request to `/task-package/cancel` endpoint
3. Validates required fields (`tp_id`, `tpc_id`)
4. Outputs API response with cancellation status
5. Handles validation and authorization errors
- **Inputs**: 1 (from flow)
- **Outputs**: None
- **Purpose**: Update user-defined status information

**Configuration**:
- `user_status`: Custom status message

**Behavior**:
1. Updates `user_status` column in database
2. Updates `updated_at` timestamp
3. Does not change main `status` field

#### Shared Utilities: `tp-node-utils.js`
**Purpose**: Provides shared utilities and patterns for business logic tp-nodes to ensure consistent cancellation handling and cleanup flow detection.

**Key Functions**:
- `isCleanupFlow(msg)`: Detects if a message is part of a cleanup flow
- `isTaskCancelled(msg, flow)`: Checks if a specific task is cancelled
- `markAsCleanup(msg)`: Marks a message as part of a cleanup flow
- `handleCancellableNode(node, msg, flow, businessLogic)`: General pattern for cancellable nodes

**Cleanup Flow Detection**:
```javascript
function isCleanupFlow(msg) {
    return msg && (
        msg.cleanup === true ||                    // Explicit cleanup flag
        msg.topic === 'delay-cancelled' ||        // From tp-delay cancelled output
        (msg.tp_data && msg.tp_data.mode === 'cancel') ||  // From tp-cancel
        msg._isCleanupFlow === true               // Internal cleanup marker
    )
}
```

**Task-Specific Cancellation**:
```javascript
function isTaskCancelled(msg, flow) {
    if (!msg || !msg.tp_data || !msg.tp_data.tpc_id) return false
    
    const tpc_id = msg.tp_data.tpc_id
    const active_tasks = flow.get('active_tasks') || []
    const task = active_tasks.find(t => t.tpc_id === tpc_id)
    
    return task && task.cancelled
}
```

**General Pattern for Business Logic Nodes**:
```javascript
function handleCancellableNode(node, msg, flow, businessLogic) {
    // Check if this is a cleanup flow - if so, process normally
    if (isCleanupFlow(msg)) {
        node.status({fill: 'blue', shape: 'dot', text: '[CLEANUP] Processing'})
        return businessLogic(msg)
    }
    
    // For non-cleanup flows, check cancellation
    if (isTaskCancelled(msg, flow)) {
        node.status({fill: 'orange', shape: 'dot', text: 'Task cancelled'})
        return // Don't process cancelled tasks
    }
    
    // Normal processing
    return businessLogic(msg)
}
```

##### `tp-delay` (Cancellable Delay)
- **Inputs**: 1 (from flow)
- **Outputs**: 2 (success, cancelled)
- **Purpose**: Introduce time delays with cancellation support and cleanup flow handling

**Configuration**:
- `delay_time`: Delay duration in milliseconds

**Behavior**:
1. Uses shared `tp-node-utils` for consistent cancellation handling
2. Detects cleanup flows and processes them normally (no cancellation check)
3. For non-cleanup flows, monitors task-specific cancellation via active_tasks array
4. Supports both new parallel format and legacy single-task format
5. Output 1: Normal completion after delay
6. Output 2: Early termination due to cancellation (marked as cleanup flow)
7. Cancellation isolation: Only checks specific task's cancellation status

**Enhanced Cancellation and Cleanup Handling**:
```javascript
const tpNodeUtils = require('../lib/tp-node-utils')

// Check if this is a cleanup flow - if so, process normally
if (tpNodeUtils.isCleanupFlow(msg)) {
    node.status({fill: 'blue', shape: 'dot', text: '[CLEANUP] Delaying...'})
    // Process delay normally without cancellation checks
    const timer = setTimeout(() => {
        send([{...msg, _isCleanupFlow: true}, null])
        done()
    }, delayTime)
    return
}

// For non-cleanup flows, monitor task-specific cancellation
const cancelCheck = setInterval(() => {
    if (tpNodeUtils.isTaskCancelled(msg, flow)) {
        clearTimeout(timer)
        clearInterval(cancelCheck)
        
        // Mark as cleanup flow and output to cancelled port
        const cancelledMsg = tpNodeUtils.markAsCleanup({...msg, topic: 'delay-cancelled'})
        send([null, cancelledMsg])
        done()
    }
}, 100)
```

**Cancellation Isolation and Cleanup Flows**:
- Each task's cancellation state is completely isolated using task-specific `tpc_id`
- Cancelled tasks can route to cleanup flows with more tp-delay nodes
- Cleanup flows are automatically detected and processed normally (no cancellation interference)
- Cleanup flow markers: `cleanup: true`, `topic: 'delay-cancelled'`, `tp_data.mode: 'cancel'`, `_isCleanupFlow: true`
- Supports complex cancellation workflows with multi-step cleanup processes
- Shared utilities ensure consistent behavior across all business logic nodes

##### `tp-check-cancel` (Cancellation Router)
- **Inputs**: 1 (from flow)
- **Outputs**: 2 (pass, cancelled)
- **Purpose**: Check for cancellation and route flow accordingly
- **Category**: TP Data Nodes
- **Color**: #EF9A9A (same as tp-delay)

**Configuration**:
- `name`: Optional custom name (defaults to "Check Cancel")

**Behavior**:
1. Receives incoming message with `msg.tp_data.tpc_id`
2. Checks task-specific cancellation state from flow context
3. Routes to appropriate output based on cancellation status
4. Supports cleanup flow detection (bypasses cancellation check)
5. Adds cancellation metadata to cancelled messages

**Output Routing**:
- **Output 1 (Pass)**: Message continues if task is still active
- **Output 2 (Cancelled)**: Message routed here if task was cancelled

**Use Case**:
Enables non-task package nodes to react to cancellation events by routing flow to failure/cleanup sequences.

**Enhanced Cancellation Metadata**:
```javascript
// Cancelled output includes additional metadata
{
    ...original_message,
    tp_cancelled: true,
    tp_cancel_reason: 'Task package was cancelled',
    tp_cancel_timestamp: new Date().toISOString()
}
```

**Cleanup Flow Support**:
- Cleanup flows are detected and always route to Pass output
- Supports complex cancellation workflows with nested tp-check-cancel nodes
- Maintains consistency with other task package cancellation patterns

#### Data Storage Nodes (TP Data Category)

##### `tp-data-store` (Task Data Storage - TP Data Category)
- **Inputs**: 1 (data to store)
- **Outputs**: 1 (pass-through)
- **Purpose**: Store task data in global context for cross-flow sharing
- **Category**: TP Data Nodes
- **Color**: Green theme

**Configuration**:
- `storage_key`: Key field path in message (default: `tp_data.tpc_id`)
- `ttl_minutes`: Time-to-live in minutes (default: 60)
- `cleanup_interval`: Cleanup interval in minutes (default: 5)

**Behavior**:
1. Extracts storage key from incoming message using dot notation
2. Stores entire message in global context with TTL metadata
3. Automatically cleans up expired entries
4. Passes message through unchanged

**Storage Structure**:
```javascript
// Global context storage
globalContext.set('tp-data-store', {
    'tpc_123': {
        data: {msg}, // Complete message object
        expires_at: 1726657200000, // Timestamp
        stored_at: 1726653600000
    }
})
```

##### `tp-data-get` (Task Data Retrieval - TP Data Category)
- **Inputs**: 1 (lookup request)
- **Outputs**: 1 (enriched data)
- **Purpose**: Retrieve stored task data and merge with current message
- **Category**: TP Data Nodes
- **Color**: Green theme

**Configuration**:
- `key_field`: Key field path in message (default: `tp_data.tpc_id`)
- `output_field`: Output field path (default: `stored_data`)
- `fail_on_missing`: Fail if data not found (default: true)
- `cleanup_on_get`: Remove data after retrieval (default: false)

**Behavior**:
1. Extracts lookup key from incoming message
2. Retrieves stored data from global context
3. Checks TTL and removes expired data
4. Merges stored data into output field using dot notation
5. Optionally removes data after retrieval

**Output Structure**:
```javascript
// Enhanced message with stored data
{
    ...original_message,
    stored_data: {
        tp_data: {...},
        payload: {...},
        // Complete stored message
    }
}
```

### Event System

#### Dual Communication Architecture
Task package nodes use two communication patterns:

**1. Message Passing (Data Flow)**:
- Primary method for passing task data through the flow
- `msg.tp_data` contains task metadata
- `msg.payload` contains dynamic user data
- Standard Node-RED message flow

**2. Flow Context (Coordination)**:
- Used for task coordination and cancellation signaling
- Supports both parallel tasks (active_tasks array) and legacy single-task format
- Enables auto-discovery and cross-node communication

#### Parallel Task Context Structure
```javascript
// Flow context stores array of active tasks
active_tasks: [
    {
        tpc_id: "550e8400-e29b-41d4-a716-446655440000",
        tp_id: "tp01",
        tp_name: "linen_delivery", 
        start_node_id: "node_abc123",
        started_at: "2025-09-16T10:30:00Z",
        cancelled: false,              // Set to true when cancelled
        cancelled_at: "2025-09-16T10:35:00Z"  // Set when cancelled
    },
    {
        tpc_id: "660f9500-f39c-52e5-b827-557766551111",
        tp_id: "tp02",
        tp_name: "medicine_delivery",
        start_node_id: "node_def456", 
        started_at: "2025-09-16T10:32:00Z",
        cancelled: false
    }
    // ... more parallel tasks
]

// Legacy context (for backward compatibility)
current_tpc_id: "550e8400-e29b-41d4-a716-446655440000"  // Most recent task
current_tp_id: "tp01"
task_cancelled: false  // Legacy flag
```

#### Event Flow Coordination
```javascript
// tp-start: Store task in both formats
this.current_tpc_id = tpc_id                    // Node instance
active_tasks.push({tpc_id, tp_id, ...})         // Flow context array
flow.set('current_tpc_id', tpc_id)              // Legacy context

// tp-cancel: Monitor all active tasks
const active_tasks = flow.get('active_tasks') || []
active_tasks.forEach(task => {
    // Listen for cancel events for each task
    tpEvents.onCancel(task.tpc_id, handler)
})

// tp-delay: Check task-specific cancellation
const task = active_tasks.find(t => t.tpc_id === msg.tp_data.tpc_id)
if (task && task.cancelled) { /* handle cancellation */ }

// tp-end: Remove completed task
const task_index = active_tasks.findIndex(task => task.tpc_id === tpc_id)
active_tasks.splice(task_index, 1)              // Remove from array
```

#### Event Topics
- `task-package/start/{tp_id}`: Task initiation events
- `task-package/cancel/{tpc_id}`: Task-specific cancellation events

#### Event Payloads
**Start Event Payload**:
```javascript
{
    tpc_id: "550e8400-e29b-41d4-a716-446655440000",
    tp_id: "tp01", 
    user: "sbrow",
    payload: {
        // All fields except tp_id and user from original request
        custom_field: "value",
        another_field: 123
    }
}
```

**Cancel Event Payload**:
```javascript
{
    tp_id: "tp01",
    tpc_id: "550e8400-e29b-41d4-a716-446655440000", 
    user: "sbrow",
    cancelled_by: "sbrow",
    cancelled_at: "2025-09-16T10:35:00Z",
    payload: {
        // Original cancel request fields
    }
}
```

## Database Schema

### Table: `task_packages`
**Purpose**: Registry of available task package definitions

```sql
CREATE TABLE IF NOT EXISTS task_packages (
    id TEXT PRIMARY KEY NOT NULL,       -- tp_id
    name TEXT NOT NULL,                 -- tp_name  
    form_url TEXT                       -- tp_form_url
);
```

**Data Management**:
- Auto-updated on every Node-RED deployment via tp-start nodes
- One record per `tp-start` node configuration
- Prevents duplicate `tp_id` values
- Synchronizes tp_name changes automatically

### Table: `task_packages_created`
**Purpose**: Execution instances of task packages

```sql
CREATE TABLE IF NOT EXISTS task_packages_created (
    id UUID PRIMARY KEY NOT NULL,              -- tpc_id
    tp_id TEXT NOT NULL,                       -- Reference to task_packages.id
    tp_name TEXT NOT NULL,                     -- Cached from task_packages
    user TEXT,                                 -- Requesting user
    user_status TEXT,                          -- Custom status from tp-update-user-status
    status TEXT NOT NULL DEFAULT 'created',   -- System status
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Status Values**:
- `created`: Initial state (API layer)
- `started`: Task instance initiated (tp-start)
- `ongoing`: Task actively executing
- `cancelling`: Cancellation requested but not yet completed (API cancel endpoint)
- `cancelled`: Cancellation completed (tp-end after processing cancel event)
- `completed`: Normal completion (tp-end)
- `failed`: Task failed with error

## Flow Patterns

### Parallel Task Execution
```
Flow 1: [tp-start:tp01] ──→ [business logic A] ──→ [tp-end]
Flow 2: [tp-start:tp02] ──→ [business logic B] ──→ [tp-end]

[tp-cancel] ──→ [cleanup logic]  // Monitors both tasks automatically
```
*Note: Single tp-cancel node can monitor multiple parallel tasks*

### Complex Parallel Flow with Delays
```
Task A: [tp-start:tp01] ──→ [logic-1] ──→ [tp-delay] ──→ [logic-2] ──→ [tp-end]
                                            │
                                            └─→ [timeout cleanup A]

Task B: [tp-start:tp02] ──→ [step-1] ──→ [tp-delay] ──→ [step-2] ──→ [tp-end]
                                         │
                                         └─→ [timeout cleanup B]

[tp-cancel] ──────────────────────→ [global cleanup]  // Monitors both tasks
```
*Note: Each tp-delay checks its specific task's cancellation status*

### Mixed Legacy and Parallel Support
```
[tp-start] ──→ [logic] ──→ [legacy tp-delay] ──→ [tp-end]
                           │
                           └─→ [handles both formats]

[tp-cancel] ──→ [cleanup]  // Works with both old and new context formats
```

### Status Reporting Flow
```
[tp-start] ──→ [step-1] ──→ [tp-update-user-status] ──→ [step-2] ──→ [tp-end]
                                │
                                └─→ (status: "processing step 1")
```

### Cross-Flow Data Sharing
```
Flow 1: [tp-start] ──→ [business logic] ──→ [tp-data-store] ──→ [tp-end]

Flow 2: [tp-cancel] ──→ [tp-data-get] ──→ [cleanup with stored data]
                         │
                         └─→ enriched with original task data
```

### Cleanup Flow Patterns
```
Main Flow:    [tp-start] ──→ [tp-delay] ──→ [business logic] ──→ [tp-end]
                              │
                              └─→ [cleanup step 1] ──→ [tp-delay] ──→ [cleanup step 2] ──→ [tp-end]
                                                          │
Cancel Flow:  [tp-cancel] ──→ [cleanup step A] ──→ [tp-delay] ──→ [cleanup step B] ──→ [tp-end]
```
*Note: All cleanup tp-delay nodes process normally regardless of cancellation status*

### Cancellation Detection with tp-check-cancel
```
[tp-create] ──→ [custom logic] ──→ [tp-check-cancel] ──→ [normal flow] ──→ [tp-end]
                                        │
                                        └─→ [failure cleanup] ──→ [tp-end]
```
*Note: Enables non-task package nodes to detect and react to cancellation*

### Complex Cancellation with Multi-Step Cleanup
```
Task: [tp-start] ──→ [reserve resource] ──→ [tp-delay:processing] ──→ [complete] ──→ [tp-end]
                                              │
                                              └─→ [release resource] ──→ [tp-delay:cleanup] ──→ [notify] ──→ [tp-end]
                                                                          │
[tp-cancel] ──→ [emergency cleanup] ──→ [tp-delay:emergency] ──→ [final cleanup] ──→ [tp-end]
```
*Note: Each cleanup flow operates independently without cancellation interference*

### Complex Data Persistence Pattern
```
Main Flow:   [tp-start] ──→ [tp-data-store] ──→ [process] ──→ [tp-end]
                            │
Cancel Flow: [tp-cancel] ──→ [tp-data-get] ──→ [restore state] ──→ [cleanup]
Update Flow: [external] ──→ [tp-data-get] ──→ [status check] ──→ [respond]
```

## API Documentation and Testing

### Interactive Swagger Documentation
Access complete API documentation at `/task-package/docs`:

**Features**:
- **Interactive Testing**: "Try it out" functionality for all endpoints
- **Authentication Support**: Bearer token input for testing secured endpoints
- **Request/Response Examples**: Complete examples with realistic data
- **Schema Validation**: Request/response schema documentation
- **Error Code Documentation**: Complete error response documentation

**Testing Workflow**:
1. Navigate to `http://your-node-red:1880/task-package/docs`
2. Expand desired endpoint
3. Click "Try it out"
4. Fill in parameters and request body
5. Add Bearer token if authentication is enabled
6. Execute request and view response

### API Dependencies
Required npm packages for API documentation:
```json
{
  "swagger-ui-express": "^4.6.0",
  "swagger-jsdoc": "^6.2.0"
}
```

### Configuration Testing
**Without Authentication**:
- Leave `oidc_url` empty in tp-config
- All requests are treated as 'admin' user
- Perfect for development and testing

**With Authentication**:
- Configure `oidc_url` in tp-config
- Deploy changes (takes effect immediately)
- Test with valid Bearer tokens in Swagger UI

## Security Model

### OIDC Integration
When `oidc_url` is configured in `tp-config`:

1. **Auto-Detection**: Automatically detects OIDC provider type (Keycloak, Auth0, Azure AD, Okta, Google, AWS Cognito)
2. **Token Validation**: Bearer tokens validated against the OIDC provider's userinfo endpoint
3. **Authorization Check**: User's `tp_allowed` array checked for `tp_id`
4. **User Context**: User information attached to task execution

### Supported OIDC Providers
- **Keycloak**: Auto-detects `/protocol/openid-connect/userinfo` endpoint
- **Auth0**: Auto-detects `/userinfo` endpoint
- **Azure AD**: Auto-detects `/oidc/userinfo` endpoint
- **Okta**: Auto-detects `/v1/userinfo` endpoint
- **Google**: Uses `https://www.googleapis.com/oauth2/v2/userinfo`
- **AWS Cognito**: Auto-detects `/oauth2/userInfo` endpoint

### Sample OIDC Response
```json
{
    "tp_allowed": ["tp01", "tp02", "tp03"],
    "sub": "9cc6a977-c4e2-4516-bdf0-56830f2261f4",
    "email_verified": true,
    "name": "Sandra Brow Brow",
    "preferred_username": "sbrow",
    "expoPushToken": "ExponentPushToken[pMG_cyAmfUGv5jdhD8EALT]",
    "given_name": "Sandra Brow",
    "job_title": "Staff Nurse", 
    "family_name": "Brow",
    "email": "sbrow@email.com",
    "group": ["/ed/user"]
}
```

### Security Bypass
When `oidc_url` is not configured, the security layer is completely bypassed for development/testing scenarios.

## Implementation Notes

### Parallel Task Architecture
The system supports multiple concurrent task packages through a dual-context approach:

**Active Tasks Array** (New - Primary):
```javascript
// Supports unlimited parallel tasks
flow.set('active_tasks', [
    {tpc_id: "task1", tp_id: "tp01", cancelled: false},
    {tpc_id: "task2", tp_id: "tp02", cancelled: false}, 
    {tpc_id: "task3", tp_id: "tp01", cancelled: true}
])
```

**Legacy Context** (Backward Compatibility):
```javascript
// Single task tracking (for existing flows)
flow.set('current_tpc_id', 'most_recent_task_id')
flow.set('task_cancelled', false)
```

### Auto-Discovery Cancellation System
tp-cancel nodes automatically discover and monitor all active tasks:

1. **Periodic Discovery**: Checks active_tasks array every 1000ms
2. **Dynamic Registration**: Starts listening to new tasks automatically
3. **Automatic Cleanup**: Removes listeners for completed tasks
4. **Status Reporting**: Shows "Monitoring X task(s)" in node status
5. **Event Handlers**: Maintains Map of tpc_id → {eventName, handler}

### Database Auto-Synchronization
Task package definitions sync automatically:

```javascript
// tp-start nodes auto-update task_packages table on deployment
async function nodeInstance(config) {
    // ... node setup
    
    // Auto-sync on deployment
    setTimeout(async () => {
        try {
            const taskPackageDB = require('../lib/task-package-db')
            await taskPackageDB.upsertTaskPackage(this.tp_id, this.tp_name, this.tp_form_url)
        } catch (error) {
            this.warn(`Failed to update task package in database: ${error.message}`)
        }
    }, 2000)
}
```

### Dynamic Payload Processing
API layer separates control and data parameters:

```javascript
// API request body
{
    "tp_id": "tp01",      // Control parameter
    "user": "admin",      // Control parameter  
    "field1": "value1",   // Data parameter
    "field2": "value2"    // Data parameter
}

// Processed in API
const { tp_id, user, ...payload } = req.body

// Emitted to flow
taskPackageEvents.emitStart(tp_id, {
    tpc_id, tp_id, user,
    payload: payload      // {field1: "value1", field2: "value2"}
})

// Received in tp-start
msg.tp_data = {id: tpc_id, tp_id, user, ...}
msg.payload = {field1: "value1", field2: "value2"}
```

### Node Registration
All task package nodes should appear in a dedicated palette category (e.g., "Task Package").

### Database Initialization
Tables are created automatically by the API layer on first startup.

### Event Bus
Internal event system uses Node-RED's native message passing with standardized topic patterns.

### Error Handling
- Invalid `tp_id`: Return 400 Bad Request
- Unauthorized `tp_id`: Return 403 Forbidden  
- Invalid `tpc_id`: Return 404 Not Found
- Schema validation failure: Return 422 Unprocessable Entity
- **Event System Failures**: Logged but don't break flow execution
- **Parallel Task Conflicts**: Each task maintains independent state
- **Database Sync Failures**: Logged as warnings, don't prevent flow execution
- **Cleanup Flow Failures**: Cleanup flows continue processing regardless of main task cancellation
- **Cancellation Isolation**: Failed cancellation in one task doesn't affect others
- **Invalid Task Status**: tp-end validates status and provides clear error messages

### Deployment Considerations
- Database file permissions and persistence
- Network accessibility for external API calls  
- Keycloak endpoint availability and configuration
- Node-RED dashboard URL construction
- **Flow Context Memory**: active_tasks array grows with parallel execution
- **Event Listener Cleanup**: Automatic cleanup prevents memory leaks
- **Backward Compatibility**: Legacy flows continue working without modification

## Future Enhancements

### Planned Features
- Task package templates and inheritance
- Advanced retry and error handling  
- Metrics and monitoring integration
- Webhook notifications for task completion
- Multi-tenant support with workspace isolation
- **Performance Optimizations**: Batch event processing for high-throughput scenarios
- **Advanced Monitoring**: Real-time task execution dashboards
- **Cross-Flow Communication**: Task packages spanning multiple flows
- **Priority Queuing**: Task execution priority management

### Recently Implemented (v2.5)
- ✅ **Node Refactoring**: Renamed call-tp → tp-create-api and cancel-tp → tp-cancel-api with "API - Create/Cancel" branding
- ✅ **tp-start Simplification**: Removed auto_transition field (clear single purpose: 'created' → 'started')
- ✅ **tp-create Enhancement**: Refactored auto_start → auto_transition, removed auto_ongoing field
- ✅ **tp-check-cancel Node**: Added cancellation detection and routing node for non-task package flows
- ✅ **Workflow Clarity**: Clear separation between tp-create (entry + optional auto-transition) and tp-start (explicit transition)
- ✅ **EDT Node System**: Added Event Driven Trigger nodes (edt-state, edt-filter, edt-mode) in staging area

### Recently Implemented (v2.4)
- ✅ **Node Category Organization**: Organized nodes into TP Workflow, TP API, and TP Data categories
- ✅ **Enhanced API Authorization**: Implemented tp_allowed user-based access control with automatic filtering
- ✅ **Database Field Mapping Fix**: Corrected tp_id/id field mapping in authorization filtering
- ✅ **API Control Nodes**: Added create-tp and cancel-tp nodes for programmatic API control
- ✅ **State Machine Documentation**: Formalized state machine architecture and design patterns
- ✅ **Authorization Debug Enhancement**: Improved debugging for tp_allowed authorization flow
- ✅ **Response Format Updates**: Updated API responses to match actual database schema
- ✅ **OIDC Provider Detection**: Enhanced auto-detection for multiple OIDC provider types
- ✅ **Clean Logging**: Removed debug logs and emojis for production-ready output

### Previous Releases (v2.3)
- ✅ **Interactive API Documentation**: Complete Swagger/OpenAPI documentation with interactive UI
- ✅ **Live Configuration Updates**: Configuration changes take effect without Node-RED restart
- ✅ **Enhanced API Validation**: Comprehensive request validation for cancel endpoint
- ✅ **Two-State Cancellation**: Proper 'cancelling' → 'cancelled' state flow
- ✅ **Improved Cancellation Isolation**: Task-specific cancellation without global interference
- ✅ **Shared Node Utilities**: tp-node-utils.js with common patterns for business logic nodes
- ✅ **Cleanup Flow Detection**: Intelligent detection and handling of cancellation cleanup flows
- ✅ **Enhanced tp-delay**: Cleanup flow support with cancellation isolation
- ✅ **Enhanced tp-end**: Improved status validation and cleanup flow handling
- ✅ **API Endpoint Reorganization**: Renamed GET '/' to '/info' for better API structure
- ✅ **Default User Enhancement**: Changed anonymous to 'admin' when auth disabled
- ✅ **Status Enum Updates**: Added 'cancelling' state to status filtering
- ✅ **Error Response Improvements**: Enhanced error responses with current status information

### Integration Points
- **RMF Nodes**: Task packages can orchestrate robot tasks
- **ROS2 Nodes**: Integration with ROS2 ecosystem
- **External Systems**: REST API enables integration with any external system
- **Dashboards**: Form-based user interfaces for task initiation

## Development Workflow

### Adding New Task Package Nodes
1. Create node implementation in `nodes/` directory
2. Follow existing naming convention (`tp-{function}.js`)
3. Implement event listening for cancellation support
4. Update database status appropriately
5. Add comprehensive error handling
6. Update this documentation

### Testing Strategy
- Unit tests for individual node behavior
- Integration tests for complete task package flows
- **Parallel Execution Tests**: Multiple concurrent tasks
- **Cancellation Tests**: Task-specific and cross-task cancellation
- Security testing with/without Keycloak
- Performance testing with concurrent task executions
- Database integrity validation
- **Event System Tests**: Event propagation and handler cleanup
- **Backward Compatibility Tests**: Legacy flow compatibility

### Performance Considerations
- **Memory Management**: active_tasks array cleanup and listener management
- **Event Handler Cleanup**: Automatic removal of completed task listeners  
- **Database Efficiency**: Batch operations and connection pooling
- **Concurrent Request Handling**: API layer supports multiple simultaneous requests
- **Flow Context Optimization**: Efficient array operations for large task counts

---

*This document serves as the authoritative reference for the node-red-task-package module design and implementation.*

**Document Version**: 2.5  
**Last Updated**: October 10, 2025  
**Key Changes**: Renamed API control nodes (call-tp → tp-create-api, cancel-tp → tp-cancel-api) with clear "API - Create/Cancel" branding. Simplified tp-start to single purpose (removed auto_transition). Enhanced tp-create with auto_transition field (renamed from auto_start) and removed auto_ongoing. Added tp-check-cancel node for cancellation detection in non-task package flows. Added Event Driven Trigger (EDT) node system for event-based task automation.
