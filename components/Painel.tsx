'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'

/* ------------------------------------------------------------------ tipos da ficha (gateway) */
interface Fatura { fatura_id: number; vencimento: string; valor: number; link_boleto: string | null; linha_digitavel: string | null; pix: string | null; vencida: boolean; dias_atraso: number }
interface Paga { fatura_id: number; vencimento: string | null; pago_em: string | null; valor_pago: number }
interface Sessao { inicio: string | null; fim: string | null; ip: string | null; nas: string | null; causa: string | null }
interface Chamado { numero: string | null; tipo: string | null; status: string | null; aberto_em: string | null; finalizado_em: string | null; resumo: string | null; responsavel: string | null; ordens_servico: { id: number; status: string | null }[] }
interface Ficha {
  gerado_em: string
  situacao: {
    contrato: { texto: string | null; motivo: string | null; problema: boolean }
    conexao: { online: boolean | null; mensagem: string | null; problema: boolean }
    financeiro: { vencidas: number; valor_vencido: number; problema: boolean }
    aba_sugerida: Aba
  }
  cliente: null | { id: number; nome: string | null; documento: string | null; tipo_cliente: string | null; data_cadastro: string | null; telefones: string[]; emails: string[]; status_crm: { status: string } | null }
  contrato: { id: number; status: string | null; plano: string | null; vencimento_dia: string | null; pop: string | null; endereco: string | null; latitude: string | null; longitude: string | null; documentos: string[] }
  financeiro: { abertas: Fatura[]; pagas: Paga[]; total_aberto: number; total_vencido: number; ultimo_pagamento: Paga | null; consultado: boolean }
  rede: { online: boolean | null; mensagem: string | null; login: string | null; sessoes: Sessao[]; ultima_queda: string | null; consultado: boolean }
  atendimento: { chamados: Chamado[]; consultado: boolean }
  emails: { etapa: string; origem: string; status: string; enviado_em: string }[]
}
type Aba = 'cliente' | 'financeiro' | 'rede' | 'atendimento' | 'historico'

