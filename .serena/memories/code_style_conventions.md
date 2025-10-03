# Code Style and Conventions

## TypeScript Standards
- Strict TypeScript with explicit types
- Interface definitions for all data structures
- Prefer const assertions where applicable

## React Patterns
- Functional components with hooks
- useState for local state management
- useEffect for side effects with proper cleanup
- Custom hooks for reusable logic

## File Organization
- `src/` - Backend source code
- `dashboard/` - Frontend Next.js application
- `data/` - JSON data storage files
- `config/` - Configuration files

## Naming Conventions
- camelCase for variables and functions
- PascalCase for React components and interfaces
- kebab-case for file names
- UPPER_CASE for constants

## Severity Levels
- **critical**: System-breaking violations (red)
- **error**: Serious issues requiring immediate attention (red)
- **warning**: Important but non-breaking issues (yellow)
- **info**: Informational notices (blue)

## Database Schema
- Violations include: id, timestamp, constraint_id, severity, message, context
- Support for sessionId, project, and repository fields
- JSON storage with backup capabilities