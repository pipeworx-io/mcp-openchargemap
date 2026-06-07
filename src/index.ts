interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Open Charge Map MCP — global EV charging station database (openchargemap.io).
 *
 * Tools:
 * - find_stations: EV charging stations near a latitude/longitude, with
 *   connector types (CCS/CHAdeMO/Tesla), charging speed (kW), and operator.
 * - get_station: full detail for a single charging station by Open Charge Map
 *   POI ID, including user comments.
 *
 * HYBRID auth: designed to work KEYLESS by default. An optional `_apiKey`
 * (your own Open Charge Map API key) raises rate limits; pass it via the
 * `key` query param. Open Charge Map recommends a key but the API historically
 * serves keyless requests.
 */


const BASE_URL = 'https://api.openchargemap.io/v3';

const API_KEY_SCHEMA = {
  type: 'string',
  description:
    'Optional — your own Open Charge Map API key for higher limits; works without one.',
} as const;

const tools: McpToolExport['tools'] = [
  {
    name: 'find_stations',
    description:
      'Find EV charging stations (electric vehicle chargers) near a location. Returns nearby charging stations with operator, status, available connector types (CCS/CHAdeMO/Tesla connectors), charging speed (kW), and distance. Filter by connector type to find e.g. only CCS or Tesla chargers.',
    inputSchema: {
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          description: 'Latitude of the search center, e.g. 37.7749.',
        },
        longitude: {
          type: 'number',
          description: 'Longitude of the search center, e.g. -122.4194.',
        },
        distance: {
          type: 'number',
          description: 'Search radius around the location (default 10).',
        },
        distance_unit: {
          type: 'string',
          enum: ['KM', 'Miles'],
          description: 'Unit for the search radius (default "KM").',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of stations to return (default 20, max 100).',
        },
        connection_type: {
          type: 'string',
          description:
            'Optional connector type name to filter by, e.g. "CCS", "CHAdeMO", "Tesla". Case-insensitive substring match against each station\'s connector titles.',
        },
        _apiKey: API_KEY_SCHEMA,
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'get_station',
    description:
      'Get full detail for a single EV charging station by its Open Charge Map POI ID. Returns the connector types (CCS/CHAdeMO/Tesla connectors), charging speed (kW), operator, status, plus user comments and last-verified date.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Open Charge Map POI ID (e.g. from find_stations results).',
        },
        _apiKey: API_KEY_SCHEMA,
      },
      required: ['id'],
    },
  },
];

interface OcmConnection {
  ConnectionType?: { Title?: string };
  PowerKW?: number;
  Level?: { Title?: string };
  CurrentType?: { Title?: string };
  Quantity?: number;
}

interface OcmPoi {
  ID?: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    StateOrProvince?: string;
    Latitude?: number;
    Longitude?: number;
    Distance?: number;
  };
  OperatorInfo?: { Title?: string };
  StatusType?: { Title?: string };
  NumberOfPoints?: number;
  Connections?: OcmConnection[];
  UsageCost?: string;
  UserCommentCount?: number;
  GeneralComments?: string;
  DateLastVerified?: string;
}

function mapStation(p: OcmPoi) {
  return {
    id: p.ID,
    name: p.AddressInfo?.Title,
    address: [p.AddressInfo?.AddressLine1, p.AddressInfo?.Town, p.AddressInfo?.StateOrProvince]
      .filter(Boolean)
      .join(', '),
    lat: p.AddressInfo?.Latitude,
    lon: p.AddressInfo?.Longitude,
    distance: p.AddressInfo?.Distance,
    operator: p.OperatorInfo?.Title,
    status: p.StatusType?.Title,
    num_points: p.NumberOfPoints,
    connections: (p.Connections || []).map((c) => ({
      type: c.ConnectionType?.Title,
      power_kw: c.PowerKW,
      level: c.Level?.Title,
      current: c.CurrentType?.Title,
      quantity: c.Quantity,
    })),
    usage_cost: p.UsageCost,
  };
}

function buildUrl(path: string, apiKey: string | undefined): string {
  let url = `${BASE_URL}${path}`;
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    url += `&key=${encodeURIComponent(apiKey)}`;
  }
  return url;
}

async function ocmFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'pipeworx/1.0 (+https://pipeworx.io)' },
  });
  if (!res.ok) {
    return { error: res.status, message: await res.text() };
  }
  return res.json();
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string | undefined;
  delete args._apiKey;

  switch (name) {
    case 'find_stations':
      return findStations(args, apiKey);
    case 'get_station':
      return getStation(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function findStations(args: Record<string, unknown>, apiKey: string | undefined) {
  const latitude = args.latitude as number | undefined;
  const longitude = args.longitude as number | undefined;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error(
      'find_stations requires numeric "latitude" and "longitude" arguments, e.g. { latitude: 37.7749, longitude: -122.4194 }.',
    );
  }

  const distance = (args.distance as number | undefined) ?? 10;
  const distanceUnit = (args.distance_unit as string | undefined) ?? 'KM';
  const maxResults = Math.min((args.max_results as number | undefined) ?? 20, 100);
  const connectionType = args.connection_type as string | undefined;

  const path =
    `/poi?output=json&latitude=${latitude}&longitude=${longitude}` +
    `&distance=${distance}&distanceunit=${distanceUnit}&maxresults=${maxResults}` +
    `&compact=true&verbose=false`;

  const data = await ocmFetch(buildUrl(path, apiKey));
  if (!Array.isArray(data)) return data; // pass through { error, message }

  let stations = (data as OcmPoi[]).map(mapStation);

  if (typeof connectionType === 'string' && connectionType.trim()) {
    const needle = connectionType.toLowerCase();
    stations = stations.filter((s) =>
      s.connections.some((c) => (c.type ?? '').toLowerCase().includes(needle)),
    );
  }

  return { stations };
}

async function getStation(args: Record<string, unknown>, apiKey: string | undefined) {
  const id = args.id as number | undefined;
  if (typeof id !== 'number') {
    throw new Error('get_station requires a numeric "id" (Open Charge Map POI ID).');
  }

  const path = `/poi?output=json&chargepointid=${id}&compact=false&verbose=true&includecomments=true`;

  const data = await ocmFetch(buildUrl(path, apiKey));
  if (!Array.isArray(data)) return data; // pass through { error, message }

  const p = (data as OcmPoi[])[0];
  if (!p) {
    return { error: 404, message: `No charging station found for POI ID ${id}.` };
  }

  return {
    ...mapStation(p),
    comments_count: p.UserCommentCount,
    general_comments: p.GeneralComments,
    date_last_verified: p.DateLastVerified,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
