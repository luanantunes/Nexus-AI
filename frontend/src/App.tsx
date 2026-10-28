import NexusCore from './components/NexusCore'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { getNexusStatus, sendChatMessage } from './api'
import './App.css'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
  pinned: boolean
  updatedAt: number
  projectId: string | null
}

type Project = {
  id: string
  name: string
}

type SpeechRecognitionResult = {
  transcript: string
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResult>>
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

const STORAGE_KEY = 'nexus-conversations-v1'
const PROJECTS_KEY = 'nexus-projects-v1'

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [systemStatus, setSystemStatus] = useState('connecting')
  const [toast, setToast] = useState('')
  const [storageLoaded, setStorageLoaded] = useState(false)

  // Recursos de voz
  const [isListening, setIsListening] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // Carrega o histórico salvo no navegador.
  useEffect(() => {
    try {
      const savedChats = localStorage.getItem(STORAGE_KEY)
      const savedProjects = localStorage.getItem(PROJECTS_KEY)

      if (savedChats) {
        const parsedChats: Conversation[] = JSON.parse(savedChats)
        setConversations(parsedChats)

        if (parsedChats.length > 0) {
          setActiveChatId(
            [...parsedChats].sort((a, b) => b.updatedAt - a.updatedAt)[0].id
          )
        }
      }

      if (savedProjects) {
        setProjects(JSON.parse(savedProjects))
      }
    } catch {
      console.error('Não foi possível carregar o histórico do Nexus.')
    } finally {
      setStorageLoaded(true)
    }
  }, [])

  // Salva conversas e projetos localmente.
  useEffect(() => {
    if (!storageLoaded) return

    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  }, [conversations, projects, storageLoaded])

  // Verifica se o backend está online.
  useEffect(() => {
    let active = true

    async function checkConnection() {
      try {
        await getNexusStatus()

        if (active) setSystemStatus('online')
      } catch {
        if (active) setSystemStatus('offline')
      }
    }

    checkConnection()

    return () => {
      active = false
    }
  }, [])

  // Encerra os recursos de voz ao desmontar o aplicativo.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  const activeConversation = conversations.find(
    (chat) => chat.id === activeChatId
  )

  const activeMessages = activeConversation?.messages ?? []

  const activeProject = projects.find(
    (project) =>
      project.id === (activeConversation?.projectId ?? activeProjectId)
  )

  const filteredChats = useMemo(() => {
    return [...conversations]
      .filter((chat) =>
        chat.title.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [conversations, search])

  const pinnedChats = filteredChats.filter((chat) => chat.pinned)
  const recentChats = filteredChats.filter((chat) => !chat.pinned)

  function startNewChat(projectId: string | null = null) {
    setActiveChatId(null)
    setActiveProjectId(projectId)
    setMessage('')
    setToast('')
  }

  function openConversation(chat: Conversation) {
    setActiveChatId(chat.id)
    setActiveProjectId(chat.projectId)
    setMessage('')
    setToast('')
  }

  function togglePin(chatId: string) {
    setConversations((previous) =>
      previous.map((chat) =>
        chat.id === chatId ? { ...chat, pinned: !chat.pinned } : chat
      )
    )
  }

  function createProject() {
    const name = window.prompt('Qual será o nome do projeto?')?.trim()

    if (!name) return

    const project: Project = {
      id: Date.now().toString(),
      name,
    }

    setProjects((previous) => [...previous, project])
    startNewChat(project.id)
    setToast(`Projeto "${name}" criado.`)
  }

  async function shareConversation() {
    if (activeMessages.length === 0) return

    const transcript = activeMessages
      .map((item) =>
        `${item.role === 'user' ? 'Você' : 'Nexus'}:\n${item.content}`
      )
      .join('\n\n')

    try {
      await navigator.clipboard.writeText(transcript)
      setToast('Conversa copiada para a área de transferência.')
    } catch {
      setToast('Não foi possível copiar. Verifique a permissão do navegador.')
    }
  }

  // Ativa o microfone para transformar voz em texto.
  function startListening() {
    if (isSending || isListening) return

    const speechWindow = window as SpeechWindow
    const Recognition =
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition

    if (!Recognition) {
      setToast(
        'Seu navegador não oferece reconhecimento de voz. Tente usar o Chrome.'
      )
      return
    }

    try {
      const recognition = new Recognition()

      recognition.lang = 'pt-BR'
      recognition.interimResults = false
      recognition.continuous = false

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript

        if (transcript?.trim()) {
          setMessage(transcript.trim())
          setToast('Voz reconhecida! Confira o texto e envie para o Nexus.')
        }
      }

      recognition.onerror = () => {
        setIsListening(false)
        setToast('Não consegui reconhecer sua voz. Verifique o microfone.')
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
      setToast('Estou ouvindo...')
      setIsListening(true)
      recognition.start()
    } catch {
      setIsListening(false)
      setToast('Não foi possível iniciar o microfone.')
    }
  }

  // Ativa ou desativa a leitura das respostas.
  function toggleVoice() {
    setVoiceEnabled((enabled) => {
      const nextEnabled = !enabled

      if (!nextEnabled) {
        window.speechSynthesis?.cancel()
        setToast('Respostas por voz desativadas.')
      } else {
        setToast('Respostas por voz ativadas.')
      }

      return nextEnabled
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const userMessage = message.trim()

    if (!userMessage || isSending) return

    // Evita que o microfone continue ativo durante o envio.
    recognitionRef.current?.stop()
    setIsListening(false)

    const chatId = activeChatId ?? Date.now().toString()
    const projectId = activeChatId
      ? activeConversation?.projectId ?? null
      : activeProjectId

    const userEntry: ChatMessage = {
      role: 'user',
      content: userMessage,
    }

    // Cria a conversa ou acrescenta a mensagem ao histórico existente.
    setConversations((previous) => {
      const exists = previous.some((chat) => chat.id === chatId)

      if (exists) {
        return previous.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, userEntry],
                updatedAt: Date.now(),
              }
            : chat
        )
      }

      return [
        {
          id: chatId,
          title:
            userMessage.length > 36
              ? `${userMessage.slice(0, 36)}…`
              : userMessage,
          messages: [userEntry],
          pinned: false,
          updatedAt: Date.now(),
          projectId,
        },
        ...previous,
      ]
    })

    setActiveChatId(chatId)
    setMessage('')
    setToast('')
    setIsSending(true)

    try {
      const response = await sendChatMessage(userMessage)

      // Lê a resposta em voz alta, caso o recurso esteja ativado.
      if (voiceEnabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()

        const spokenReply = new SpeechSynthesisUtterance(response.reply)
        spokenReply.lang = 'pt-BR'
        spokenReply.rate = 1
        spokenReply.pitch = 1

        window.speechSynthesis.speak(spokenReply)
      }

      setConversations((previous) =>
        previous.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  { role: 'assistant', content: response.reply },
                ],
                updatedAt: Date.now(),
              }
            : chat
        )
      )
    } catch {
      setConversations((previous) =>
        previous.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    role: 'assistant',
                    content:
                      'Não consegui responder. Confira se o backend e o Ollama estão funcionando.',
                  },
                ],
              }
            : chat
        )
      )
    } finally {
      setIsSending(false)
    }
  }

  function renderChatList(chats: Conversation[]) {
    if (chats.length === 0) {
      return <p className="sidebar-empty">Nenhuma conversa por aqui.</p>
    }

    return chats.map((chat) => (
      <div
        className={`sidebar-chat ${activeChatId === chat.id ? 'active' : ''}`}
        key={chat.id}
      >
        <button
          className="sidebar-chat-open"
          onClick={() => openConversation(chat)}
          title={chat.title}
        >
          <span className="chat-list-icon">◌</span>
          <span className="sidebar-chat-title">{chat.title}</span>
        </button>

        <button
          className={`pin-button ${chat.pinned ? 'is-pinned' : ''}`}
          onClick={() => togglePin(chat.id)}
          title={chat.pinned ? 'Desafixar conversa' : 'Fixar conversa'}
          aria-label={chat.pinned ? 'Desafixar conversa' : 'Fixar conversa'}
        >
          {chat.pinned ? '◆' : '◇'}
        </button>
      </div>
    ))
  }

  return (
    <main className={`nexus-app ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      {sidebarOpen && (
        <aside className="sidebar">
          <button className="sidebar-brand" onClick={() => startNewChat()} title="Ir para o painel Nexus">
            <span className="brand-symbol"><span>N</span></span>
            <span className="brand-name">NEXUS <span>AI</span><small>PERSONAL INTELLIGENCE</small></span>
          </button>

          <button className="new-chat-button" onClick={() => startNewChat()}>
            <span>＋</span> Nova sessão <span className="shortcut">N</span>
          </button>

          <label className="sidebar-search">
            <span>⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversas..." aria-label="Buscar conversas" />
          </label>

          <div className="sidebar-scroll">
            <section className="sidebar-section">
              <h3><span className="section-mark" /> FIXADAS</h3>
              {renderChatList(pinnedChats)}
            </section>
            <section className="sidebar-section">
              <h3><span className="section-mark" /> SESSÕES RECENTES</h3>
              {renderChatList(recentChats)}
            </section>
            <section className="sidebar-section projects-section">
              <div className="section-title-row"><h3><span className="section-mark" /> PROJETOS</h3>
                <button className="add-project-button" onClick={createProject} title="Criar projeto" aria-label="Criar projeto">＋</button>
              </div>
              {projects.length === 0 ? <p className="sidebar-empty">Seus projetos aparecerão aqui.</p> : projects.map((project) => (
                <button className={`project-item ${activeProjectId === project.id || activeConversation?.projectId === project.id ? 'active' : ''}`} key={project.id} onClick={() => startNewChat(project.id)}>
                  <span className="project-icon">▱</span><span>{project.name}</span>
                </button>
              ))}
            </section>
          </div>

          <div className="sidebar-footer">
            <span className={`status-dot ${systemStatus}`} />
            <div><strong>Nexus Core</strong><small>{systemStatus === 'online' ? 'Sistemas operacionais' : systemStatus === 'offline' ? 'Backend desconectado' : 'Estabelecendo conexão'}</small></div>
            <span className="local-badge">LOCAL</span>
          </div>
        </aside>
      )}

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Recolher menu' : 'Expandir menu'} title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}>☰</button>
            <div className="breadcrumb"><span>COMMAND CENTER</span><span className="breadcrumb-separator">/</span><strong>{activeConversation?.title ?? activeProject?.name ?? 'Visão geral'}</strong></div>
          </div>
          <div className="topbar-actions">
            <span className={`connection-label ${systemStatus}`}><span className={`status-dot ${systemStatus}`} />{systemStatus === 'online' ? 'TODOS OS SISTEMAS OK' : systemStatus === 'offline' ? 'SISTEMA OFFLINE' : 'CONECTANDO'}</span>
            <button className="share-button" onClick={shareConversation} disabled={activeMessages.length === 0} title="Copiar conversa para compartilhar"><span>↗</span> Exportar sessão</button>
          </div>
        </header>

        <div className="dashboard-scroll" key={activeChatId ?? activeProjectId ?? 'welcome'}>
          <div className="dashboard-heading"><div><p className="eyebrow"><span className="live-pulse" /> INTERFACE DE INTELIGÊNCIA PESSOAL</p><h1>Bom te ver <span>de novo.</span></h1><p className="dashboard-subtitle">Seu espaço de trabalho inteligente está pronto.</p></div><div className="system-clock"><span className="clock-dot" /> NEXUS OS <small>AMBIENTE LOCAL</small></div></div>

          <div className="dashboard-grid">
            <section className="core-panel">
              <div className="panel-topline"><span>01 / NÚCLEO DE IA</span><span className="core-state"><i /> {isSending ? 'PROCESSANDO' : isListening ? 'ESCUTANDO' : 'EM ESPERA'}</span></div>

              <div
                className={[
                  'core-visual',
                  isListening && 'core-listening',
                  isSending && 'core-thinking',
                  systemStatus === 'offline' && 'core-offline',
                  systemStatus === 'online' && !isListening && !isSending && 'core-online',
                ].filter(Boolean).join(' ')}
              >

                <div className="core-orbit orbit-one" /><div className="core-orbit orbit-two" /><div className="core-orbit orbit-three" />
                <div className="core-crosshair horizontal" /><div className="core-crosshair vertical" />
                <div className="core-halo" />
                <div className="welcome-orb">
                  <NexusCore
                    mode={
                      systemStatus === 'offline' ? 'offline' :
                        isListening ? 'listening' :
                          isSending ? 'thinking' :
                            'idle'
                    }
                  />
                </div>

                <span className="core-coordinate coordinate-top">
                  NX-01{' '}
                  <b>
                    {systemStatus === 'offline'
                      ? 'OFFLINE'
                      : isListening
                        ? 'LISTENING'
                        : isSending
                          ? 'PROCESSING'
                          : systemStatus === 'connecting'
                            ? 'CONNECTING'
                            : 'ACTIVE'}
                  </b>
                </span>
                <span className="core-coordinate coordinate-bottom">NEURAL ENGINE / LOCAL</span>

                {/* Painel técnico esquerdo */}
                <div className="hud-readout hud-readout-left">
                  <span className="hud-readout-label">CORE STATUS</span>
                  <strong>
                    {systemStatus === 'offline'
                      ? 'OFFLINE'
                      : systemStatus === 'connecting'
                        ? 'CONNECTING'
                        : isListening
                          ? 'LISTENING'
                          : isSending
                            ? 'PROCESSING'
                            : 'STANDBY'}
                  </strong>
                  <span className="hud-readout-detail">
                    {systemStatus === 'online'
                      ? 'API LINK ESTABLISHED'
                      : 'CHECK CONNECTION'}
                  </span>
                  <span className="hud-readout-line" />
                </div>

                {/* Painel técnico direito */}
                <div className="hud-readout hud-readout-right">
                  <span className="hud-readout-label">NEURAL ENGINE</span>
                  <strong>QWEN 2.5</strong>
                  <span className="hud-readout-detail">3B / LOCAL MODEL</span>
                  <span className="hud-readout-line" />
                </div>

                {/* Painel inferior esquerdo */}
                <div className="hud-readout hud-readout-bottom-left">
                  <span className="hud-readout-label">VOICE MODULE</span>
                  <strong>{isListening ? 'LISTENING' : 'STANDBY'}</strong>
                  <span className="hud-readout-detail">
                    OUTPUT {voiceEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>

                {/* Painel inferior direito */}
                <div className="hud-readout hud-readout-bottom-right">
                  <span className="hud-readout-label">SESSION DATA</span>
                  <strong>
                    {String(activeMessages.length).padStart(2, '0')}
                  </strong>
                  <span className="hud-readout-detail">MESSAGES LOADED</span>
                </div>
              </div>

              <div className="core-caption"><div><h2>{isListening ? 'Estou ouvindo.' : isSending ? 'Processando sua solicitação.' : 'À sua disposição.'}</h2><p>{isListening ? 'Fale naturalmente. Estou capturando sua voz.' : 'Converse por voz ou envie uma mensagem para começar.'}</p></div><span className={`status-pill ${systemStatus}`}><i /> {systemStatus === 'online' ? 'CONECTADO' : systemStatus === 'offline' ? 'DESCONECTADO' : 'CONECTANDO'}</span></div>
            </section>

            <aside className="right-rail">
              <section className="info-card system-card"><div className="card-heading"><span className="card-icon">⌘</span><span>SISTEMA</span><span className="card-live"><i /> LIVE</span></div><div className="system-main-status"><span className={`status-dot ${systemStatus}`} /><div><strong>{systemStatus === 'online' ? 'Núcleo conectado' : systemStatus === 'offline' ? 'Conexão indisponível' : 'Conectando ao núcleo'}</strong><small>{systemStatus === 'online' ? 'API Nexus respondendo' : systemStatus === 'offline' ? 'Verifique o backend FastAPI' : 'Verificando disponibilidade'}</small></div></div><div className="info-divider" /><div className="metric-row"><span>Modelo de linguagem</span><strong>Qwen 2.5 · 3B</strong></div><div className="metric-row"><span>Processamento</span><strong>Local</strong></div><div className="metric-row"><span>Saída de voz</span><strong>{voiceEnabled ? 'Ativada' : 'Desativada'}</strong></div></section>

              <section className="info-card activity-card"><div className="card-heading"><span className="card-icon">⌁</span><span>CONTROLE DE VOZ</span></div><p className="card-description">Interaja com o Nexus sem precisar digitar.</p><button className={`voice-control ${isListening ? 'is-listening' : ''}`} onClick={startListening} disabled={isSending || isListening}><span className="voice-control-icon">{isListening ? '●' : '◖'}</span><span><strong>{isListening ? 'Escutando agora' : 'Ativar microfone'}</strong><small>{isListening ? 'Fale sua solicitação' : 'Reconhecimento em português'}</small></span><span className="control-arrow">↗</span></button><button className={`voice-toggle ${voiceEnabled ? 'enabled' : ''}`} onClick={toggleVoice}><span>{voiceEnabled ? '◖' : '◗'}</span><span>Respostas faladas</span><strong>{voiceEnabled ? 'ON' : 'OFF'}</strong></button></section>

              <section className="info-card session-card"><div className="card-heading"><span className="card-icon">▤</span><span>SESSÃO ATUAL</span></div><div className="session-number">{activeMessages.length.toString().padStart(2, '0')} <small>mensagens</small></div><p>{activeConversation?.title ?? (activeProject ? `Projeto: ${activeProject.name}` : 'Nenhuma sessão selecionada')}</p><button className="text-action" onClick={() => startNewChat(activeProjectId)}>＋ Iniciar nova sessão</button></section>
            </aside>
          </div>

          {activeMessages.length > 0 && <section className="conversation-panel"><div className="conversation-heading"><div><p className="eyebrow">HISTÓRICO DA SESSÃO</p><h2>{activeConversation?.title ?? 'Conversa atual'}</h2></div><span>{activeMessages.length} mensagens</span></div><div className="messages-area" aria-live="polite">{activeMessages.map((chatMessage, index) => <article className={`message-row ${chatMessage.role}`} key={`${activeChatId}-${index}`}>{chatMessage.role === 'assistant' && <div className="message-avatar assistant-avatar">N</div>}<div className="message-body"><div className="message-author">{chatMessage.role === 'user' ? 'Você' : 'Nexus'}{chatMessage.role === 'assistant' && <span className="assistant-tag">AI</span>}</div><p>{chatMessage.content}</p></div>{chatMessage.role === 'user' && <div className="message-avatar user-avatar">L</div>}</article>)}{isSending && <article className="message-row assistant"><div className="message-avatar assistant-avatar">N</div><div className="message-body"><div className="message-author">Nexus</div><p className="typing-indicator"><span /><span /><span /></p></div></article>}</div></section>}

          {activeMessages.length === 0 && <section className="quick-actions"><div className="quick-actions-heading"><div><p className="eyebrow">ATALHOS INTELIGENTES</p><h2>Por onde começamos?</h2></div><span>ESCOLHA UMA DIREÇÃO</span></div><div className="suggestion-grid"><button className="suggestion-card" onClick={() => setMessage('Me ajude a planejar um projeto de software.')}><span className="suggestion-icon amber">✳</span><span className="suggestion-copy"><strong>Planejar um projeto</strong><small>Transforme uma ideia em etapas práticas.</small></span><span className="suggestion-arrow">↗</span></button><button className="suggestion-card" onClick={() => setMessage('Me ajude a escrever e revisar um código.')}><span className="suggestion-icon teal">{'</>'}</span><span className="suggestion-copy"><strong>Desenvolver código</strong><small>Construa, depure e melhore soluções.</small></span><span className="suggestion-arrow">↗</span></button><button className="suggestion-card" onClick={() => setMessage('Explique um assunto complexo de forma simples.')}><span className="suggestion-icon coral">◈</span><span className="suggestion-copy"><strong>Aprender algo novo</strong><small>Explore conceitos com clareza.</small></span><span className="suggestion-arrow">↗</span></button></div></section>}
        </div>

        <footer className="composer-area">
          {toast && <div className="toast-message" role="status">{toast}<button onClick={() => setToast('')} aria-label="Fechar aviso">×</button></div>}
          <form className="message-composer" onSubmit={handleSubmit}><span className="composer-prompt">⌁</span><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={activeProject ? `Pergunte algo sobre ${activeProject.name}...` : 'Envie uma instrução ao Nexus...'} aria-label="Mensagem para o Nexus" disabled={isSending} /><span className="composer-hint">ENTER ↵</span><button className={`voice-button mic-button ${isListening ? 'is-listening' : ''}`} type="button" onClick={startListening} disabled={isSending || isListening} title={isListening ? 'Estou ouvindo...' : 'Falar com o Nexus'} aria-label="Falar com o Nexus">{isListening ? '●' : '🎙'}</button><button className="send-button" type="submit" disabled={isSending || !message.trim()} aria-label="Enviar mensagem">{isSending ? '…' : '↑'}</button></form>
          <p className="composer-disclaimer"><span className="disclaimer-dot" /> Nexus AI <span>·</span> Respostas geradas localmente podem conter erros; confira informações importantes.</p>
        </footer>
      </section>
    </main>
  )
}

export default App