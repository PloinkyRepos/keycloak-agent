#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import http from 'node:http';

// Dynamically import MCP SDK
async function loadSdkDeps() {
  const mcp = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const streamHttp = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const types = await import('@modelcontextprotocol/sdk/types.js');
  return {
    McpServer: mcp.McpServer,
    StreamableHTTPServerTransport: streamHttp.StreamableHTTPServerTransport,
    isInitializeRequest: types.isInitializeRequest,
    McpError: mcp.McpError,
    ErrorCode: mcp.ErrorCode
  };
}

// Import our auth tools
import { registerAuthTools } from './tools/index.mjs';

async function createServerInstance() {
  const { McpServer, McpError, ErrorCode } = await loadSdkDeps();
  const server = new McpServer({ 
    name: 'keycloak-agent', 
    version: '1.0.0' 
  });

  // Register authentication tools
  await registerAuthTools(server, { McpError, ErrorCode });

  // Health check resource
  server.registerResource(
    'health',
    'health://status',
    {
      title: 'Keycloak Agent Health',
      description: 'Authentication service status',
      mimeType: 'application/json'
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: JSON.stringify({ 
          ok: true, 
          server: 'keycloak-agent',
          keycloak: process.env.KEYCLOAK_URL,
          realm: process.env.KEYCLOAK_REALM
        })
      }]
    })
  );

  return server;
}

async function main() {
  const { StreamableHTTPServerTransport, isInitializeRequest } = await loadSdkDeps();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7000;
  const sessions = {};

  console.log('[Keycloak Agent] Starting MCP server...');
  console.log(`[Keycloak Agent] Keycloak URL: ${process.env.KEYCLOAK_URL}`);
  console.log(`[Keycloak Agent] Realm: ${process.env.KEYCLOAK_REALM}`);

  const serverHttp = http.createServer((req, res) => {
    const { method, url } = req;
    const sendJson = (code, obj) => {
      const data = Buffer.from(JSON.stringify(obj));
      res.writeHead(code, { 
        'Content-Type': 'application/json', 
        'Content-Length': data.length 
      });
      res.end(data);
    };

    try {
      const u = new URL(url || '/', 'http://localhost');
      
      // Health check endpoint
      if (method === 'GET' && u.pathname === '/health') {
        return sendJson(200, { 
          ok: true, 
          server: 'keycloak-agent',
          keycloak: process.env.KEYCLOAK_URL,
          realm: process.env.KEYCLOAK_REALM
        });
      }
      
      // MCP endpoint
      if (method === 'POST' && u.pathname === '/mcp') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
          let body = {};
          try { 
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); 
          } catch (_) { 
            body = {}; 
          }
          
          const sessionId = req.headers['mcp-session-id'];
          let entry = sessionId && sessions[sessionId] ? sessions[sessionId] : null;
          
          try {
            if (!entry) {
              if (!isInitializeRequest(body)) {
                return sendJson(400, { 
                  jsonrpc: '2.0', 
                  error: { code: -32000, message: 'Missing session; send initialize first' }, 
                  id: null 
                });
              }
              
              const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                enableJsonResponse: true,
                onsessioninitialized: (sid) => { 
                  sessions[sid] = { transport, server }; 
                }
              });
              
              const server = await createServerInstance();
              await server.connect(transport);
              
              transport.onclose = () => {
                try { server.close(); } catch (_) {}
                const sid = transport.sessionId;
                if (sid && sessions[sid]) delete sessions[sid];
              };
              
              await transport.handleRequest(req, res, body);
              return;
            }
            
            await entry.transport.handleRequest(req, res, body);
          } catch (err) {
            console.error('[Keycloak Agent] Error:', err);
            if (!res.headersSent) {
              return sendJson(500, { 
                jsonrpc: '2.0', 
                error: { code: -32603, message: 'Internal error' }, 
                id: null 
              });
            }
          }
        });
        return;
      }
      
      sendJson(404, { error: 'Not Found' });
    } catch (err) {
      console.error('[Keycloak Agent] Request error:', err);
      if (!res.headersSent) sendJson(500, { error: 'Internal Server Error' });
    }
  });

  serverHttp.listen(PORT, () => {
    console.log(`[Keycloak Agent] MCP server listening on port ${PORT}`);
    console.log(`[Keycloak Agent] Ready to accept authentication requests`);
  });
}

main().catch(err => {
  console.error('[Keycloak Agent] Fatal error:', err);
  process.exit(1);
});
