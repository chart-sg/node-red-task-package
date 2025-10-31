# Node-RED Task Package

A workflow orchestrator that provides a higher-layer abstraction for managing task execution flows. It enables external users to trigger Node-RED flows via REST API calls or internal events, with built-in security, validation, and lifecycle management capabilities.

## Overview

The **node-red-task-package** module provides:

- **External API Access**: REST API endpoints for task lifecycle management
- **Interactive API Documentation**: Complete Swagger/OpenAPI documentation at `/task-package/docs`
- **Security Integration**: OIDC-based authentication and authorization (Keycloak, Auth0, Azure AD, etc.)
- **Event-Driven Architecture**: Internal event system for node communication
- **Schema Validation**: JSON schema validation for request payloads
- **Database Persistence**: SQLite-based task state management with auto-synchronization
- **Parallel Task Execution**: Multiple task packages can run simultaneously within the same flow
- **Event-Driven Cancellation**: Robust cancellation system with task-specific isolation
- **State Machine Architecture**: Workflow state machine pattern with predictable state transitions
- **Event-Driven Tasks (EDT)**: Real-time sensor data processing and automated task management
- **Flexible Payload Handling**: Dynamic payload extraction with tp_id/user as control parameters
- **Live Configuration Updates**: Configuration changes take effect immediately without Node-RED restart

## Installation

### From npm (when published)
```bash
npm install @chart/node-red-task-package
```

### Local Development
```bash
cd ~/.node-red
npm install /path/to/node-red-task-package
```

## Available Nodes

The task package system organizes nodes into four distinct categories:

### Configuration Node: `tp-config`
Global configuration for the task package system with settings for:
- OIDC provider URL (Keycloak, Auth0, Azure AD, Okta, Google, AWS Cognito)
- Database file path
- Live configuration updates (no Node-RED restart required)

### 🔄 TP Workflow Nodes
**Purpose**: Control the workflow lifecycle of task packages
**Color Theme**: Dark red

#### `tp-start` (Entry Point)
- **Inputs**: None (event-driven)
- **Outputs**: 1 (main flow)
- **Purpose**: Entry point for task package flows
- **Features**: Schema validation, flow context storage, database integration, auto-transition support

#### `tp-cancel` (Cancellation Handler) 
- **Inputs**: None (auto-discovery)
- **Outputs**: 1 (cancellation flow)
- **Purpose**: Handle task package cancellation
- **Features**: Automatic task discovery, parallel task monitoring, no input connections required

#### `tp-end` (Exit Point)
- **Inputs**: 1 (from flow)
- **Outputs**: None
- **Purpose**: Terminate task package execution
- **Features**: Status determination (completed/cancelled), database updates, cleanup flow detection

#### `tp-update` (Event Update)
- **Inputs**: 1 (from flow)
- **Outputs**: 1 (main flow)
- **Purpose**: Event-driven node for external update API calls
- **Features**: Minimal configuration, follows tp-cancel pattern, workflow lifecycle management

