/**
 * The slice of the Telegram Bot API we actually consume.
 *
 * Deliberately NOT the whole `Update` schema. Telegram's update object has
 * dozens of optional branches; typing all of them would be a large surface we
 * never read. Everything here is narrowed from `unknown` by the guards below,
 * because the body arrives over the wire and TypeScript types are not
 * validation.
 */

export interface TelegramChat {
  readonly id: number;
  readonly type: string;
}

export interface TelegramUser {
  readonly id: number;
  readonly first_name?: string;
  readonly language_code?: string;
}

export interface TelegramMessage {
  readonly message_id: number;
  readonly chat: TelegramChat;
  readonly from?: TelegramUser;
  readonly text?: string;
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: TelegramMessage;
  readonly edited_message?: TelegramMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asMessage(value: unknown): TelegramMessage | undefined {
  if (!isRecord(value)) return undefined;

  const chat = value.chat;
  if (!isRecord(chat) || typeof chat.id !== 'number' || typeof chat.type !== 'string') {
    return undefined;
  }
  if (typeof value.message_id !== 'number') return undefined;

  const from = isRecord(value.from) && typeof value.from.id === 'number' ? value.from : undefined;

  return {
    message_id: value.message_id,
    chat: { id: chat.id, type: chat.type },
    from: from
      ? {
          id: from.id as number,
          first_name: typeof from.first_name === 'string' ? from.first_name : undefined,
          language_code: typeof from.language_code === 'string' ? from.language_code : undefined,
        }
      : undefined,
    text: typeof value.text === 'string' ? value.text : undefined,
  };
}

/**
 * Narrow a webhook body to an update we can act on.
 *
 * Returns `undefined` rather than throwing: an unparseable update is answered
 * `200` and dropped. Telegram retries anything else, forever, and a body we
 * cannot read will not read better the fourth time.
 */
export function parseUpdate(body: unknown): TelegramUpdate | undefined {
  if (!isRecord(body) || typeof body.update_id !== 'number') return undefined;

  return {
    update_id: body.update_id,
    message: asMessage(body.message),
    edited_message: asMessage(body.edited_message),
  };
}
