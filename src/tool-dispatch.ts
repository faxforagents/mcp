import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ErrorCode, McpError, type CallToolResult, type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const ID_PREFIXES: Record<string, string> = {
  upload_id: 'up',
  document_id: 'doc',
  quote_id: 'quote',
  approval_id: 'apr',
  fax_id: 'fax',
  review_request_id: 'apr',
  inbox_id: 'inb',
  inbox_item_id: 'inb',
};

function invalidInput(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { ok: false, error_code: 'invalid_input', message },
    isError: true,
  };
}

function expectedType(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return expectedType(schema.unwrap());
  if (schema instanceof z.ZodDefault) return expectedType(schema.removeDefault());
  if (schema instanceof z.ZodNumber) return schema.isInt ? 'integer' : 'number';
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodRecord || schema instanceof z.ZodObject) return 'object';
  throw new Error('Unsupported tool argument schema');
}

/** Keep the advertised schemas while handling validation refusals before the SDK turns them into plain text. */
export function toolDispatch(server: McpServer) {
  const calls = new Map<string, (args: Record<string, unknown>) => Promise<CallToolResult>>();

  function registerTool<S extends z.ZodRawShape>(
    name: string,
    config: { description: string; inputSchema: S; outputSchema: z.ZodObject<z.ZodRawShape>; annotations: ToolAnnotations },
    callback: (args: z.output<z.ZodObject<S>>) => Promise<CallToolResult>,
  ): void {
    const input = z.object(config.inputSchema);
    const registered = server.registerTool(name, { ...config, inputSchema: input }, callback);
    calls.set(name, async (args) => {
      if (!registered.enabled) throw new McpError(ErrorCode.InvalidParams, `Tool ${name} disabled`);
      const parsed = input.safeParse(args);
      let response: CallToolResult;
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        const argument = issue.path.join('.');
        const field = config.inputSchema[String(issue.path[0])]!;
        const expected = issue.path.length > 1 && issue.code === 'invalid_type' ? issue.expected : expectedType(field);
        response = invalidInput(`${argument} requires a value of type ${expected}. Correct the argument and try again.`);
      } else {
        for (const [argument, value] of Object.entries(parsed.data)) {
          const prefix = ID_PREFIXES[argument];
          if (prefix && value !== null && value !== undefined && !new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(String(value))) {
            return invalidInput(
              `${argument} must be a string with the ${prefix}_ prefix and 32 lowercase hexadecimal characters. Correct the argument and try again.`,
            );
          }
        }
        response = await callback(parsed.data);
      }
      // Validate without rebuilding the response or dropping fields from its envelope.
      if (!response.isError) config.outputSchema.parse(response.structuredContent);
      return response;
    });
  }

  function install(): void {
    // The protocol schema still rejects non-object arguments before tool dispatch.
    server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const call = calls.get(request.params.name);
        if (!call) throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
        return await call(request.params.arguments ?? {});
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
      }
    });
  }

  return { registerTool, install };
}
