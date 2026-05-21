import { createRoomWebSocketHandler, loadAnimeSeed, roomCount } from '../scripts/ws-room-server.mjs'

let seedReady = null

async function ensureSeedLoaded() {
  seedReady ??= loadAnimeSeed()
  return seedReady
}

export const onRequest = async (context) => {
  const upgradeHeader = context.request.headers.get('upgrade')
  const url = new URL(context.request.url)

  if (upgradeHeader?.toLowerCase() === 'websocket') {
    if (url.pathname !== '/websocket' && url.pathname !== '/ws') {
      return new Response('Bad WebSocket path', { status: 400 })
    }
    await ensureSeedLoaded()
    return {
      websocket: createRoomWebSocketHandler(),
    }
  }

  await ensureSeedLoaded()
  return new Response(JSON.stringify({ ok: true, rooms: roomCount(), endpoint: '/ws' }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      upgrade: 'websocket',
    },
    status: 426,
  })
}
