/**
 * 统一的流式事件类型定义，供所有 Agent (langchain/native/react) 共用。
 */

/**
 * 工具调用的统一结构。
 */
export interface StreamToolCall {
  /**
   * 由 LLM 或执行器提供的工具调用唯一标识（如果有）。
   */
  id?: string;
  /**
   * 工具名称。
   */
  name: string;
  /**
   * JSON 解析后的参数对象（如可用）。
   */
  arguments?: Record<string, any>;
  /**
   * 原始参数字符串，便于逐步构建或展示。
   */
  rawArguments?: string;
}

/**
 * 流式事件的统一枚举。
 */
export type StreamEvent =
  | {
      type: "content";
      /**
       * LLM 输出的增量内容。
       */
      content: string;
    }
  | {
      type: "tool_call_start";
      toolCall: StreamToolCall;
    }
  | {
      type: "tool_call_delta";
      toolCall: StreamToolCall;
      /**
       * 本次增量追加的原始参数内容。
       */
      argumentDelta: string;
    }
  | {
      type: "tool_calls_complete";
      /**
       * 当前轮次已解析完成的工具调用集合。
       */
      toolCalls: StreamToolCall[];
    }
  | {
      type: "tool_execute";
      toolCall: StreamToolCall;
    }
  | {
      type: "tool_result";
      toolCallId?: string;
      toolCall?: StreamToolCall;
      result: string;
      confirmed: boolean;
    }
  | {
      type: "tool_error";
      toolCallId?: string;
      toolCall?: StreamToolCall;
      error: string;
    }
  | {
      type: "stopped";
      message: string;
    }
  | {
      type: "final_output";
      output: string;
    };


