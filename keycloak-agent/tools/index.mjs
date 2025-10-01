import { authenticateTool } from './authenticate.mjs';
import { validateTool } from './validate.mjs';
import { refreshTool } from './refresh.mjs';
import { logoutTool } from './logout.mjs';

export async function registerAuthTools(server, { McpError, ErrorCode }) {
  // Handler for tool calls
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      switch (name) {
        case 'authenticate':
          return await authenticateTool(args, { McpError, ErrorCode });
        
        case 'validate':
          return await validateTool(args, { McpError, ErrorCode });
        
        case 'refresh':
          return await refreshTool(args, { McpError, ErrorCode });
        
        case 'logout':
          return await logoutTool(args, { McpError, ErrorCode });
        
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[Tool ${name}] Error:`, error);
      throw error;
    }
  });
  
  // List available tools
  server.setRequestHandler('tools/list', async () => ({
    tools: [
      {
        name: 'authenticate',
        description: 'Start OAuth2 device flow authentication with Keycloak',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'validate',
        description: 'Validate an access token and extract user info',
        inputSchema: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'Access token to validate'
            }
          },
          required: ['token']
        }
      },
      {
        name: 'refresh',
        description: 'Refresh an expired access token',
        inputSchema: {
          type: 'object',
          properties: {
            refreshToken: {
              type: 'string',
              description: 'Refresh token'
            }
          },
          required: ['refreshToken']
        }
      },
      {
        name: 'logout',
        description: 'Clear stored authentication tokens',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  }));
}