/* ------------------------------------------------------------------ formatação */
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const brl = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const data = (iso?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—' }
const dataHora = (iso?: string | null) => {
  if (!iso) return '—'
  // Datas sem horário (vencimento, pagamento) não passam pelo fuso: senão viram o dia anterior às 21h.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return data(iso).slice(0, 5)
  const d = new Date(iso); if (isNaN(+d)) return data(iso)
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
/** "350MBPS-TRIBOBO" → "350 Mega". */
const plano = (p?: string | null) => { const m = /(\d+)\s*(MBPS|MB|MEGA|M)(?![A-Z])/i.exec(p ?? ''); return m ? `${m[1]} Mega` : (p ?? '—') }
const mesDe = (iso: string) => { const [a, m] = iso.split('-').map(Number); return `${MESES_LONGOS[m - 1]} ${a}` }
function tempoDeCasa(iso?: string | null) {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? ''); if (!m) return '—'
  const ini = new Date(Number(m[1]), Number(m[2]) - 1, 1); const hoje = new Date()
  let meses = (hoje.getFullYear() - ini.getFullYear()) * 12 + hoje.getMonth() - ini.getMonth()
  meses = Math.max(meses, 0)
  return `${MESES[Number(m[2]) - 1]}/${m[1]} · ${Math.floor(meses / 12)}a ${meses % 12}m`
}
const mascarar = (doc?: string | null) => {
  const d = (doc ?? '').replace(/\D/g, '')
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`
  return '—'
}
const formatarDoc = (doc?: string | null) => {
  const d = (doc ?? '').replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return '—'
}
const telefone = (t: string) => {
  const d = t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t
}
const iniciais = (n?: string | null) => (n ?? '?').trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
const titulo = (t?: string | null) => (t ?? '').toLowerCase().replace(/(^|[\s(])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase())
const DOCS: Record<string, string> = { contrato: 'Contrato', termoadesao: 'Termo de adesão', contratofidelidade: 'Fidelidade', termocomodato: 'Comodato', cancelamento: 'Cancelamento' }
const ETAPAS: Record<string, string> = {
  PRE_FATURA_D5: 'E-mail: fatura disponível', VENCE_AMANHA: 'E-mail: vence amanhã', VENCE_HOJE: 'E-mail: vence hoje',
  ATRASO_D2: 'E-mail: fatura pendente', PRE_BLOQUEIO_D4: 'E-mail: aviso de bloqueio', BOAS_VINDAS: 'E-mail: boas-vindas',
  FATURA: 'E-mail: fatura enviada pelo atendimento', LISTA: 'E-mail: faturas em aberto enviadas pelo atendimento',
}

/** Copiar para a área de transferência, com alternativa para quando o Chatwoot não libera o clipboard ao iframe. */
async function copiarTexto(t: string) {
  try { await navigator.clipboard.writeText(t); return true } catch {
    const el = document.createElement('textarea'); el.value = t; el.style.position = 'fixed'; el.style.opacity = '0'
    document.body.appendChild(el); el.select(); const ok = document.execCommand('copy'); el.remove(); return ok
  }
}

const Seta = ({ lado, ativa, onClick }: { lado: 'esq' | 'dir'; ativa: boolean; onClick: () => void }) => (
  <button type="button" className="seta" aria-label={lado === 'esq' ? 'Abas anteriores' : 'Próximas abas'} onClick={onClick} style={{ color: ativa ? '#DCDDFB' : '#3A3C70' }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={lado === 'esq' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>
  </button>
)

/* ------------------------------------------------------------------ componente */
export default function Painel({ atendente }: { atendente: string }) {
  const [contrato, setContrato] = useState<number | null>(null)
  const [semContrato, setSemContrato] = useState(false)
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [aba, setAba] = useState<Aba | null>(null)
  const [desloc, setDesloc] = useState(0)
  const [cpfVisivel, setCpfVisivel] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  // Contexto do Chatwoot (Dashboard App): o contrato vem dos atributos do contato.
  useEffect(() => {
    const doLink = Number(new URLSearchParams(window.location.search).get('contrato'))
    if (doLink > 0) setContrato(doLink)
    const origem = process.env.NEXT_PUBLIC_CHATWOOT_URL ?? 'https://chat.vivanettelecom.com.br'
    function receber(e: MessageEvent) {
      if (e.origin !== origem) return
      let d: { event?: string; data?: { contact?: { custom_attributes?: Record<string, unknown> } } }
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
      if (d?.event !== 'appContext') return
      const c = Number(d.data?.contact?.custom_attributes?.contrato)
      if (c > 0) { setSemContrato(false); setContrato(c) } else { setSemContrato(true); setContrato(null); setFicha(null) }
    }
    window.addEventListener('message', receber)
    window.parent?.postMessage('chatwoot-dashboard-app:fetch-info', '*')
    return () => window.removeEventListener('message', receber)
  }, [])

  const carregar = useCallback(async (c: number) => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/ficha?contrato=${c}`, { cache: 'no-store' })
      if (r.status === 401) { window.location.href = '/entrar'; return }
      const j = await r.json()
      if (!r.ok) { setErro(j.erro === 'contrato_nao_encontrado' ? 'Contrato não encontrado entre os da Viva Net.' : 'Não foi possível carregar a ficha agora.'); setFicha(null) }
      else setFicha(j)
    } catch { setErro('Não foi possível carregar a ficha agora.') }
    setCarregando(false)
  }, [])

  useEffect(() => { if (contrato) { setAba(null); setDesloc(0); setCpfVisivel(false); carregar(contrato) } }, [contrato, carregar])

  const marcar = (chave: string) => { setFeito(chave); setTimeout(() => setFeito((f) => (f === chave ? null : f)), 1600) }
  const mostrarAviso = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 3000) }
  async function copiar(chave: string, t?: string | null) { if (t && (await copiarTexto(t))) marcar(chave) }
  async function enviarFatura(f: Fatura) {
    if (!ficha) return
    const r = await fetch('/api/email-fatura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contrato_id: ficha.contrato.id, fatura_id: f.fatura_id }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { marcar('email' + f.fatura_id); mostrarAviso(`Fatura enviada para ${j.email}`) }
    else mostrarAviso(j.erro === 'cliente_sem_email' ? 'Cliente sem e-mail válido no cadastro.' : 'Não foi possível enviar a fatura.')
  }

  // Linha do tempo única, montada com tudo o que a ficha traz.
  const historico = useMemo(() => {
    if (!ficha) return []
    const ev: { quando: string; origem: string; titulo: string; detalhe: string; cor: string }[] = []
    for (const f of ficha.financeiro.abertas.filter((x) => x.vencida)) ev.push({ quando: f.vencimento, origem: 'SGP', titulo: 'Fatura vencida', detalhe: `${mesDe(f.vencimento)} · ${brl(f.valor)}`, cor: 'var(--ruim)' })
    for (const p of ficha.financeiro.pagas) if (p.pago_em) ev.push({ quando: p.pago_em, origem: 'SGP', titulo: 'Pagamento confirmado', detalhe: `${p.vencimento ? mesDe(p.vencimento) : 'Fatura'} · ${brl(p.valor_pago)}`, cor: 'var(--ok)' })
    for (const c of ficha.atendimento.chamados) {
      if (c.aberto_em) ev.push({ quando: c.aberto_em, origem: 'Atendimento', titulo: `Chamado aberto: ${c.tipo ?? ''}`, detalhe: c.resumo ?? '', cor: 'var(--indigo-claro)' })
      if (c.finalizado_em) ev.push({ quando: c.finalizado_em, origem: 'Atendimento', titulo: `Chamado finalizado: ${c.tipo ?? ''}`, detalhe: `Protocolo ${c.numero ?? '—'}`, cor: 'var(--ok)' })
    }
    for (const s of ficha.rede.sessoes) if (s.fim) ev.push({ quando: s.fim, origem: 'Rede', titulo: 'Queda de conexão', detalhe: s.causa ? `Motivo: ${s.causa}` : '', cor: 'var(--ruim)' })
    for (const e of ficha.emails) ev.push({ quando: e.enviado_em, origem: 'E-mail', titulo: ETAPAS[e.etapa] ?? e.etapa, detalhe: e.status === 'enviado' ? '' : 'Falhou no envio', cor: 'var(--indigo-claro)' })
    return ev.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 40)
  }, [ficha])

  /* ---------- estados sem ficha */
  const Moldura = ({ children }: { children: React.ReactNode }) => <div className="corpo"><div className="aviso">{children}</div></div>
  if (semContrato) return <Moldura>Este contato ainda não tem contrato no painel. Peça ao cliente o CPF ou CNPJ: quando o Vitor identificar, a ficha aparece aqui.</Moldura>
  if (!contrato) return <Moldura>Abra uma conversa para ver a ficha do cliente.</Moldura>
  if (carregando && !ficha) return <Moldura>Carregando a ficha do contrato {contrato}…</Moldura>
  if (erro && !ficha) return <Moldura>{erro} <button className="btn peq" onClick={() => carregar(contrato)}>Tentar de novo</button></Moldura>
  if (!ficha) return null

  const S = ficha.situacao
  const atual = aba ?? S.aba_sugerida
  const abas: [Aba, string, boolean][] = [
    ['cliente', 'Dados do cliente', false], ['financeiro', 'Financeiro', S.financeiro.problema],
    ['rede', 'Rede', S.conexao.problema], ['atendimento', 'Atendimento', false], ['historico', 'Histórico', false],
  ]
  const fin = ficha.financeiro
  const proxima = fin.abertas.find((f) => !f.vencida)
  const card = (rot: string, problema: boolean, txt: string, sub: string) => (
    <div className={`card${problema ? ' ruim' : ''}`}>
      <div className="rotulo">{rot}</div>
      <div className="linha" style={{ gap: 6, marginTop: 4 }}><span className="bolinha" style={{ background: problema ? 'var(--ruim)' : 'var(--ok)' }} /><span className="forte" style={{ fontWeight: 600 }}>{txt}</span></div>
      <div className="suave" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
    </div>
  )
  const conexaoTxt = S.conexao.online === null ? 'Sem leitura' : /suspens/i.test(S.contrato.texto ?? '') ? 'Bloqueada' : S.conexao.online ? 'Online' : 'Offline'
  const sessaoAtual = ficha.rede.sessoes.find((s) => !s.fim)

  return (
    <div>
      {/* Situação em um olhar */}
      <div className="cab">
        <div className="linha">
          <div className="avatar">{iniciais(ficha.cliente?.nome)}</div>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <div className="nome">{titulo(ficha.cliente?.nome) || 'Cliente'}</div>
            <div className="suave">Contrato {ficha.contrato.id} · {plano(ficha.contrato.plano)}{ficha.contrato.pop ? ` · ${ficha.contrato.pop}` : ''}</div>
          </div>
          <button className="btn peq" style={{ height: 44 }} onClick={() => copiar('contrato', String(ficha.contrato.id))}>{feito === 'contrato' ? 'Copiado' : String(ficha.contrato.id)}</button>
        </div>
        <div className="grade3">
          {card('Contrato', S.contrato.problema, S.contrato.texto ?? '—', S.contrato.motivo ?? (ficha.cliente?.data_cadastro ? `desde ${ficha.cliente.data_cadastro.slice(0, 4)}` : ''))}
          {card('Conexão', S.conexao.problema || conexaoTxt === 'Bloqueada', conexaoTxt, S.conexao.mensagem ?? '')}
          {card('Financeiro', S.financeiro.problema, S.financeiro.vencidas ? `${S.financeiro.vencidas} vencida${S.financeiro.vencidas > 1 ? 's' : ''}` : 'Em dia',
            S.financeiro.vencidas ? brl(S.financeiro.valor_vencido) : proxima ? `próx. ${data(proxima.vencimento).slice(0, 5)}` : '')}
        </div>
      </div>

      {/* Abas */}
      <div className="abas">
        <Seta lado="esq" ativa={desloc > 0} onClick={() => setDesloc(Math.max(0, desloc - 140))} />
        <div className="janela"><div className="faixa" style={{ transform: `translateX(-${desloc}px)` }}>
          {abas.map(([id, nome, alerta]) => (
            <button key={id} type="button" className={`aba${atual === id ? ' ativa' : ''}`} onClick={() => setAba(id)}>
              {nome}{alerta && <span className="bolinha" style={{ width: 7, height: 7, background: 'var(--ruim)' }} />}
            </button>
          ))}
        </div></div>
        <Seta lado="dir" ativa={desloc < 200} onClick={() => setDesloc(Math.min(200, desloc + 140))} />
      </div>

      <div className="corpo">
        {/* DADOS DO CLIENTE */}
        {atual === 'cliente' && <>
          <div className="card2" style={{ padding: '4px 12px' }}>
            <div className="item"><span className="suave">{ficha.cliente?.documento?.length === 14 ? 'CNPJ' : 'CPF'}</span>
              <span className="linha" style={{ gap: 8 }}><span className="mono">{cpfVisivel ? formatarDoc(ficha.cliente?.documento) : mascarar(ficha.cliente?.documento)}</span>
                <button className="btn peq" onClick={() => setCpfVisivel(!cpfVisivel)}>{cpfVisivel ? 'Ocultar' : 'Mostrar'}</button></span></div>
            {(ficha.cliente?.telefones ?? []).map((t) => (
              <div className="item" key={t}><span className="suave">Telefone</span>
                <span className="linha" style={{ gap: 8 }}><span>{telefone(t)}</span><button className="btn peq" disabled title="Em breve">Enviar WhatsApp</button></span></div>
            ))}
            {(ficha.cliente?.emails ?? []).map((e) => (
              <div className="item" key={e}><span className="suave">E-mail</span>
                <span className="linha" style={{ gap: 8, minWidth: 0 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e}</span><button className="btn peq" disabled title="Em breve">Enviar e-mail</button></span></div>
            ))}
            <div className="item"><span className="suave">Endereço</span>
              <span className="linha" style={{ gap: 8, minWidth: 0 }}><span style={{ textAlign: 'right' }}>{ficha.contrato.endereco ?? '—'}</span>
                {ficha.contrato.endereco && <button className="btn peq" onClick={() => copiar('end', ficha.contrato.endereco)}>{feito === 'end' ? 'Copiado' : 'Copiar'}</button>}</span></div>
            <div className="item"><span className="suave">Cliente desde</span><span>{tempoDeCasa(ficha.cliente?.data_cadastro)}</span></div>
            <div className="item"><span className="suave">Vencimento</span><span>{ficha.contrato.vencimento_dia ? `Todo dia ${ficha.contrato.vencimento_dia}` : '—'}</span></div>
            {ficha.cliente?.status_crm && <div className="item"><span className="suave">Status CRM</span><span>{ficha.cliente.status_crm.status}</span></div>}
          </div>
          {ficha.contrato.endereco && (
            <a className="btn" target="_blank" rel="noreferrer" href={ficha.contrato.latitude && ficha.contrato.longitude
              ? `https://www.google.com/maps?q=${ficha.contrato.latitude},${ficha.contrato.longitude}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ficha.contrato.endereco)}`}>Abrir endereço no mapa</a>
          )}
          <div className="rotulo">Documentos do contrato</div>
          <div className="grade2">
            {ficha.contrato.documentos.map((t) => (
              <a key={t} className="btn" target="_blank" rel="noreferrer" href={`/api/documento?contrato=${ficha.contrato.id}&tipo=${t}`}>{DOCS[t] ?? t}</a>
            ))}
          </div>
        </>}

        {/* FINANCEIRO */}
        {atual === 'financeiro' && <>
          <div className="grade3">
            <div className="card2"><div className="suave" style={{ fontSize: 11 }}>Em aberto</div><div className="forte" style={{ fontSize: 15 }}>{brl(fin.total_aberto)}</div><div className="suave" style={{ fontSize: 11 }}>{fin.abertas.length} fatura{fin.abertas.length === 1 ? '' : 's'}</div></div>
            <div className="card2"><div className="suave" style={{ fontSize: 11 }}>Vencidas</div><div className="forte" style={{ fontSize: 15, color: fin.total_vencido ? 'var(--ruim)' : '#fff' }}>{brl(fin.total_vencido)}</div><div className="suave" style={{ fontSize: 11 }}>{S.financeiro.vencidas || 'nenhuma'}{S.financeiro.vencidas ? ` fatura${S.financeiro.vencidas > 1 ? 's' : ''}` : ''}</div></div>
            <div className="card2"><div className="suave" style={{ fontSize: 11 }}>Último pagto.</div><div className="forte" style={{ fontSize: 15 }}>{fin.ultimo_pagamento?.pago_em ? data(fin.ultimo_pagamento.pago_em).slice(0, 5) : '—'}</div><div className="suave" style={{ fontSize: 11 }}>{fin.ultimo_pagamento ? brl(fin.ultimo_pagamento.valor_pago) : 'sem registro'}</div></div>
          </div>
          {!fin.consultado && <div className="aviso">As faturas não puderam ser consultadas agora.</div>}
          {fin.abertas.length > 0 && <div className="rotulo">Faturas</div>}
          {fin.abertas.map((f) => (
            <div className="card2" key={f.fatura_id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="linha" style={{ justifyContent: 'space-between' }}>
                <div><div className="forte" style={{ fontWeight: 600 }}>{mesDe(f.vencimento)}</div><div className="suave">vence {data(f.vencimento)}</div></div>
                <div style={{ textAlign: 'right' }}><div className="forte">{brl(f.valor)}</div><span className={`chip${f.vencida ? ' ruim' : ''}`}>{f.vencida ? 'Vencida' : 'Em aberto'}</span></div>
              </div>
              <div className="grade3" style={{ gap: 6 }}>
                <button className="btn" style={{ fontSize: 12 }} disabled={!f.pix} onClick={() => copiar('pix' + f.fatura_id, f.pix)}>{feito === 'pix' + f.fatura_id ? 'Copiado' : 'Copiar PIX'}</button>
                <a className="btn" style={{ fontSize: 12 }} target="_blank" rel="noreferrer" href={f.link_boleto ?? '#'} aria-disabled={!f.link_boleto}>Abrir boleto</a>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => enviarFatura(f)}>{feito === 'email' + f.fatura_id ? 'Enviado' : 'Enviar e-mail'}</button>
              </div>
            </div>
          ))}
          {fin.pagas.length > 0 && <>
            <div className="rotulo">Pagas nos últimos 12 meses</div>
            <div className="card2" style={{ padding: '4px 12px' }}>
              {fin.pagas.map((p) => <div className="item" key={p.fatura_id}><span>{p.vencimento ? mesDe(p.vencimento) : 'Fatura'}</span><span className="suave">pago {data(p.pago_em)} · {brl(p.valor_pago)}</span></div>)}
            </div>
          </>}
        </>}

        {/* REDE */}
        {atual === 'rede' && <>
          <div className="grade2">
            <button className="btn prim" onClick={() => carregar(ficha.contrato.id)}>{carregando ? 'Atualizando…' : 'Atualizar status'}</button>
            <button className="btn" disabled title="Em breve">Abrir chamado técnico</button>
          </div>
          <div className="card2" style={{ borderColor: S.conexao.problema ? 'var(--borda-ruim)' : 'var(--borda)' }}>
            <div className="rotulo">Conexão</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: S.conexao.problema || conexaoTxt === 'Bloqueada' ? 'var(--ruim)' : 'var(--ok)' }}>{conexaoTxt}</div>
            <div className="suave">{ficha.rede.mensagem ?? ''}</div>
          </div>
          <div className="grade2">
            <div className="card2"><div className="suave" style={{ fontSize: 11 }}>Sessão</div><div className="forte" style={{ fontSize: 15 }}>{sessaoAtual ? 'Ativa' : 'Sem sessão'}</div><div className="suave" style={{ fontSize: 11 }}>{sessaoAtual ? `desde ${dataHora(sessaoAtual.inicio)}` : ficha.rede.ultima_queda ? `caiu ${dataHora(ficha.rede.ultima_queda)}` : '—'}</div></div>
            <div className="card2"><div className="suave" style={{ fontSize: 11 }}>Plano</div><div className="forte" style={{ fontSize: 15 }}>{plano(ficha.contrato.plano)}</div><div className="suave" style={{ fontSize: 11 }}>{ficha.contrato.pop ?? ''}</div></div>
          </div>
          <div className="card2 grade2" style={{ gap: '10px 12px' }}>
            <div><div className="suave" style={{ fontSize: 11 }}>Concentrador (NAS)</div><div className="mono">{sessaoAtual?.nas ?? ficha.rede.sessoes[0]?.nas ?? '—'}</div></div>
            <div><div className="suave" style={{ fontSize: 11 }}>IP da sessão</div><div className="mono">{sessaoAtual?.ip ?? '—'}</div></div>
            <div><div className="suave" style={{ fontSize: 11 }}>Login PPPoE</div><div className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ficha.rede.login ?? '—'}</div></div>
            <div><div className="suave" style={{ fontSize: 11 }}>Última queda</div><div>{dataHora(ficha.rede.ultima_queda)}</div></div>
          </div>
          {ficha.rede.sessoes.length > 0 && <>
            <div className="rotulo">Últimas sessões</div>
            <div className="card2" style={{ padding: '4px 12px' }}>
              {ficha.rede.sessoes.slice(0, 6).map((s, i) => (
                <div className="item" key={i}><span>{dataHora(s.inicio)} → {s.fim ? dataHora(s.fim) : 'agora'}</span><span className="suave">{s.causa ?? ''}</span></div>
              ))}
            </div>
          </>}
        </>}

        {/* ATENDIMENTO */}
        {atual === 'atendimento' && <>
          <button className="btn prim" disabled title="Em breve">Abrir chamado</button>
          <div className="rotulo">Chamados nos últimos 90 dias</div>
          {!ficha.atendimento.consultado && <div className="aviso">Os chamados não puderam ser consultados agora.</div>}
          {ficha.atendimento.consultado && ficha.atendimento.chamados.length === 0 && <div className="aviso">Nenhum chamado nos últimos 90 dias.</div>}
          {ficha.atendimento.chamados.map((c, i) => (
            <div className="card2" key={c.numero ?? i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="linha" style={{ justifyContent: 'space-between' }}>
                <span className="forte" style={{ fontWeight: 600 }}>{c.tipo ?? 'Chamado'}</span>
                <span className={`chip${/encerr|finaliz|resolv|conclu/i.test(c.status ?? '') ? ' ok' : ''}`}>{c.status ?? '—'}</span>
              </div>
              <div className="suave">Protocolo <span className="mono" style={{ color: 'var(--texto)' }}>{c.numero ?? '—'}</span> · {dataHora(c.aberto_em)}</div>
              {c.resumo && <div style={{ fontSize: 13, color: '#CFD0EA' }}>{c.resumo}</div>}
              {c.ordens_servico.length > 0 && <div className="suave">OS: {c.ordens_servico.map((o) => `${o.id}${o.status ? ` (${o.status})` : ''}`).join(', ')}</div>}
            </div>
          ))}
        </>}

        {/* HISTÓRICO */}
        {atual === 'historico' && <div>
          {historico.length === 0 && <div className="aviso">Sem eventos registrados ainda.</div>}
          {historico.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
                <span className="bolinha" style={{ width: 10, height: 10, marginTop: 5, background: e.cor }} />
                <span style={{ flexGrow: 1, width: 2, background: 'var(--borda)', marginTop: 4 }} />
              </div>
              <div style={{ paddingBottom: 16, minWidth: 0 }}>
                <div className="suave">{dataHora(e.quando)} · {e.origem}</div>
                <div className="forte" style={{ fontWeight: 600 }}>{e.titulo}</div>
                {e.detalhe && <div style={{ fontSize: 13, color: '#CFD0EA' }}>{e.detalhe}</div>}
              </div>
            </div>
          ))}
        </div>}
      </div>

      <div className="rodape">
        <span>Dados do SGP · {dataHora(ficha.gerado_em)}</span>
        <span>{atendente} · <a href="#" onClick={async (e) => { e.preventDefault(); await fetch('/api/sair', { method: 'POST' }); window.location.href = '/entrar' }}>Sair</a></span>
      </div>
      {aviso && <div className="toast">{aviso}</div>}
    </div>
  )
}
