import { createRoomWebSocketHandler, loadAnimeSeed, roomCount } from '../scripts/ws-room-server.mjs'

let seedReady = null

async function ensureSeedLoaded() {
  seedReady ??= loadAnimeSeed()
  return seedReady
}

export const onRequest = async (context) => {
  const upgradeHeader = context.request.headers.get('upgrade')

  if (upgradeHeader?.toLowerCase() === 'websocket') {
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
