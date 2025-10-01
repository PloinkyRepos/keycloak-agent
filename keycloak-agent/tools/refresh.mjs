import { Issuer } from 'openid-client';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM || 'coralflow';
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'coralflow-cli';

export async function refreshTool(args, { McpError, ErrorCode }) {
  try {
    const refreshToken = args?.refreshToken;
    if (!refreshToken) {
      throw new McpError(ErrorCode.InvalidParams, 'Refresh token required');
    }
    
    const issuerUrl = `${KEYCLOAK_URL}/realms/${REALM}`;
    const issuer = await Issuer.discover(issuerUrl);
    const client = new issuer.Client({
      client_id: CLIENT_ID,
      token_endpoint_auth_method: 'none',
    });
    
    const tokenSet = await client.refresh(refreshToken);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          token: tokenSet.access_token,
          refresh_token: tokenSet.refresh_token,
          expires_at: tokenSet.expires_at
        }, null, 2)
      }]
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Refresh failed: ${error.message}`
    );
  }
}
