# mcp-openchargemap

Open Charge Map MCP — global EV charging station database (openchargemap.io).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `find_stations` | Find EV charging stations (electric vehicle chargers) near a place. Pass a `location` name (city/place, e.g. "San Francisco", "Berlin", "Austin TX") and it is geocoded automatically — OR pass explicit latitude+longitude. Returns nearby charging stations with operator, status, available connector types (CCS/CHAdeMO/Tesla connectors), charging speed (kW), and distance. Filter by connector type to find e.g. only CCS or Tesla chargers. |
| `get_station` | Get full detail for a single EV charging station by its Open Charge Map POI ID. Returns the connector types (CCS/CHAdeMO/Tesla connectors), charging speed (kW), operator, status, plus user comments and last-verified date. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "openchargemap": {
      "url": "https://gateway.pipeworx.io/openchargemap/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Openchargemap data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
