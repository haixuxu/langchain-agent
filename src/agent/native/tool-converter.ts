import { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { MCPClientWrapper } from "../../mcp/mcp-client.js";

/**
 * OpenAI Function 格式
 */
export interface OpenAIFunction {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * 内部工具定义（包含客户端引用）
 */
export interface NativeTool {
  name: string;
  description?: string;
  function: OpenAIFunction["function"];
  client: MCPClientWrapper;
  mcpToolName: string;
  serverName: string;
}

/**
 * 将 MCP 工具转换为 OpenAI Function 格式
 */
export function convertMCPToolToOpenAIFunction(
  tool: MCPTool,
  client: MCPClientWrapper,
  serverName: string
): NativeTool {
  const toolName = `${serverName}_${tool.name}`;
  
  // 转换输入 schema
  const properties: Record<string, any> = {};
  const required: string[] = [];
  
  if (tool.inputSchema && typeof tool.inputSchema === "object") {
    const schema = tool.inputSchema as any;
    const schemaProps = schema.properties || {};
    const schemaRequired = schema.required || [];
    
    for (const [key, value] of Object.entries(schemaProps)) {
      const prop = value as any;
      const propDef: any = {
        type: prop.type || "string",
      };
      
      if (prop.description) {
        propDef.description = prop.description;
      }
      
      // 处理枚举
      if (prop.enum) {
        propDef.enum = prop.enum;
      }
      
      // 处理数组
      if (prop.type === "array" && prop.items) {
        propDef.items = prop.items;
      }
      
      properties[key] = propDef;
      
      if (schemaRequired.includes(key)) {
        required.push(key);
      }
    }
  }
  
  const functionDef: OpenAIFunction["function"] = {
    name: toolName,
    description: tool.description || `调用 ${serverName} 服务器的 ${tool.name} 工具`,
    parameters: {
      type: "object",
      properties,
      ...(required.length > 0 && { required }),
    },
  };
  
  return {
    name: toolName,
    description: tool.description,
    function: functionDef,
    client,
    mcpToolName: tool.name,
    serverName,
  };
}

/**
 * 将 NativeTool 转换为 OpenAI Function 格式（用于 API 调用）
 */
export function nativeToolToOpenAIFunction(tool: NativeTool): OpenAIFunction {
  return {
    type: "function",
    function: tool.function,
  };
}

