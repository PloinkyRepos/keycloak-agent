# Keycloak Agent

A ploinky-native MCP (Model Context Protocol) agent that provides Keycloak SSO authentication services for CoralFlow.

## Overview

This agent implements OAuth2 device flow authentication using Keycloak, providing secure token-based authentication for CoralFlow applications.

## Architecture

- **Pattern**: Ploinky-native agent (no Dockerfile)
- **Container**: `node:20-alpine`
- **Protocol**: MCP (Model Context Protocol)
- **Port**: 7000 (default)
- **Code Location**: Mounted at `/code` from workspace

## Directory Structure

```
keycloak-agent/
├── manifest.json          # Ploinky manifest
├── package.json           # npm dependencies
├── server.mjs             # MCP server entry point
├── tools/                 # MCP tool implementations
│   ├── index.mjs          # Tool registration
│   ├── authenticate.mjs   # OAuth2 device flow
│   ├── validate.mjs       # Token validation
│   ├── refresh.mjs        # Token refresh
│   └── logout.mjs         # Logout handler
└── README.md              # This file
```

## Available Tools

### 1. authenticate
Start OAuth2 device flow authentication with Keycloak.

**Input**: None

**Output**:
```json
{
  "success": true,
  "verification_uri": "http://localhost:8080/realms/coralflow/device?user_code=ABCD-EFGH",
  "user_code": "ABCD-EFGH",
  "user": {
    "username": "daniel",
    "email": "daniel@example.com",
    "name": "Daniel Admin",
    "role": "Admin",
    "roles": ["coralflow-admin", "coralflow-viewer"]
  },
  "token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "expires_at": 1696176000
}
```

### 2. validate
Validate an access token and extract user info.

**Input**:
```json
{
  "token": "eyJhbG..."
}
```

**Output**:
```json
{
  "valid": true,
  "user": {
    "username": "daniel",
    "email": "daniel@example.com",
    "name": "Daniel Admin",
    "role": "Admin",
    "roles": ["coralflow-admin"]
  }
}
```

### 3. refresh
Refresh an expired access token.

**Input**:
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Output**:
```json
{
  "success": true,
  "token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "expires_at": 1696176000
}
```

### 4. logout
Clear stored authentication tokens.

**Input**: None

**Output**:
```json
{
  "success": true,
  "message": "Logout successful"
}
```

## Environment Variables

Configure in `manifest.json` or via p-cli:

- `KEYCLOAK_URL`: Keycloak server URL (default: `http://host.docker.internal:8080`)
- `KEYCLOAK_REALM`: Keycloak realm name (default: `coralflow`)
- `KEYCLOAK_CLIENT_ID`: Keycloak client ID (default: `coralflow-cli`)
- `PORT`: MCP server port (default: `7000`)

## Role Mapping

Keycloak roles are mapped to CoralFlow roles:

| Keycloak Role | CoralFlow Role |
|---------------|----------------|
| coralflow-system-admin | SystemAdmin |
| coralflow-admin | Admin |
| coralflow-project-manager | ProjectManager |
| coralflow-spc | SPC |
| coralflow-storeman | Storeman |
| coralflow-viewer | Viewer |

## Setup Instructions

### 1. Enable the Agent

```bash
p-cli enable agent keycloak-agent
```

This will:
- Pull `node:20-alpine` image if needed
- Run `npm install` to install dependencies
- Register the agent with ploinky

### 2. Start the Agent

```bash
p-cli start keycloak-agent
```

This will:
- Create a container from `node:20-alpine`
- Mount `keycloak-agent/` at `/code`
- Run the MCP server on port 7000

### 3. Verify Health

```bash
curl http://localhost:7000/health
```

Expected response:
```json
{
  "ok": true,
  "server": "keycloak-agent",
  "keycloak": "http://host.docker.internal:8080",
  "realm": "coralflow"
}
```

## Usage with startFlow.sh

The `startFlow.sh` script in the CoralFlow root directory communicates with this agent via HTTP to handle authentication:

1. Check for existing tokens
2. If no valid token, call `authenticate` tool
3. Display device code to user
4. Poll until authentication completes
5. Store tokens securely
6. Pass authenticated user to orchestrator

## Keycloak Prerequisites

Before using this agent, ensure Keycloak is configured:

1. **Keycloak Server Running**:
   ```bash
   docker run -d --name coralflow-keycloak \
     -p 8080:8080 \
     -e KEYCLOAK_ADMIN=admin \
     -e KEYCLOAK_ADMIN_PASSWORD=admin \
     quay.io/keycloak/keycloak:latest \
     start-dev
   ```

2. **Realm Created**: `coralflow`

3. **Client Created**: 
   - Client ID: `coralflow-cli`
   - Client authentication: OFF
   - Device Authorization Grant: ON

4. **Roles Created**:
   - `coralflow-admin`
   - `coralflow-project-manager`
   - `coralflow-spc`
   - `coralflow-storeman`
   - `coralflow-system-admin`
   - `coralflow-viewer`

5. **Test User Created** with assigned roles

## Troubleshooting

### Container not starting

```bash
# Check logs
docker logs ploinky_agent_keycloak-agent

# Shell into container
p-cli shell keycloak-agent
```

### Keycloak unreachable

Verify Keycloak is accessible from container:
```bash
p-cli shell keycloak-agent
wget -O- http://host.docker.internal:8080/realms/coralflow/.well-known/openid-configuration
```

### Port conflict

If port 7000 is already in use, change it in `manifest.json`:
```json
{
  "env": {
    "PORT": "7001"
  }
}
```

Then restart the agent:
```bash
p-cli stop keycloak-agent
p-cli start keycloak-agent
```

## Development

### Local Testing (without ploinky)

```bash
cd keycloak-agent
npm install

# Set environment variables
export KEYCLOAK_URL=http://localhost:8080
export KEYCLOAK_REALM=coralflow
export KEYCLOAK_CLIENT_ID=coralflow-cli
export PORT=7000

# Run server
node server.mjs
```

### MCP Testing

Initialize a session:
```bash
curl -X POST http://localhost:7000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    },
    "id": 1
  }'
```

List tools:
```bash
curl -X POST http://localhost:7000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <session-id-from-above>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }'
```

## Security Considerations

- ✅ No Dockerfile = no secrets baked into images
- ✅ Code mounted from workspace (live updates)
- ✅ OAuth2 device flow (no credentials in CLI)
- ✅ Short-lived access tokens
- ✅ Secure token refresh
- ✅ Role-based access control

## License

Part of the CoralFlow project.
