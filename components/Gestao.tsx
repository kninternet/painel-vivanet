'use client'
import { useCallback, useEffect, useState } from 'react'

type Lista = { conversas: number[]; total: number }
interface Relatorio {
  geral: { conversas: number; primeira_resposta_min: number | null; resolucao_min: number | null; taxa_resolucao: number; taxa_sem_auto: number }
  vitor: { sem_atendente: number; pct_sem_atendente: number; com_acao: number; so_conversa: number; transferidas: number; min_ate_transferir: number | null; acoes: { acao: string; total: number }[] }
  equipe: { espera_min: number | null; sem_resposta: number[]; fora_expediente: number; atendentes: { atendente: string; conversas: number; primeira_resposta_min: number | null; resolucao_min: number | null }[] }
  por_dia: { dia: string; vitor: number; equipe: number }[]
  por_hora: { hora: number; conversas: number }[]
  motivos: ({ motivo: string } & Lista)[]
  podia: ({ categoria: string } & Lista)[]
  etiquetas: { etiqueta: string; total: number }[]
}

const CHAT = 'https://chat.vivanettelecom.com.br/app/accounts/1/conversations/'
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const menos = (iso: string, dias: number) => new Date(Date.parse(iso + 'T12:00:00Z') - dias * 86_400_000).toISOString().slice(0, 10)
const num = (n: number) => n.toLocaleString('pt-BR')
const pct = (x: number) => `${Math.round(x * 100)}%`
const tempo = (m: number | null) => {
  if (m === null || !isFinite(m)) return '—'
  if (m < 60) return `${(Math.round(m * 10) / 10).toString().replace('.', ',')} min`
  const h = Math.floor(m / 60), r = Math.round(m % 60)
  return `${h}h${r ? ` ${r}min` : ''}`
}
const Links = ({ ids, max = 15 }: { ids: number[]; max?: number }) => (
  <span className="g-links">{ids.slice(0, max).map((id) => <a key={id} href={CHAT + id} target="_blank" rel="noopener">#{id}</a>)}{ids.length > max && <span className="suave"> +{ids.length - max}</span>}</span>
)

function Barras({ dados, cor = 'var(--indigo)' }: { dados: { rotulo: string; valor: number; ids?: number[] }[]; cor?: string }) {
  const max = Math.max(1, ...dados.map((d) => d.valor))
  if (!dados.length) return <div className="aviso">Nada no período.</div>
  return <div className="g-barras">{dados.map((d) => (
    <div className="g-barra" key={d.rotulo}>
      <span className="g-rot" title={d.rotulo}>{d.rotulo}</span>
      <span className="g-trilho"><span style={{ width: `${(d.valor / max) * 100}%`, background: cor }} /></span>
      <span className="g-val">{num(d.valor)}</span>
      {d.ids && <span className="g-ids"><Links ids={d.ids} max={6} /></span>}
    </div>))}</div>
}

function Colunas({ dados, legenda, sombra }: { dados: { rotulo: string; valores: number[] }[]; legenda: [string, string][]; sombra?: (i: number) => boolean }) {
  const max = Math.max(1, ...dados.map((d) => d.valores.reduce((a, b) => a + b, 0)))
  const passo = Math.ceil(dados.length / 12)
  return <div>
    <div className="g-legenda">{legenda.map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}</div>
    <div className="g-colunas">{dados.map((d, i) => (
      <div className={`g-col${sombra?.(i) ? ' sombra' : ''}`} key={d.rotulo} title={`${d.rotulo}: ${d.valores.map((v, k) => `${legenda[k][0]} ${v}`).join(' · ')}`}>
        <div className="g-pilha">{[...d.valores].map((v, k) => <span key={k} style={{ height: `${(v / max) * 100}%`, background: legenda[k][1] }} />).reverse()}</div>
        <span className="g-x">{i % passo === 0 ? d.rotulo : ''}</span>
      </div>))}</div>
  </div>
}

export default function Gestao() {
  const [f, setF] = useState(() => ({ de: menos(hoje(), 6), ate: hoje(), canal: 'todos', departamento: 'todos' }))
  const [r, setR] = useState<Relatorio | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')

  const carregar = useCallback(async () => {
    setEstado('carregando')
    const q = new URLSearchParams(f).toString()
    const resp = await fetch(`/api/gestao?${q}`, { cache: 'no-store' }).catch(() => null)
    if (resp?.status === 401) { window.location.href = '/entrar?voltar=/gestao'; return }
    if (!resp?.ok) { setEstado('erro'); return }
    setR(await resp.json()); setEstado('ok')
  }, [f])
  useEffect(() => { carregar() }, [carregar])

  const muda = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const v = e.target.value; if (v) setF((x) => ({ ...x, [k]: v })) }
  const card = (rot: string, valor: string, sub?: React.ReactNode, ruim = false) => (
    <div className="g-card"><span className="suave">{rot}</span><span className={`g-big${ruim ? ' ruim' : ''}`}>{valor}</span>{sub && <span className="suave g-sub">{sub}</span>}</div>)

  return (
    <main className="g">
      <header className="g-topo">
        <h1>Vitor × Equipe — Viva Net</h1>
        {r && <p className="suave">No período, o Vitor resolveu {pct(r.vitor.pct_sem_atendente)} das conversas sem atendente; {num(r.equipe.sem_resposta.length)} transferências ficaram sem resposta da equipe.</p>}
      </header>

      <div className="g-filtros">
        <label>De<input type="date" value={f.de} max={f.ate} onChange={muda('de')} /></label>
        <label>Até<input type="date" value={f.ate} min={f.de} max={hoje()} onChange={muda('ate')} /></label>
        <label>Canal<select value={f.canal} onChange={muda('canal')}><option value="todos">Todos os canais</option><option value="site">Chat do site</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option><option value="email">E-mail</option></select></label>
        <label>Departamento<select value={f.departamento} onChange={muda('departamento')}><option value="todos">Todos os departamentos</option><option value="atendimento">Atendimento</option><option value="financeiro">Financeiro</option><option value="suporte">Suporte</option></select></label>
        <button className="btn" onClick={() => setF({ de: menos(hoje(), 6), ate: hoje(), canal: 'todos', departamento: 'todos' })}>Últimos 7 dias</button>
        <button className="btn" onClick={() => setF((x) => ({ ...x, de: hoje(), ate: hoje() }))}>Hoje</button>
        {estado === 'carregando' && <span className="suave">Atualizando…</span>}
        {estado === 'erro' && <span style={{ color: 'var(--ruim)' }}>Não foi possível carregar. <button className="btn peq" onClick={carregar}>Tentar de novo</button></span>}
      </div>

      {r && <div className={estado === 'carregando' ? 'g-esmaecido' : ''}>
        <section><h2>Visão geral</h2><div className="g-grade">
          {card('Total de conversas', num(r.geral.conversas), 'Conversas novas no período')}
          {card('Tempo da 1ª resposta', tempo(r.geral.primeira_resposta_min), 'Mediana, do cliente à 1ª resposta')}
          {card('Tempo até resolver', tempo(r.geral.resolucao_min), 'Mediana, sem os encerramentos automáticos')}
          {card('Taxa de resolução', pct(r.geral.taxa_resolucao), <>Sem os encerramentos automáticos: {pct(r.geral.taxa_sem_auto)}</>)}
        </div></section>

        <section><h2>O Vitor</h2><div className="g-grade">
          {card('Resolvidas sem atendente', num(r.vitor.sem_atendente), `${pct(r.vitor.pct_sem_atendente)} das conversas`)}
          {card('Com ação concluída', num(r.vitor.com_acao), '2ª via, PIX, e-mail ou cadastro')}
          {card('Só conversa', num(r.vitor.so_conversa), 'Dúvida respondida, sem ação no sistema')}
          {card('Transferidas', num(r.vitor.transferidas), `Em ${tempo(r.vitor.min_ate_transferir)} (mediana)`)}
        </div>
        <div className="g-grade2">
          <div className="g-card"><h3>Conversas por dia</h3><span className="suave">Resolvidas pelo Vitor e atendidas pela equipe</span>
            <Colunas dados={r.por_dia.map((d) => ({ rotulo: d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7), valores: [d.vitor, d.equipe] }))} legenda={[['Vitor', 'var(--indigo)'], ['Equipe', 'var(--indigo-claro)']]} /></div>
          <div className="g-card"><h3>Ações do Vitor no sistema</h3><span className="suave">O que ele fez de fato no SGP (todos os canais)</span>
            <Barras dados={r.vitor.acoes.map((a) => ({ rotulo: a.acao, valor: a.total }))} /></div>
        </div></section>

        <section><h2>A equipe depois da transferência</h2><div className="g-grade">
          {card('Espera até a 1ª resposta humana', tempo(r.equipe.espera_min), 'Mediana, depois da transferência')}
          {card('Sem resposta da equipe', num(r.equipe.sem_resposta.length), r.equipe.sem_resposta.length ? <Links ids={r.equipe.sem_resposta} max={10} /> : 'Nenhuma no período', r.equipe.sem_resposta.length > 0)}
          {card('Transferidas fora do expediente', num(r.equipe.fora_expediente), 'Seg a sex 9h-22h · sáb 9h-16h · dom e feriados sem equipe')}
        </div>
        <div className="g-grade2">
          <div className="g-card"><h3>Conversas por hora do dia</h3><span className="suave">Faixa sombreada: fora do expediente de dia útil (antes das 9h e depois das 22h)</span>
            <Colunas dados={r.por_hora.map((h) => ({ rotulo: h.hora + 'h', valores: [h.conversas] }))} legenda={[['Conversas', 'var(--indigo)']]} sombra={(i) => i < 9 || i >= 22} /></div>
          <div className="g-card"><h3>Por atendente</h3><span className="suave">Conversas respondidas, 1ª resposta e tempo até resolver (medianas)</span>
            {r.equipe.atendentes.length ? <table className="g-tab"><thead><tr><th>Atendente</th><th className="n">Conversas</th><th className="n">1ª resposta</th><th className="n">Até resolver</th></tr></thead>
              <tbody>{r.equipe.atendentes.map((a) => <tr key={a.atendente}><td>{a.atendente}</td><td className="n">{num(a.conversas)}</td><td className="n">{tempo(a.primeira_resposta_min)}</td><td className="n">{tempo(a.resolucao_min)}</td></tr>)}</tbody></table>
              : <div className="aviso">Nenhum atendimento da equipe no recorte.</div>}</div>
        </div></section>

        <section><h2>Onde automatizar</h2><div className="g-grade2">
          <div className="g-card"><h3>Motivos de transferência</h3><span className="suave">Do mais frequente para o menos, com as conversas</span>
            <Barras dados={r.motivos.map((m) => ({ rotulo: m.motivo, valor: m.total, ids: m.conversas }))} /></div>
          <div className="g-card"><h3>O Vitor poderia ter resolvido</h3><span className="suave">Conversas para conferir, por assunto</span>
            {r.podia.length ? <table className="g-tab"><thead><tr><th>Assunto</th><th className="n">Conversas</th><th>Conversas nº</th></tr></thead>
              <tbody>{r.podia.map((p) => <tr key={p.categoria}><td>{p.categoria}</td><td className="n">{num(p.total)}</td><td><Links ids={p.conversas} max={12} /></td></tr>)}</tbody></table>
              : <div className="aviso">Nada a conferir no período.</div>}
            <h3 style={{ marginTop: 16 }}>Etiquetas</h3>
            <Barras dados={r.etiquetas.map((e) => ({ rotulo: e.etiqueta, valor: e.total }))} cor="var(--indigo-claro)" /></div>
        </div></section>
      </div>}
    </main>
  )
}
