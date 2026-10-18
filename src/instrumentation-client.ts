import { initBotId } from "botid/client/core";

// Bot protection for the Continue button only; the MCP endpoint serves agents and must stay unprotected.
initBotId({ protect: [{ path: "/authorize/continue", method: "POST" }] });
