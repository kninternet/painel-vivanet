import 'server-only'
import { chatwootDb, gatewayDb } from './bancos'

/* Regras (as mesmas do script ~/analise/analise-dia.sh):
 * - transferida: tem a nota "🤖 Transbordo da IA"
 * - resolvida pelo Vitor: o Vitor respondeu, sem transferência e sem mensagem da equipe
 *   (com ação: mandou boleto, PIX, e-mail ou concluiu cadastro; senão, só conversa)
 * - encerrada automaticamente: tem a nota "Conversa encerrada automaticamente"
 * - departamento: pelas etiquetas (suporte, financeiro; o resto é atendimento)
 * - expediente (mensagens): seg a sex 9h-22h; sábado 9h-16h; domingo e feriados sem atendimento humano
 */
const SUPORTE = ['sem_conexao', 'internet_lenta', 'outros_conexao', 'troca_de_roteador', 'troca_de_senha']
const FINANCEIRO = ['baixa_pagamento', 'liberacao_internet', 'outros_financeiro', 'pagamentos']
const ACAO = '000201|linha digit[aá]vel|boleto\\.vivanettelecom|enviei (sua|suas)|cadastro (foi )?(recebido|realizado|conclu)'
const FORA = /contesta|negocia|desconto|cancel|titularidade|mudan[cç]a de (plano|endere)|vencimento|liberac|sem conex|atendente/i
const PODIA: [string, RegExp][] = [
  ['Cliente não reconhece a cobrança', /n[aã]o reconhe|transi|migra|antiga|substitu|indevid/i],
  ['Cobertura', /cobertura|cep/i],
  ['Cadastro (CNPJ e afins)', /cadastr|cnpj/i],
  ['Vários contratos', /mais de um contrato|v[aá]rios contratos/i],
  ['Fatura e 2ª via', /fatura|boleto|2.? ?via|segunda via|pix|pagamento/i],
  ['Titular não confirmado', /titular n[aã]o confirmado/i],
]
const FERIADOS = new Set(['2026-01-01', '2026-02-17', '2026-04-03', '2026-04-21', '2026-04-23', '2026-05-01', '2026-09-07', '2026-10-12', '2026-11-02',
  '2026-11-15', '2026-11-20', '2026-12-25', '2027-01-01', '2027-02-09', '2027-03-26', '2027-04-21', '2027-04-23', '2027-05-01', '2027-09-07',
  '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25'])
const ROTAS: Record<string, string> = {
  '/v1/identificar': 'Identificações', '/v1/faturas': 'Consultas de faturas', '/v1/cobertura': 'Verificações de cobertura',
  '/v1/segunda-via': '2ª via de boleto', '/v1/pix': 'Código PIX', '/v1/email/fatura': 'Fatura por e-mail',
  '/v1/email/lista': 'Faturas por e-mail', '/v1/cadastro': 'Cadastros no CRM',
}

export interface Filtros { de: string; ate: string; canal: string; departamento: string }

const sp = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(d).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24, semana: p.weekday as string }
}
// Atendimento humano por mensagens: seg a sex 9h-22h; sábado 9h-16h; domingo e feriados sem atendimento humano.
const HORARIO: Record<string, [number, number] | null> = { Sun: null, Mon: [9, 22], Tue: [9, 22], Wed: [9, 22], Thu: [9, 22], Fri: [9, 22], Sat: [9, 16] }
const noExpediente = (d: Date) => {
  const { dia, hora, semana } = sp(d)
  const j = FERIADOS.has(dia) ? null : HORARIO[semana]
  return !!j && hora >= j[0] && hora < j[1]
}
const mediana = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const min = (a: Date | null, b: Date | null) => (a && b ? (b.getTime() - a.getTime()) / 60000 : null)

