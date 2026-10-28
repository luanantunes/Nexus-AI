
const API_URL = 'http://127.0.0.1:8000'

export type NexusStatus = {
  name: string
  state: string
  message: string
}

export type ChatResponse = {
  reply: string
}

export async function getNexusStatus(): Promise<NexusStatus> {
  const response = await fetch(`${API_URL}/api/assistant`)

  if (!response.ok) {
    throw new Error('Não foi possível consultar o Nexus.')
  }

  return response.json()
}

export async function sendChatMessage(
  message: string,
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })

  if (!response.ok) {
    throw new Error('Não foi possível enviar a mensagem ao Nexus.')
  }

  return response.json()
}
