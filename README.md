# Chat Genie BI Portal

Fabric-authenticated BI portal for discovering the signed-in user's Power BI
reports and Fabric Data Agents, embedding the selected report, and asking the
selected agent questions through its published MCP server.

During local development, the tenant bridge uses the signed-in Azure CLI
identity to call the Power BI REST API and the Fabric Data Agent MCP endpoint.
In production, the browser obtains a delegated Power BI token for the signed-in
user and passes it only to the Power BI JavaScript client to embed reports. The
browser uses the Fabric User Data Function for protected tenant discovery and
Data Agent MCP calls; it never receives a service-principal secret. The
supported Data Agent runtime endpoint is:

```text
https://api.fabric.microsoft.com/v1/mcp/workspaces/{workspaceId}/dataagents/{agentId}/agent
```

The Data Agent must be published before its MCP endpoint can answer questions.

## Portal capabilities

| Function | Purpose |
| --- | --- |
| Report discovery | List reports accessible to the signed-in user |
| Report viewing | Embed a selected report with the signed-in user's Power BI token |
| Agent discovery | List published Data Agents in the selected workspace |
| Agent chat | Discover the MCP tool and send the user's question to it |

The Rayfin Functions implementation remains under `rayfin/functions` for a
future Fabric backend that supports User Data Functions. The current Fabric
AppBackend rejects Functions settings, so local validation uses
`scripts/dev-api.mjs` instead of pretending that a static host is an API.

## Production backend status

The production Fabric app publishes the static frontend and uses the Fabric
`UserDataFunction` work item named `Chat Genie Tenant Bridge Live v3` for tenant API
calls. `notebookutils`/`mssparkutils` is a Spark notebook utility and is not a
supported token provider inside `function_app.py`.

Do not put a Power BI, Fabric, client, or service-principal secret in the
frontend. Complete the Fabric connection/identity setup first, then publish
the User Data Function definition and update the production API base URL.

The production function uses an SPN directly through the connected Fabric
Variables item `Chat Genie Secrets` for protected tenant discovery and Data
Agent calls. The variables are
`CHAT_GENIE_TENANT_ID`, `CHAT_GENIE_CLIENT_ID`, and
`CHAT_GENIE_CLIENT_SECRET`. They must never be committed to source control or
exposed to the browser. The function uses `azure.identity` to acquire
short-lived Power BI/Fabric tokens per request. A notebook can validate the
same token flow, but it should not be used as the synchronous production API.

The User Data Function must be published by its Fabric item owner after the
Variables connection is attached. The connection alias in
`fabric/chat-genie-tenant-bridge/definition.json` is `ChatGenieSecret`.

The production frontend invokes the Fabric User Data Function endpoint with a
Microsoft Entra bearer token. It also obtains the delegated Power BI
`Report.Read.All` and `Dataset.Read.All` scopes for user-owns-data report
embedding. The SPN credentials remain entirely inside the function runtime.
Calling the public endpoint without the Fabric bearer token returns HTTP 401 by
design.

`Connect Fabric` uses the MSAL popup relay supported by the installed MSAL 5.21
package. Fabric embeds the app in a cross-origin iframe, where full-page Entra
redirects are blocked and a normal popup's BroadcastChannel can be isolated by
browser storage partitioning. The relay opens at `/?fabric-auth=relay`; select
**Continue to Microsoft sign-in** there to open the Microsoft sign-in window. The
registered SPA redirect URI remains the app's origin. The app entry point handles
the MSAL response before starting React routing or Rayfin authentication.

The production frontend uses the owner-controlled `Chat Genie Tenant Bridge Live
v3` User Data Function by default. Override its ID only through
`VITE_FABRIC_USER_DATA_FUNCTION_ID`.

## GitHub Pages

The repository includes a GitHub Actions workflow that builds and deploys a
static GitHub Pages version of the portal. It uses an Entra/MSAL authentication
adapter rather than Rayfin's Fabric-hosted session broker, then calls the same
protected User Data Function and embeds reports with the signed-in user's
delegated Power BI token.

The Pages build sets `VITE_APP_BASE_PATH` to the repository path automatically.
Before enabling the workflow, register the exact GitHub Pages URL as a SPA
redirect URI on the Entra app. For this repository, the URI is:

```text
https://sahils1997.github.io/chat-genie/
```

The static page contains no service-principal secret. Visitors must still sign
in and have access to the Fabric workspace and Power BI report before data is
shown.

## Getting started

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the app.

## Project structure

```text
├── rayfin/
│   ├── functions/              # Protected tenant integration functions
│   └── rayfin.yml              # Fabric auth, hosting, and Functions config
├── src/
│   ├── main.tsx                # Entry point and Rayfin bootstrap
│   ├── App.tsx                 # Routes and auth gate
│   ├── components/AuthPage.tsx # Fabric sign-in UI
│   ├── pages/HomePage.tsx      # BI portal, report embed, and agent chat
│   └── services/
│       ├── bootstrap.ts          # Auth service selection
│       ├── rayfinClient.ts       # Rayfin client singleton and typed schema
│       ├── chatGenieFunctions.ts # Typed Rayfin Functions adapter
│       └── biPortalService.ts    # Portal-facing function exports
└── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Provision/reuse the Fabric backend and start local development |
| `npm run build` | Production build |
| `npm run lint` | Lint with ESLint |
| `npm run test` | Run unit tests with Vitest |
| `npm run rayfin:up` | Deploy the app to Fabric |

## Tenant setup

1. Sign in with Azure CLI as the intended tenant user:

   ```bash
   az login
   ```

2. Give the user access to the target Power BI workspaces and reports.
3. Give the user access to the Fabric workspace and publish the Data Agent.
4. Confirm the Data Agent's **Model Context Protocol** settings are enabled.

No deployment is run until the local report and MCP chat flows are approved.