### 🛠️ TP API Nodes
**Purpose**: Direct programmatic control via REST API
**Color Theme**: Light red (#FFCDD2)

#### `tp-create-api` (API - Create)
- **Inputs**: 1 (trigger message)
- **Outputs**: 1 (API response)
- **Purpose**: Programmatically create task packages via REST API calls
- **Features**: Bearer token authentication, API response handling

#### `tp-cancel-api` (API - Cancel)
- **Inputs**: 1 (cancellation request)
- **Outputs**: 1 (API response)
- **Purpose**: Programmatically cancel task packages via REST API calls
- **Features**: Validation, authorization, error handling

#### `tp-update-api` (API - Update)
- **Inputs**: 1 (trigger message)
- **Outputs**: 1 (API response)
- **Purpose**: API control node for programmatic task updates
- **Features**: Flexible targeting, REST API integration, Bearer token authentication

### 📊 TP Data Nodes
**Purpose**: Handle data operations and utilities within task packages
**Color Theme**: Green and Light red (#EF9A9A for delay/check nodes)

#### `tp-update-user-status` (Status Update)
- **Inputs**: 1 (from flow)  
- **Outputs**: None
- **Purpose**: Update user-defined status information
- **Features**: Custom status messages, database integration

#### `tp-data-get` (Data Retrieval)
- **Inputs**: 1 (lookup request)
- **Outputs**: 1 (enriched data)
- **Purpose**: Retrieve stored task data and merge with current message
- **Features**: TTL checking, dot notation field paths, cleanup options

#### `tp-data-set` (Data Storage)
- **Inputs**: 1 (data to store)
- **Outputs**: 1 (pass-through)
- **Purpose**: Store task data in global context for cross-flow sharing
- **Features**: TTL management, automatic cleanup, flexible key extraction

#### `tp-delay` (Cancellable Delay)
- **Inputs**: 1 (from flow)
- **Outputs**: 2 (success, cancelled)
- **Purpose**: Introduce time delays with cancellation support
- **Features**: Dual outputs, cancellation monitoring, cleanup flow handling

#### `tp-check-cancel` (Cancellation Router)
- **Inputs**: 1 (from flow)
- **Outputs**: 2 (pass, cancelled)
- **Purpose**: Check for cancellation and route flow accordingly
- **Features**: Task-specific cancellation detection, cleanup flow support

### 🎛️ Event-Driven Tasks (EDT) Nodes
**Purpose**: Real-time sensor data processing and automated task management
**Color Theme**: Blue

#### `edt-state` (Memory & Change Detection)
- **Inputs**: 1 (sensor data)
- **Outputs**: 1 (enriched with change analysis)
- **Purpose**: Tracks changes over time for any monitored entity
- **Features**: State memory, change detection, flexible entity tracking, TTL management

#### `edt-filter` (Quality Control & Spam Prevention)
- **Inputs**: 1 (from edt-state)
- **Outputs**: 1 (filtered events)
- **Purpose**: Blocks polling duplicates, noise, and insignificant events
- **Features**: Duplicate prevention, significance thresholds, spam filtering

#### `edt-mode` (Dynamic On/Off Control)
- **Inputs**: 1 (from flow)
- **Outputs**: 2 (enabled messages, status updates)
- **Purpose**: Runtime enable/disable of EDT processing for specific entities via API
- **Features**: API control, entity field extraction, bulk operations, real-time notifications

## API Endpoints

### Interactive API Documentation
**GET `/task-package/docs`**
- **Purpose**: Interactive Swagger UI documentation
- **Features**: Complete API documentation with "Try it out" functionality
- **Authentication**: Test Bearer token authentication directly in the UI

### Task Package Information
**GET `/task-package/info`**
List available task package definitions OR get specific one with `?tp_id=`
- **Authorization**: Automatically filters results based on user's `tp_allowed` array
- **Query Parameters**: `tp_id` (optional)

### Task Status Management
**GET `/task-package/status`**
Retrieve task instance status with optional filtering
- **Query Parameters**: `tpc_id`, `tp_id`, `user`, `status` (all optional)
- **Filtering**: Supports multiple filter combinations

### Task Lifecycle Operations
**POST `/task-package/start`**
Initialize a new task package execution
```json
{
    "tp_id": "tp01",
    "custom_field": "value",
    "another_field": 123,
    "complex_data": {
        "nested": "object"
    }
}
```
- **Payload Processing**: `tp_id` and `user` extracted as control parameters, everything else becomes `msg.payload`
- **Headers**: `Authorization: Bearer <token>` (if OIDC configured)

**POST `/task-package/cancel`**
Cancel a running task package with comprehensive validation
```json
{
    "tp_id": "tp01",
    "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "User requested cancellation"
}
```
- **Validation**: Verifies tpc_id exists, belongs to tp_id, and is in cancellable state
- **Two-State Flow**: API sets status to 'cancelling', tp-end completes to 'cancelled'

### Event-Driven Tasks (EDT) API
**POST `/task-package/edt/mode/enable`**
Enable monitoring for specific entities
```json
{
    "scope": "bed_monitoring",
    "entity_id": "bed_1",
    "reason": "Patient admitted"
}
```

**POST `/task-package/edt/mode/disable`**
Disable monitoring for specific entities (supports bulk operations)
```json
{
    "scope": "bed_monitoring",
    "entity_ids": ["bed_1", "bed_2"],
    "reason": "Night shift - reduce alerts"
}
```

**GET `/task-package/edt/mode/status`**
Get current monitoring status
- **Query Parameters**: `scope`, `entity_id`

## Flow Patterns

### Basic Task Package Flow
```
[tp-start] ──→ [business logic] ──→ [tp-end]

[tp-cancel] ──→ [cleanup logic]  // Independent placement, auto-discovery
```

### Parallel Task Execution
```
Flow 1: [tp-start:tp01] ──→ [business logic A] ──→ [tp-end]
Flow 2: [tp-start:tp02] ──→ [business logic B] ──→ [tp-end]

[tp-cancel] ──→ [cleanup logic]  // Monitors both tasks automatically
```

### Complex Flow with Delays and Cancellation
```
[tp-start] ──→ [logic-1] ──→ [tp-delay] ──→ [logic-2] ──→ [tp-end]
                                │
                                └─→ [timeout cleanup] ──→ [tp-end]

[tp-cancel] ──────────────────────→ [global cleanup] ──→ [tp-end]
```

### Status Reporting Flow
```
[tp-start] ──→ [step-1] ──→ [tp-update-user-status] ──→ [step-2] ──→ [tp-end]
                                │
                                └─→ (status: "processing step 1")
```

### Cross-Flow Data Sharing
```
Flow 1: [tp-start] ──→ [business logic] ──→ [tp-data-set] ──→ [tp-end]

Flow 2: [tp-cancel] ──→ [tp-data-get] ──→ [cleanup with stored data] ──→ [tp-end]
                         │
                         └─→ enriched with original task data
```

### API Control Flow
```
[External Event] ──→ [tp-create-api] ──→ [process response]
[External Event] ──→ [tp-cancel-api] ──→ [handle cancellation result]
```

### Event-Driven Tasks (EDT) Pattern
```
[Sensor Data] 
    ↓
[edt-mode: Check if monitoring enabled]     // On/off control per entity
    ↓ (enabled)
[edt-state: Track state changes]            // Memory & change detection
    ↓ (changed)  
[edt-filter: Block spam/duplicates]         // Quality control
    ↓ (significant)
[Switch: "Event Type Routing"]              // USER LOGIC: Route by event
    ↓ (bed_exit) → [Function: "Emergency Logic"] → [tp-create-api: "bed_exit_response"]
    ↓ (sit_up) → [Function: "Standby Logic"] → [tp-create-api: "standby_bed"]
    ↓ (medication_due) → [Function: "Med Logic"] → [tp-create-api: "medication"]
```

### Cancellation Detection with tp-check-cancel
```
[tp-start] ──→ [custom logic] ──→ [tp-check-cancel] ──→ [normal flow] ──→ [tp-end]
                                        │
                                        └─→ [failure cleanup] ──→ [tp-end]
```

## Security

### OIDC Integration
When configured, the system validates Bearer tokens against OIDC providers and checks the user's `tp_allowed` array for authorization.

**Supported OIDC Providers**:
- **Keycloak**: Auto-detects `/protocol/openid-connect/userinfo` endpoint
- **Auth0**: Auto-detects `/userinfo` endpoint  
- **Azure AD**: Auto-detects `/oidc/userinfo` endpoint
- **Okta**: Auto-detects `/v1/userinfo` endpoint
- **Google**: Uses `https://www.googleapis.com/oauth2/v2/userinfo`
- **AWS Cognito**: Auto-detects `/oauth2/userInfo` endpoint

**Authorization Flow**:
1. **Token Validation**: Bearer token validated against OIDC provider userinfo endpoint
2. **User Identification**: Username extracted from `preferred_username`, `email`, `name`, or `sub` fields
3. **Authorization Check**: User's `tp_allowed` array checked against requested `tp_id`
4. **Filtering**: API endpoints return only authorized task packages for the user

### Security Bypass
When no OIDC URL is configured, security checks are bypassed for development scenarios (defaults to 'admin' user).

## Database Schema

### task_packages
Registry of available task package definitions
- `id`: Task package identifier (tp_id)
- `name`: Human-readable name
- `form_url`: Form endpoint path as stored in database
- `created_at`, `updated_at`: Timestamps

### task_packages_created  
Execution instances of task packages
- `id`: Task instance identifier (tpc_id, UUID)
- `tp_id`: Reference to task package
- `tp_name`: Cached from task_packages
- `user`: Requesting user
- `status`: System status (created, started, ongoing, completed, cancelling, cancelled, failed)
- `user_status`: Custom status from tp-update-user-status nodes
- `created_at`, `updated_at`: Timestamps

### edt_mode
Event-Driven Tasks mode control (for edt-mode nodes)
- `id`: Auto-increment primary key
- `scope`: Mode scope (e.g., "bed_monitoring")
- `entity_id`: Entity identifier (e.g., "bed_1")
- `enabled`: Boolean enabled/disabled state
- `reason`: Reason for last change
- `updated_by`: Who made the change
- `created_at`, `updated_at`: Timestamps

## Development

### Project Structure
```
node-red-task-package/
├── package.json              # NPM package configuration
├── index.js                  # Main entry point with dynamic loader
├── README.md                 # This documentation
├── lib/                      # Shared modules
│   ├── task-package-events.js    # Event handler
│   ├── task-package-api.js       # REST API server
│   ├── task-package-db.js        # Database integration
│   ├── edt-mode-db.js            # EDT mode database operations
│   └── tp-node-utils.js          # Shared utilities for business logic nodes
├── nodes/                    # Node implementations
│   ├── tp-config.js/.html        # Configuration node
│   ├── tp-start.js/.html         # Start node
│   ├── tp-cancel.js/.html        # Cancel node
│   ├── tp-end.js/.html           # End node
│   ├── tp-create-api.js/.html    # API create node
│   ├── tp-cancel-api.js/.html    # API cancel node
│   ├── tp-update-user-status.js/.html  # Update user status node
│   ├── tp-data-get.js/.html      # Data retrieval node
│   ├── tp-data-set.js/.html      # Data storage node
│   ├── tp-delay.js/.html         # Delay node
│   ├── tp-check-cancel.js/.html  # Cancellation router node
│   ├── tp-update.js/.html        # Update event node
│   ├── tp-update-api.js/.html    # Update API node
│   ├── edt-state.js/.html        # EDT state tracking node
│   ├── edt-filter.js/.html       # EDT event filtering node
│   └── edt-mode.js/.html         # EDT mode control node
└── scripts/                  # Automation tools
```

### Architecture Features
- **State Machine Pattern**: Workflow state machine with predictable state transitions
- **Parallel Task Support**: Multiple task packages can execute simultaneously per flow
- **Event-Driven Cancellation**: Robust cancellation system with task-specific isolation
- **Cleanup Flow Handling**: Intelligent detection and handling of cancellation cleanup flows
- **Auto-Discovery**: tp-cancel nodes automatically discover and monitor all active tasks
- **Database Synchronization**: Automatic task_packages table updates on deployment
- **Shared Node Utilities**: Common patterns for business logic nodes with consistent cancellation handling

## Testing Locally

```bash
# Install in your local Node-RED
npm install . --prefix ~/.node-red

# Restart Node-RED to see the new nodes
# API will be available at http://localhost:2880 (Node-RED port + 1000)
# Interactive API documentation at http://localhost:2880/task-package/docs
```

### Testing Features
- **Interactive API Documentation**: Test Bearer token authentication directly in Swagger UI
- **Development Mode**: Leave `oidc_url` empty in tp-config to bypass security
- **Live Configuration**: Changes take effect immediately without Node-RED restart
- **Parallel Testing**: Multiple task packages can be tested simultaneously

## Dependencies

- Node-RED >= 1.3.0
- Express.js for REST API
- SQLite3 for database
- Swagger UI Express for API documentation
- Swagger JSDoc for API specification
- AJV for JSON schema validation
- UUID for unique identifiers
- Axios for HTTP requests
- Node.js EventEmitter for event system

## License

ISC

## Contributing

1. Fork the repository
2. Create your feature branch
3. Follow the established patterns
4. Test thoroughly
5. Submit a pull request

## Notes

- Each flow should have only one tp-start and one tp-cancel node
- tp-cancel nodes automatically discover tasks via flow context (no input connections needed)
- All nodes use the shared event system for coordination
- Database integration is automatic when tp-config is present
- API server starts automatically on Node-RED initialization
- **Parallel Task Support**: Multiple task packages can run simultaneously within the same flow
- **Task-Specific Cancellation**: Each task's cancellation state is completely isolated
- **Cleanup Flow Detection**: Cleanup flows are automatically detected and processed normally
- **Event-Driven Architecture**: EDT nodes provide real-time sensor data processing capabilities
- **Live Updates**: Configuration changes take effect immediately without restart
- **Auto-Synchronization**: Task package definitions sync automatically on deployment

---