# MPC GeoAI Copilot

AI-powered geospatial copilot for Oil & Gas Midstream GIS.

## Vision

Natural Language → Spatial Intelligence → Action

The goal is to allow GIS users, engineers and business users to interact with
geospatial data using natural language and receive validated GIS results.

## Initial MVP

- Interactive GIS map
- AI chat interface
- Layer panel
- Point / line / polygon drawing
- Natural-language spatial queries
- Distance and buffer analysis
- Intersect / contains analysis
- Nearest-feature analysis
- Attribute filtering
- Map highlighting
- Results table
- AI explanation of interpreted GIS intent
- Query history
- CSV export

## Architecture Principle

User → LLM → Structured GIS Intent → Validation → Approved GIS Tool
→ GIS/Data Source → Result Validation → Map/Table/Report

The LLM must not directly execute unrestricted SQL or arbitrary code.

## Initial Technology Stack

### Frontend
- React
- TypeScript
- Vite
- ArcGIS Maps SDK for JavaScript

### Backend
- Python
- FastAPI

### Initial Data
- Mock / sample GeoJSON data

### Future Enterprise Integration
- ArcGIS Enterprise
- ArcGIS Portal
- Feature Services
- PostgreSQL / PostGIS
- Enterprise authentication
- Audit logging

## Development Approach

Build the application incrementally using vertical slices.

Each feature should be:

1. Designed
2. Implemented
3. Tested
4. Validated
5. Documented

AI coding assistants should modify the existing implementation rather than
rewriting the project unnecessarily.