import { createNextHandler } from "mcp-use/next";
import server from "@/mcp/server";

export const maxDuration = 60;

export const { GET, POST, DELETE, OPTIONS } = createNextHandler(server);
