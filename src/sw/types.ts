/**
 * Files of Ba Sing Se - Service Worker Type Definitions
 */

import { StreamTicket, SwProgressPayload, SwCompletePayload } from '../types/stream'

export interface ActiveStreamEntry extends StreamTicket {
  streamId: string
  abortController: AbortController
  createdAt: number
  lastKeepAlive: number
  runningCrc32c: number
}

export type SwIncomingMessage =
  | { type: 'REGISTER_STREAM_TICKET' | 'REGISTER_STREAM'; streamId?: string; ticket?: StreamTicket }
  | { type: 'SW_KEEP_ALIVE_PING' | 'KEEP_ALIVE_PING'; streamId?: string; timestamp?: number }
  | { type: 'SW_ABORT_STREAM' | 'ABORT_STREAM'; streamId?: string }
  | { type: 'PING' }
  | { type: 'CLEAR_STREAMS' }
  | { type: 'GET_STATUS' }

export type SwOutgoingMessage =
  | { type: 'STREAM_REGISTERED'; success: boolean; streamId: string }
  | { type: 'SW_KEEP_ALIVE_PONG'; streamId?: string; timestamp: number; activeStreams: number }
  | { type: 'STREAM_ABORTED'; streamId: string }
  | { type: 'PONG'; version: string; activeStreams: number; timestamp: number }
  | { type: 'STREAMS_CLEARED' }
  | { type: 'STATUS_RESPONSE'; version: string; activeStreamsCount: number; isRegistered: boolean; isActive: boolean }
  | ({ type: 'SW_STREAM_PROGRESS' } & SwProgressPayload)
  | ({ type: 'SW_STREAM_COMPLETE' } & SwCompletePayload)
  | { type: 'SW_STREAM_ERROR'; streamId?: string; error: string; status?: number }
