import { Issuer } from 'openid-client';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM || 'coralflow';

export async function validateTool(args, { McpError, ErrorCode }) {
  try {
    const token = args?.token;
    if (!token) {
      throw new McpError(ErrorCode.InvalidParams, 'Token required');
    }
    
    // Decode token
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString('utf8')
    );
    
    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: false,
            error: 'Token expired'
          })
        }]
      };
    }
    
    // Optionally verify with Keycloak userinfo endpoint
    const issuerUrl = `${KEYCLOAK_URL}/realms/${REALM}`;
    const issuer = await Issuer.discover(issuerUrl);
    const client = new issuer.Client({
      client_id: process.env.KEYCLOAK_CLIENT_ID,
      token_endpoint_auth_method: 'none',
    });
    
    try {
      await client.userinfo(token);
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: false,
            error: 'Token validation failed'
          })
        }]
      };
    }
    
    const keycloakRoles = payload.realm_access?.roles || [];
    const coralFlowRole = mapRole(keycloakRoles);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: true,
          user: {
            username: payload.preferred_username,
            email: payload.email,
            name: payload.name,
            role: coralFlowRole,
            roles: keycloakRoles
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Validation failed: ${error.message}`
    );
  }
}

function mapRole(keycloakRoles) {
  const roleMap = {
    'coralflow-admin': 'Admin',
    'coralflow-project-manager': 'ProjectManager',
    'coralflow-spc': 'SPC',
    'coralflow-storeman': 'Storeman',
    'coralflow-system-admin': 'SystemAdmin',
    'coralflow-viewer': 'Viewer'
  };
  
  const priority = ['coralflow-system-admin', 'coralflow-admin', 'coralflow-project-manager'];
  for (const role of priority) {
    if (keycloakRoles.includes(role)) {
      return roleMap[role];
    }
  }
  
  for (const role of keycloakRoles) {
    if (roleMap[role]) {
      return roleMap[role];
    }
  }
  
  return 'Viewer';
}
