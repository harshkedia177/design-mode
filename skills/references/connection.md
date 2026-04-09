# Chrome Connection

The MCP server auto-discovers Chrome's debugging port from the DevToolsActivePort file. Enable remote debugging at chrome://inspect/#remote-debugging — no `--remote-debugging-port` flag needed.

## How It Works

1. The server reads Chrome's DevToolsActivePort file to find the active debugging port
2. It connects via the Chrome DevTools Protocol (CDP) using WebSocket
3. No manual port configuration is required

## Troubleshooting

- Ensure Chrome is running with remote debugging enabled
- Check that no other process is consuming the CDP connection
- Restart Chrome if the DevToolsActivePort file is stale