export async function relatorio(f: Filtros) {
  const ini = new Date(`${f.de}T00:00:00-03:00`)
  const fim = new Date(new Date(`${f.ate}T00:00:00-03:00`).getTime() + 86_400_000)
  const cw = chatwootDb()

  const { rows: todas } = await cw.query(
    `WITH conv AS (
       SELECT c.id, c.display_id, c.status, c.created_at,
              CASE i.channel_type WHEN 'Channel::WebWidget' THEN 'site' WHEN 'Channel::Whatsapp' THEN 'whatsapp'
                   WHEN 'Channel::Telegram' THEN 'telegram' WHEN 'Channel::Email' THEN 'email' ELSE 'outro' END AS canal,
              COALESCE(et.nomes, '{}') AS etiquetas
         FROM conversations c JOIN inboxes i ON i.id = c.inbox_id
         LEFT JOIN LATERAL (SELECT array_agg(t.name) AS nomes FROM taggings tg JOIN tags t ON t.id = tg.tag_id
                             WHERE tg.taggable_type = 'Conversation' AND tg.taggable_id = c.id AND tg.context = 'labels') et ON true
        WHERE c.account_id = 1 AND c.created_at >= $1 AND c.created_at < $2)
     SELECT conv.*, tr.created_at AS transf_em, tr.content AS transf_nota, hu.primeira AS humano_pos,
            (SELECT min(m.created_at) FROM messages m WHERE m.conversation_id = conv.id AND m.message_type = 0) AS primeira_entrada,
            (SELECT min(m.created_at) FROM messages m WHERE m.conversation_id = conv.id AND m.message_type = 1 AND NOT m.private) AS primeira_saida,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = conv.id AND m.message_type = 1 AND NOT m.private AND m.sender_type = 'AgentBot') AS msg_vitor,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = conv.id AND m.message_type = 1 AND NOT m.private AND m.sender_type = 'User') AS msg_equipe,
            EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conv.id AND m.message_type = 1 AND NOT m.private AND m.sender_type = 'AgentBot' AND m.content ~* $3) AS acao,
            EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conv.id AND m.private AND m.content LIKE 'Conversa encerrada automaticamente%') AS auto,
            (SELECT re.value FROM reporting_events re WHERE re.conversation_id = conv.id AND re.name = 'conversation_resolved' ORDER BY re.created_at DESC LIMIT 1) AS resolucao_s
       FROM conv
       LEFT JOIN LATERAL (SELECT m.created_at, m.content FROM messages m WHERE m.conversation_id = conv.id AND m.private
                           AND m.content LIKE '🤖 Transbordo da IA%' ORDER BY m.created_at LIMIT 1) tr ON true
       LEFT JOIN LATERAL (SELECT min(m.created_at) AS primeira FROM messages m WHERE m.conversation_id = conv.id AND m.message_type = 1
                           AND NOT m.private AND m.sender_type = 'User' AND tr.created_at IS NOT NULL AND m.created_at > tr.created_at) hu ON true`,
    [ini, fim, ACAO])

  const dep = (e: string[]) => (e.some((x) => SUPORTE.includes(x)) ? 'suporte' : e.some((x) => FINANCEIRO.includes(x)) ? 'financeiro' : 'atendimento')
  const conv = todas.map((r) => ({ ...r, departamento: dep(r.etiquetas) }))
    .filter((r) => (f.canal === 'todos' || r.canal === f.canal) && (f.departamento === 'todos' || r.departamento === f.departamento))

  const transf = conv.filter((r) => r.transf_em)
  const vitor = conv.filter((r) => !r.transf_em && r.msg_vitor > 0 && r.msg_equipe === 0)
  const semResp = transf.filter((r) => !r.humano_pos)
  const resolvidas = conv.filter((r) => r.status === 1)
  const n = conv.length || 1

  // Por dia e por hora (horário de Brasília)
  const porDia = new Map<string, { dia: string; vitor: number; equipe: number }>()
  for (let t = ini.getTime(); t < fim.getTime(); t += 86_400_000) { const d = sp(new Date(t + 3_600_000)).dia; porDia.set(d, { dia: d, vitor: 0, equipe: 0 }) }
  const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, conversas: 0 }))
  for (const r of conv) {
    const { dia, hora } = sp(r.created_at); porHora[hora].conversas++
    const d = porDia.get(dia); if (!d) continue
    if (vitor.includes(r)) d.vitor++; else if (r.transf_em || r.msg_equipe > 0) d.equipe++
  }

  // Motivos de transferência e o que o Vitor poderia ter resolvido (com as conversas)
  const motivos = new Map<string, number[]>()
  const podia = new Map<string, number[]>()
  for (const r of transf) {
    const m = String(r.transf_nota).replace('🤖 Transbordo da IA:', '').trim().replace(/\s+/g, ' ').slice(0, 70) || '(sem motivo)'
    const chave = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()
    motivos.set(chave, [...(motivos.get(chave) ?? []), r.display_id])
    if (!FORA.test(m) || /n[aã]o reconhe|titular n[aã]o confirmado/i.test(m)) {
      const cat = PODIA.find(([, rx]) => rx.test(m)); if (cat) podia.set(cat[0], [...(podia.get(cat[0]) ?? []), r.display_id])
    }
  }
  const etiquetas = new Map<string, number>()
  conv.forEach((r) => r.etiquetas.forEach((e: string) => etiquetas.set(e, (etiquetas.get(e) ?? 0) + 1)))

  // Por atendente (conversas do recorte em que a pessoa respondeu)
  const ids = conv.map((r) => r.id)
  const { rows: atend } = ids.length ? await cw.query(
    `SELECT u.name AS atendente, count(DISTINCT m.conversation_id)::int AS conversas,
            (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY re.value) FROM reporting_events re
              WHERE re.user_id = u.id AND re.name = 'first_response' AND re.conversation_id = ANY($1)) AS primeira_s,
            (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY re.value) FROM reporting_events re
              WHERE re.user_id = u.id AND re.name = 'conversation_resolved' AND re.conversation_id = ANY($1)) AS resolucao_s
       FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ANY($1) AND m.sender_type = 'User' AND m.message_type = 1 AND NOT m.private
      GROUP BY u.id, u.name ORDER BY conversas DESC`, [ids]) : { rows: [] }

  // Ações do Vitor no gateway (todos os canais do Vitor; o gateway não sabe o canal do Chatwoot)
  let acoes: { acao: string; total: number }[] = []
  try {
    const { rows } = await gatewayDb().query(
      `SELECT a.rota, count(*)::int AS total FROM gateway.auditoria a JOIN gateway.canais c ON c.id = a.canal_id
        WHERE a.tenant_id = 'vivanet' AND c.nome IN ('webchat', 'whatsapp') AND a.status < 400 AND a.ts >= $1 AND a.ts < $2
        GROUP BY a.rota ORDER BY total DESC`, [ini, fim])
    acoes = rows.filter((r) => ROTAS[r.rota]).map((r) => ({ acao: ROTAS[r.rota], total: r.total }))
  } catch { acoes = [] }

  return {
    filtros: f,
    geral: {
      conversas: conv.length,
      primeira_resposta_min: mediana(conv.map((r) => min(r.primeira_entrada, r.primeira_saida)).filter((x): x is number => x !== null && x >= 0)),
      resolucao_min: mediana(resolvidas.filter((r) => !r.auto && r.resolucao_s).map((r) => Number(r.resolucao_s) / 60)),
      taxa_resolucao: resolvidas.length / n,
      taxa_sem_auto: resolvidas.filter((r) => !r.auto).length / n,
    },
    vitor: {
      sem_atendente: vitor.length, pct_sem_atendente: vitor.length / n,
      com_acao: vitor.filter((r) => r.acao).length, so_conversa: vitor.filter((r) => !r.acao).length,
      transferidas: transf.length,
      min_ate_transferir: mediana(transf.map((r) => min(r.primeira_entrada, r.transf_em)).filter((x): x is number => x !== null && x >= 0)),
      acoes,
    },
    equipe: {
      espera_min: mediana(transf.map((r) => min(r.transf_em, r.humano_pos)).filter((x): x is number => x !== null)),
      sem_resposta: semResp.map((r) => r.display_id),
      fora_expediente: transf.filter((r) => !noExpediente(r.transf_em)).length,
      atendentes: atend.map((a) => ({ atendente: a.atendente, conversas: a.conversas,
        primeira_resposta_min: a.primeira_s === null ? null : Number(a.primeira_s) / 60, resolucao_min: a.resolucao_s === null ? null : Number(a.resolucao_s) / 60 })),
    },
    por_dia: [...porDia.values()],
    por_hora: porHora,
    motivos: [...motivos].map(([motivo, c]) => ({ motivo, total: c.length, conversas: c })).sort((a, b) => b.total - a.total).slice(0, 12),
    podia: [...podia].map(([categoria, c]) => ({ categoria, total: c.length, conversas: c })).sort((a, b) => b.total - a.total),
    etiquetas: [...etiquetas].map(([etiqueta, total]) => ({ etiqueta, total })).sort((a, b) => b.total - a.total).slice(0, 12),
  }
}
