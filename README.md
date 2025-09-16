# Node-RED Task Package

A workflow orchestrator that provides a higher-layer abstraction for managing task execution flows. It enables external users to trigger Node-RED flows via REST API calls or internal events, with built-in security, validation, and lifecycle management capabilities.

## Overview

The **node-red-task-package** module provides:

- **External API Access**: REST API endpoints for task lifecycle management
- **Security Integration**: Keycloak-based authentication and authorization  
- **Event-Driven Architecture**: Internal event system for node communication
- **Schema Validation**: JSON schema validation for request payloads
- **Database Persistence**: SQLite-based task state management
- **Flow Context Communication**: Seamless coordination between nodes
- **No-Input Cancel Design**: Clean cancellation without forced connections

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

### Configuration Node: `tp-config`
Global configuration for the task package system with settings for:
- Keycloak authentication endpoint
- Database file path
- Host URL and port for form generation

### Flow Control Nodes

#### `tp-start` (Entry Point)
- **Inputs**: None (event-driven)
- **Outputs**: 1 (main flow)
- **Purpose**: Entry point for task package flows
- **Features**: Schema validation, flow context storage, database integration

#### `tp-cancel` (Cancellation Handler) 
- **Inputs**: None (auto-discovery)
- **Outputs**: 1 (cancellation flow)
- **Purpose**: Handle task package cancellation
- **Features**: Automatic task discovery, no input connections required

#### `tp-end` (Exit Point)
- **Inputs**: 1 (from flow)
- **Outputs**: None
- **Purpose**: Terminate task package execution
- **Features**: Status determination (completed/cancelled), database updates

#### `tp-update` (Status Update)
- **Inputs**: 1 (from flow)  
- **Outputs**: None
- **Purpose**: Update user-defined status information
- **Features**: Custom status messages, database integration

#### `tp-delay` (Cancellable Delay)
- **Inputs**: 1 (from flow)
- **Outputs**: 2 (success, cancelled)
- **Purpose**: Introduce time delays with cancellation support
- **Features**: Dual outputs, cancellation monitoring

## API Endpoints

### GET `/task-package/status`
Retrieve available task packages for the authenticated user

### GET `/task-package/status/:tpc_id`  
Get specific task package instance status

### POST `/task-package/start`
Initialize a new task package execution
```json
{
    "tp_id": "tp01",
    "user": "sbrow", 
    "payload": { /* custom data */ }
}
```

### POST `/task-package/cancel`
Cancel a running task package
```json
{
    "tp_id": "tp01",
    "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
    "user": "sbrow"
}
```

## Flow Patterns

### Basic Task Package Flow
```
[tp-start] ──→ [business logic] ──→ [tp-end]

[tp-cancel] ──→ [cleanup logic]  // Independent placement
```

### Complex Flow with Delays
```
[tp-start] ──→ [logic-1] ──→ [tp-delay] ──→ [logic-2] ──→ [tp-end]
                                │
                                └─→ [timeout cleanup]

[tp-cancel] ──────────────────────→ [global cleanup]
```

### Status Reporting Flow
```
[tp-start] ──→ [step-1] ──→ [tp-update] ──→ [step-2] ──→ [tp-end]
                                │
                                └─→ (status: "processing step 1")
```

## Security

### Keycloak Integration
When configured, the system validates Bearer tokens against Keycloak and checks the user's `tp_allowed` array for authorization.

### Security Bypass
When no Keycloak URL is configured, security checks are bypassed for development scenarios.

## Database Schema

### task_packages
Registry of available task package definitions
- `id`: Task package identifier (tp_id)
- `name`: Human-readable name
- `form_url`: Dashboard endpoint path

### task_packages_created  
Execution instances of task packages
- `id`: Task instance identifier (tpc_id, UUID)
- `tp_id`: Reference to task package
- `user`: Requesting user
- `status`: System status (created, underway, completed, cancelled)
- `user_status`: Custom status from tp-update nodes

## Development

### Project Structure
```
node-red-task-package/
├── package.json              # NPM package configuration
├── index.js                  # Main entry point with dynamic loader
├── TASK_PACKAGE_DESIGN.md    # Complete design documentation
├── lib/                      # Shared modules
│   ├── task-package-events.js    # Event handler
│   ├── task-package-api.js       # REST API server
│   └── task-package-db.js        # Database integration
├── nodes/                    # Node implementations
│   ├── tp-config.js/.html        # Configuration node
│   ├── tp-start.js/.html         # Start node
│   ├── tp-cancel.js/.html        # Cancel node
│   ├── tp-end.js/.html           # End node
│   ├── tp-update.js/.html        # Update node
│   └── tp-delay.js/.html         # Delay node
└── scripts/                  # Automation tools
```

### Architecture Principles

Following **@totallyinformation/node-red-contrib-events** patterns:
- ✅ **Shared Event Handler**: Centralized EventEmitter for coordination
- ✅ **Proper Node Structure**: Module-level functions and cleanup
- ✅ **Event Namespacing**: Prefixed event names for isolation
- ✅ **Flow Context**: Node-to-node communication via context
- ✅ **Clean Patterns**: Separation of concerns and modular design

## Testing Locally

```bash
# Install in your local Node-RED
npm install . --prefix ~/.node-red

# Restart Node-RED to see the new nodes
# API will be available at http://localhost:2880 (Node-RED port + 1000)
```

## Dependencies

- Node-RED >= 1.3.0
- Express.js for REST API
- SQLite3 for database
- AJV for JSON schema validation
- UUID for unique identifiers
- Axios for HTTP requests

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
- tp-cancel nodes automatically discover tasks via flow context
- All nodes use the shared event system for coordination
- Database integration is automatic when tp-config is present
- API server starts automatically on Node-RED initialization

---

*For complete design documentation, see [TASK_PACKAGE_DESIGN.md](./TASK_PACKAGE_DESIGN.md)* 