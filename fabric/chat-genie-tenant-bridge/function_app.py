import requests
import fabric.functions as fn
from azure.identity import ClientSecretCredential

udf = fn.UserDataFunctions()

WORKSPACE_ID = "238b7fdf-e09a-4d02-9012-8afed2aee1b2"
POWER_BI_BASE_URL = "https://api.powerbi.com/v1.0/myorg"
FABRIC_BASE_URL = "https://api.fabric.microsoft.com/v1"


@udf.function()
def health_check() -> dict:
    return {"status": "ok", "service": "Chat Genie Tenant Bridge"}


def _credential(variables: dict) -> ClientSecretCredential:
    tenant_id = variables.get("CHAT_GENIE_TENANT_ID", "")
    client_id = variables.get("CHAT_GENIE_CLIENT_ID", "")
    client_secret = variables.get("CHAT_GENIE_CLIENT_SECRET", "")
    if not tenant_id or not client_id or not client_secret:
        raise RuntimeError(
            "CHAT_GENIE_TENANT_ID, CHAT_GENIE_CLIENT_ID, and "
            "CHAT_GENIE_CLIENT_SECRET must be configured as Fabric runtime variables."
        )
    return ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )


def _request(
    url: str,
    audience: str,
    variables: dict,
    method: str = "GET",
    body: dict | None = None,
) -> dict:
    token = _credential(variables).get_token(f"{audience}/.default").token
    response = requests.request(
        method,
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=45,
    )
    if not response.ok:
        try:
            payload = response.json()
        except ValueError:
            detail = response.text.strip()
        else:
            error = payload.get("error", payload) if isinstance(payload, dict) else payload
            detail = (
                error.get("message", str(error))
                if isinstance(error, dict)
                else str(error)
            )
        raise RuntimeError(
            f"Tenant API request failed ({response.status_code}) for {method} {url}: "
            f"{detail or response.reason}"
        )
    return response.json() if response.content else {}


def _mcp_call(endpoint: str, token: str, request_id: int, method: str, params: dict) -> dict:
    response = requests.post(
        endpoint,
        headers={
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
        },
        json={
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        },
        timeout=120,
    )
    response.raise_for_status()
    result = response.json()
    if "error" in result:
        raise RuntimeError(result["error"].get("message", "The Data Agent MCP request failed."))
    return result.get("result", {})


@udf.connection(argName="varLib", alias="ChatGenieSecret")
@udf.function()
def list_reports(varLib: fn.FabricVariablesClient) -> list:
    variables = varLib.getVariables()
    groups = _request(
        f"{POWER_BI_BASE_URL}/groups?$top=500",
        "https://analysis.windows.net/powerbi/api",
        variables,
    )
    reports = []
    for group in groups.get("value", []):
        result = _request(
            f"{POWER_BI_BASE_URL}/groups/{group['id']}/reports",
            "https://analysis.windows.net/powerbi/api",
            variables,
        )
        for report in result.get("value", []):
            reports.append(
                {
                    "id": report.get("id"),
                    "name": report.get("name"),
                    "workspaceId": group.get("id"),
                    "workspaceName": group.get("name"),
                    "webUrl": report.get("webUrl"),
                    "embedUrl": report.get("embedUrl"),
                    "datasetId": report.get("datasetId"),
                    "modifiedDateTime": report.get("modifiedDateTime"),
                }
            )
    return reports


@udf.connection(argName="varLib", alias="ChatGenieSecret")
@udf.function()
def list_agents(varLib: fn.FabricVariablesClient) -> list:
    variables = varLib.getVariables()
    result = _request(
        f"{FABRIC_BASE_URL}/workspaces/{WORKSPACE_ID}/dataAgents",
        "https://api.fabric.microsoft.com",
        variables,
    )
    return [
        {
            "id": agent.get("id"),
            "name": agent.get("displayName") or agent.get("name"),
            "description": agent.get("description"),
            "source": "Fabric Data Agent",
        }
        for agent in result.get("value", [])
    ]


@udf.connection(argName="varLib", alias="ChatGenieSecret")
@udf.function()
def get_embed_config(
    reportId: str,
    workspaceId: str,
    varLib: fn.FabricVariablesClient,
) -> dict:
    if not reportId or not workspaceId:
        raise ValueError("reportId and workspaceId are required.")
    variables = varLib.getVariables()
    report = _request(
        f"{POWER_BI_BASE_URL}/groups/{workspaceId}/reports/{reportId}",
        "https://analysis.windows.net/powerbi/api",
        variables,
    )
    embed_url = report.get("embedUrl")
    if not embed_url:
        raise RuntimeError(f"Power BI report {reportId} did not include an embedUrl.")
    token = _request(
        f"{POWER_BI_BASE_URL}/groups/{workspaceId}/reports/{reportId}/GenerateToken",
        "https://analysis.windows.net/powerbi/api",
        variables,
        method="POST",
        body={"accessLevel": "View"},
    )
    access_token = token.get("token")
    if not access_token:
        raise RuntimeError(f"Power BI did not return an embed token for report {reportId}.")
    return {
        "reportId": reportId,
        "embedUrl": embed_url,
        "accessToken": access_token,
        "expiration": token.get("expiration"),
        "tokenType": "Embed",
    }


@udf.connection(argName="varLib", alias="ChatGenieSecret")
@udf.function()
def ask_agent(
    agentId: str,
    question: str,
    reportId: str,
    conversationId: str,
    varLib: fn.FabricVariablesClient,
) -> dict:
    if not agentId or not question:
        raise ValueError("agentId and question are required.")
    endpoint = (
        f"{FABRIC_BASE_URL}/mcp/workspaces/{WORKSPACE_ID}/dataagents/"
        f"{agentId}/agent"
    )
    variables = varLib.getVariables()
    token = _credential(variables).get_token(
        "https://api.fabric.microsoft.com/.default"
    ).token
    _mcp_call(
        endpoint,
        token,
        1,
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "chat-genie-tenant-bridge", "version": "1.0.0"},
        },
    )
    tools = _mcp_call(endpoint, token, 2, "tools/list", {}).get("tools", [])
    tool = tools[0] if tools else None
    if not tool:
        raise RuntimeError("The published Data Agent MCP server exposed no tools.")
    properties = tool.get("inputSchema", {}).get("properties", {})
    if "userQuestion" in properties:
        arguments = {"userQuestion": question}
    elif "question" in properties:
        arguments = {"question": question}
    else:
        arguments = {"input": question}
    result = _mcp_call(
        endpoint,
        token,
        3,
        "tools/call",
        {"name": tool["name"], "arguments": arguments},
    )
    answer = "\n".join(
        item.get("text", "")
        for item in result.get("content", [])
        if item.get("type") == "text"
    ).strip()
    if not answer:
        raise RuntimeError("The Data Agent returned no answer text.")
    return {"answer": answer, "conversationId": conversationId or None}
