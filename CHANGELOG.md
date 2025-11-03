# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-11-03

### Fixed
- Node-RED Flow Library compatibility issues with node registration
- All nodes now use literal string registration instead of variables
- This fix ensures all 17 nodes are properly detected by the Flow Library crawler

### Added
- Terminal installation requirement documentation
- Palette Manager limitation warnings
- Comprehensive troubleshooting guide

### Changed
- Enhanced README with installation guidance
- Updated node registration patterns for better compatibility

## [1.0.0] - 2025-11-03

### Added
- Initial release of Task Package nodes for Node-RED
- Complete task orchestration workflow nodes
- Event Driven Trigger (EDT) nodes for state management
- Task Package API nodes for external integration
- SQLite-based task tracking and data management