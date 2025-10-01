import { Issuer } from 'openid-client';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM || 'coralflow';
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'coralflow-cli';

export async function authenticateTool(args, { McpError, ErrorCode }) {
  try {
    console.log('[authenticate] Starting device flow...');
    
    // Discover Keycloak
    const issuerUrl = `${KEYCLOAK_URL}/realms/${REALM}`;
    const issuer = await Issuer.discover(issuerUrl);
    
    const client = new issuer.Client({
      client_id: CLIENT_ID,
      token_endpoint_auth_method: 'none',
    });
    
    // Initiate device authorization
    const handle = await client.deviceAuthorization({
      scope: 'openid profile email roles',
    });
    
    const verificationUri = handle.verification_uri_complete || handle.verification_uri;
    const userCode = handle.user_code;
    
    console.log('[authenticate] Device code obtained');
    console.log(`[authenticate] User code: ${userCode}`);
    
    // Poll for token (with timeout)
    const tokenSet = await handle.poll();
    
    console.log('[authenticate] Token obtained successfully');
    
    // Decode token to get user info
    const payload = JSON.parse(
      Buffer.from(tokenSet.access_token.split('.')[1], 'base64').toString('utf8')
    );
    
    const keycloakRoles = payload.realm_access?.roles || [];
    const coralFlowRole = mapRole(keycloakRoles);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          verification_uri: verificationUri,
          user_code: userCode,
          user: {
            username: payload.preferred_username,
            email: payload.email,
            name: payload.name,
            role: coralFlowRole,
            roles: keycloakRoles
          },
          token: tokenSet.access_token,
          refresh_token: tokenSet.refresh_token,
          expires_at: tokenSet.expires_at
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[authenticate] Error:', error);
    throw new McpError(
      ErrorCode.InternalError,
      `Authentication failed: ${error.message}`
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
  
  // Return first matching role with priority
  const priority = ['coralflow-system-admin', 'coralflow-admin', 'coralflow-project-manager'];
  for (const role of priority) {
    if (keycloakRoles.includes(role)) {
      return roleMap[role];
    }
  }
  
  // Check all roles
  for (const role of keycloakRoles) {
    if (roleMap[role]) {
      return roleMap[role];
    }
  }
  
  return 'Viewer';
}
