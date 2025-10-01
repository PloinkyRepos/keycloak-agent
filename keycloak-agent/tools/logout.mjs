export async function logoutTool(args, { McpError, ErrorCode }) {
  try {
    // In this simplified version, just return success
    // Token deletion happens in startFlow.sh
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Logout successful'
        })
      }]
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Logout failed: ${error.message}`
    );
  }
}
